// ── THE STUDIO SIGN-UP DOOR (#1097) ──
// Every buy button on this site, bar the Close page's, is a plain link to the
// studio's /signup: the visitor signs in there, says what to find and picks a
// plan, and only then meets Stripe. The template writes the link's base (the
// studio's /signup, carrying `lang` on a translated page), so with JavaScript
// off the link still opens the right page in the right language.
//
// This file only adds to that query what the page knows and the template does
// not: the website a scan resolved (`data-website`, or the `website` scan.js
// already wrote onto the href), the plan the switch announced, the partner
// programme's referral id, and the utm_* keys this page arrived with. It is
// computed at load, so a hover shows the real target, and again at the press,
// because a scan, a switch or Rewardful can each land in between.
//
// Nothing is written to the device, so there is nothing for consent.js's
// inventory to declare. `via` is never sent: the Close free month belongs to
// the Close page, and the studio's checkout ignores it anyway.
(() => {
  const links = Array.prototype.slice.call(document.querySelectorAll('a[data-signup]'));
  if (!links.length) return;

  const page = new URLSearchParams(location.search);
  const UTM = ['utm_source', 'utm_medium', 'utm_campaign', 'utm_term', 'utm_content'];

  // Monthly is the default and writes nothing, the way English writes no
  // `lang`. A `?plan=year` on this page counts until the switch says otherwise.
  let plan = page.get('plan') === 'year' ? 'year' : 'month';
  const planSwitch = document.getElementById('planSwitch');
  if (planSwitch) planSwitch.addEventListener('plan', e => {
    plan = e.detail === 'year' ? 'year' : 'month';
    links.forEach(write);
  });

  // `Rewardful.referral` exists only where the programme is on AND the visitor
  // allowed marketing (consent.js creates the script inside its gate), so on
  // every other page this adds nothing.
  const referral = () => {
    try { const r = window.Rewardful && window.Rewardful.referral; return r ? String(r) : ''; }
    catch (e) { return ''; }
  };

  function write(link) {
    let to;
    try { to = new URL(link.getAttribute('href'), location.href); }
    catch (e) { return; }
    const q = to.searchParams;
    if (link.dataset.website) q.set('website', link.dataset.website);
    if (plan === 'year') q.set('plan', 'yearly');
    else q.delete('plan');
    const ref = referral();
    if (ref) q.set('referral', ref);
    for (const k of UTM) { const v = page.get(k); if (v) q.set(k, v); }
    q.delete('via');
    link.setAttribute('href', to.href);
  }

  links.forEach(link => {
    write(link);
    // Capture, so the href is final before the browser follows it.
    link.addEventListener('click', () => write(link), true);
  });
})();
