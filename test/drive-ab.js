// The homepage tiles test in a browser (studio #1185). Called from drive.js
// only when the build carries the test, which is when the four photos exist
// (src/_data/abtest.js); until then drive.js prints one skip line. Run it on
// its own against any build that has them:
//
//   node test/drive-ab.js <built-site-dir>
//
// It forces each version by fixing Math.random before the page's first
// script, and holds: the coin is written before anything else runs; the
// version shows its own media and hides the other; the drawing's page views
// never fetch a photo; one `view` beacon per load and at most one of each
// press; and the studio links carry `ab=<version>` at the press.

async function driveAb(browser, base, check) {
  async function open(coin) {
    const page = await browser.newPage();
    const beacons = [], photos = [];
    await page.addInitScript(c => { Math.random = () => c; }, coin);
    await page.route('**/.netlify/functions/ab', route => {
      beacons.push(JSON.parse(route.request().postData()));
      return route.fulfill({ status: 204, body: '' });
    });
    await page.route('https://studio.prospektor.ai/api/scan**', route =>
      route.fulfill({ status: 503, contentType: 'application/json', body: '{}' }));
    await page.route('https://studio.prospektor.ai/**', route =>
      route.fulfill({ status: 200, contentType: 'text/html', body: '<h1>STUDIO</h1>' }));
    page.on('request', r => { if (r.url().includes('/assets/img/tiles/')) photos.push(r.url()); });
    await page.goto(base + '/');
    await page.waitForFunction(() => document.readyState === 'complete');
    await page.waitForTimeout(150);
    return { page, beacons, photos };
  }

  // The photo version.
  {
    const { page, beacons, photos } = await open(0.1);
    check('tiles test: a coin under 0.5 is the photo version', (await page.getAttribute('html', 'data-v')) === 'photo');
    check('tiles test: photo version shows the photo and hides the drawing',
      await page.isVisible('.pphoto img') && !(await page.isVisible('.pvis-1')));
    check('tiles test: one view beacon on load', JSON.stringify(beacons) === JSON.stringify([{ v: 'photo', e: 'view' }]), beacons);

    await page.locator('.pphoto').first().scrollIntoViewIfNeeded();
    await page.waitForTimeout(300);
    check('tiles test: the photo loads once it is near the screen', photos.length >= 1, photos);

    await page.fill('#scanInput', 'acme.com');
    await page.click('#scanBtn');
    await page.fill('#scanInput', 'acme.com');
    await page.click('#scanBtn');
    await page.waitForTimeout(150);
    check('tiles test: a scan is counted once per page view',
      beacons.filter(b => b.e === 'scan').length === 1 && beacons.every(b => b.v === 'photo'), beacons);

    const href = await page.getAttribute('#buyLink', 'href');
    check('tiles test: the sign-up link carries ab=photo', new URL(href).searchParams.get('ab') === 'photo', href);
    await Promise.all([page.waitForURL(/studio\.prospektor\.ai\/signup/), page.click('#buyLink')]);
    const landed = new URL(page.url());
    check('tiles test: a sign-up press is counted and lands with ab=photo',
      beacons.some(b => b.e === 'signup') && landed.searchParams.get('ab') === 'photo', { beacons, url: page.url() });
    await page.close();
  }

  // The drawing version.
  {
    const { page, beacons, photos } = await open(0.9);
    check('tiles test: a coin at 0.5 or over is the drawing version', (await page.getAttribute('html', 'data-v')) === 'draw');
    check('tiles test: drawing version shows the drawing and hides the photo',
      await page.isVisible('.pvis-1') && !(await page.isVisible('.pphoto img')));
    await page.locator('.ptiles').scrollIntoViewIfNeeded();
    await page.waitForTimeout(300);
    check('tiles test: the drawing version never fetches a photo', photos.length === 0, photos);
    await Promise.all([page.waitForURL(/\/demo\/$/), page.click('#scanDemo a')]);
    check('tiles test: a demo press is counted for the drawing version',
      beacons.some(b => b.v === 'draw' && b.e === 'demo'), beacons);
    await page.close();
  }

  // No JavaScript: drawings, no coin, nothing sent.
  {
    const ctx = await browser.newContext({ javaScriptEnabled: false });
    const page = await ctx.newPage();
    let sent = 0;
    await page.route('**/.netlify/functions/ab', route => { sent++; return route.fulfill({ status: 204 }); });
    await page.goto(base + '/');
    check('tiles test: with JavaScript off, the drawings and no coin',
      (await page.getAttribute('html', 'data-v')) === null && await page.isVisible('.pvis-1') && !(await page.isVisible('.pphoto img')) && sent === 0);
    await ctx.close();
  }
}

module.exports = { driveAb };

if (require.main === module) {
  const CHROME = process.env.CHROME_PATH || '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';
  let chromium;
  try { ({ chromium } = require('playwright')); }
  catch (e) { ({ chromium } = require('/opt/node22/lib/node_modules/playwright')); }
  const { serve } = require('./serve');
  const dir = process.argv[2];
  if (!dir) { console.error('usage: node test/drive-ab.js <built-site-dir>'); process.exit(2); }
  let pass = 0, fail = 0;
  const check = (n, c, x) => { if (c) { pass++; console.log('  ok  ', n); } else { fail++; console.log('  FAIL', n, x !== undefined ? JSON.stringify(x) : ''); } };
  (async () => {
    const server = await serve(dir, 8898);
    const browser = await chromium.launch({ executablePath: CHROME });
    try { await driveAb(browser, 'http://localhost:8898', check); }
    catch (err) { fail++; console.log('  FAIL tiles test drive crashed:', err.message); }
    await browser.close();
    server.close();
    console.log('\n' + pass + ' passed, ' + fail + ' failed');
    process.exit(fail ? 1 : 0);
  })();
}
