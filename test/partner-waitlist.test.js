// The partner waitlist form on /partners/ (#1362), held to the contact form's
// four silent failures (#456): a success page the build writes, the Netlify
// attributes and the form-name in the body, the honeypot rendered, and the
// field list privacy §03 enumerates. It is the dark page's only way in, so a
// form that posts into nothing loses every partner who asked.
const { describe, test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const { siteBuild } = require('./helpers.js');

let site;
before(() => { site = siteBuild('partner-waitlist'); });
after(() => site && site.cleanup());

const read = rel => fs.readFileSync(path.join(site.dir, rel), 'utf8');
const formTag = html => (html.match(/<form\b[^>]*name="partner-waitlist"[^>]*>/s) || [null])[0];

describe('the partner waitlist (#1362)', () => {
  test('the form posts to a page the build actually writes, which is noindex and out of the sitemap', () => {
    const tag = formTag(read('partners/index.html'));
    assert.ok(tag, '/partners/ has no waitlist form');
    const action = (tag.match(/\saction="([^"]+)"/) || [])[1];
    assert.equal(action, '/partners/thanks/');
    const thanks = read('partners/thanks/index.html');
    assert.match(thanks, /<meta name="robots" content="noindex, follow">/);
    assert.ok(!read('sitemap.xml').includes('/partners/thanks/'));
  });

  test('Netlify is told this is a form, which form, and where the honeypot is', () => {
    const html = read('partners/index.html');
    const tag = formTag(html);
    assert.ok(/\snetlify\b|\sdata-netlify="true"/.test(tag));
    assert.match(html, /<input type="hidden" name="form-name" value="partner-waitlist">/);
    const field = (tag.match(/netlify-honeypot="([^"]*)"/) || [])[1];
    assert.ok(field, 'no honeypot declared');
    assert.ok(new RegExp(`<input[^>]*name="${field}"`).test(html), 'the honeypot is declared and never rendered');
  });

  test('the form asks for two things, and the privacy page says so', () => {
    const html = read('partners/index.html');
    const tag = formTag(html);
    const honeypot = (tag.match(/netlify-honeypot="([^"]*)"/) || [])[1];
    const form = html.slice(html.indexOf(tag));
    const named = [...form.slice(0, form.indexOf('</form>')).matchAll(/\sname="([^"]+)"/g)]
      .map(m => m[1]).filter(n => n !== 'form-name' && n !== honeypot && n !== 'partner-waitlist');
    assert.deepEqual([...new Set(named)].sort(), ['email', 'role'],
      'the waitlist form\'s fields changed: privacy §03 enumerates what it collects');
    assert.match(read('privacy/index.html'), /waitlist form at <a href="\/partners\/">/);
  });
});
