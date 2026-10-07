// ── THE TILES TEST'S COUNTER (studio #1185) ──
// Loaded only on the homepage, and only once src/_data/abtest.js has found
// the four photos. The inline line in <head> already tossed the coin and wrote
// it to <html data-v>; this file says which version this page view saw, and
// what the visitor did next, to netlify/functions/ab.js as daily totals.
//
// What leaves the browser is the body `{"v":"photo","e":"scan"}` and nothing
// else: no id, no cookie, no storage of any kind, so there is nothing for
// consent.js's inventory to declare. Each event goes at most once per page
// view, so a page view is the unit and the report's rates are proportions.
//
// It also adds `ab=<version>` to the links into the studio's sign-up and free
// run, so the studio could attribute a sign-up later. Today the studio ignores
// the parameter (it reads only the keys it knows).
(() => {
  const v = document.documentElement.dataset.v;
  if (v !== 'draw' && v !== 'photo') return;

  const ENDPOINT = '/.netlify/functions/ab';
  const STUDIO = 'studio.prospektor.ai';
  const sent = new Set();

  function send(e) {
    if (sent.has(e)) return;
    sent.add(e);
    try {
      if (navigator.sendBeacon) navigator.sendBeacon(ENDPOINT, JSON.stringify({ v, e }));
    } catch (err) { /* a lost count, never a broken page */ }
  }

  // The studio's sign-up and free run: tag the link with the version.
  function tag(link) {
    let to;
    try { to = new URL(link.getAttribute('href'), location.href); }
    catch (err) { return; }
    if (to.hostname !== STUDIO) return;
    if (!/^\/(signup|r)\/?$/.test(to.pathname)) return;
    to.searchParams.set('ab', v);
    link.setAttribute('href', to.href);
  }

  // /demo/ in any language: /demo/, /de/demo/, …
  const isDemo = link => {
    try {
      const to = new URL(link.getAttribute('href'), location.href);
      return to.origin === location.origin && /^\/(?:[a-z]{2}\/)?demo\/?$/.test(to.pathname);
    } catch (err) { return false; }
  };

  send('view');

  document.querySelectorAll('a[href]').forEach(tag);

  // Capture on the document, so this runs before signup.js's own capture on
  // the link and before the browser follows it. signup.js keeps every key it
  // does not own, so `ab` survives its rewrite.
  document.addEventListener('click', ev => {
    const link = ev.target && ev.target.closest && ev.target.closest('a[href]');
    if (!link) return;
    tag(link);
    if (link.hasAttribute('data-signup')) send('signup');
    else if (isDemo(link)) send('demo');
  }, true);

  const form = document.getElementById('scanForm');
  const input = document.getElementById('scanInput');
  if (form) form.addEventListener('submit', () => {
    // scan.js ignores an empty field, and so does the count.
    if (!input || input.value.trim()) send('scan');
  });
})();
