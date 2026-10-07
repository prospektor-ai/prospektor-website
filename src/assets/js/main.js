// Every section is visible at rest since #1092: the scroll reveal and the
// homepage's animated run card went with the old run model, so a page is
// complete without scrolling (and in a full-page screenshot).

// ── THE MOBILE HEADER (#153) ──
// The nav is hidden under 860px in CSS and this is the only thing that opens
// it. Progressive, in that order: without this script the panel simply stays
// shut, which is where the site was before — no page becomes unreachable,
// because the homepage body and the footer still link everywhere.
const navToggle = document.getElementById('navToggle');
const navLinks = document.getElementById('navLinks');
if (navToggle && navLinks) {
  const setOpen = open => {
    navLinks.classList.toggle('is-open', open);
    navToggle.setAttribute('aria-expanded', String(open));
  };
  navToggle.addEventListener('click', () =>
    setOpen(navToggle.getAttribute('aria-expanded') !== 'true'));
  // A tap outside, Escape, or following a link all close it. The last one
  // matters for the one nav item that is a same-page jump — /#scan on the
  // CTA — where no navigation happens to close the panel for us.
  navLinks.addEventListener('click', e => { if (e.target.closest('a')) setOpen(false); });
  document.addEventListener('keydown', e => { if (e.key === 'Escape') setOpen(false); });
  document.addEventListener('click', e => {
    if (!e.target.closest('nav')) setOpen(false);
  });
}
