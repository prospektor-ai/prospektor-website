'use strict';
// ── THE CLOSE OFFER: ONE NUMBER, AND THE PAGE CANNOT DISAGREE WITH THE CHARGE ──
//
// #622, out of #621. A visitor who arrives from Close's integration directory
// gets the first month free with a card on file, converting to $999/month
// unless they cancel. Operator's decision, 10 Sep 2026.
//
// It ships DARK: with `CLOSE_TRIAL_DAYS` unset there is no trial, no offer
// block on /integrations/close/, and the checkout call is byte-identical to
// the one this funnel has always sent — the same posture #31 and #68 shipped
// under. Setting it to `30` arms both halves at the next deploy.
//
// WHY THE ENV VAR CANNOT SET THE NUMBER, only arm it. `CLAUDE.md`'s one
// condition that survives whatever else flips is that a published sentence is
// never false, and the page says *cancel any time in the first 30 days and you
// are not charged*. An env var that could say `14` would falsify that sentence
// from a dashboard, silently, with no deploy and nothing red. So `TRIAL_DAYS`
// is written HERE, in the repo, beside the copy that quotes it — and the env
// var is a switch whose only accepted value is that same number. Anything else
// is refused and logged, which fails in the one safe direction: no trial, no
// offer, list price, exactly as today.
//
// The build reads this through `src/_data/offer.js` (which decides whether the
// offer block on the page is written at all) and the checkout function reads it
// directly. One module, so the sentence and the `trial_period_days` that makes
// it true can never come from two places.
//
// ONE THING THE OPERATOR HAS TO KNOW: the page is BUILT from these two and the
// function READS them per request, so arming or disarming the offer needs a
// **redeploy**, not just a change in the Netlify dashboard. Setting the
// variable and not rebuilding grants a free month nobody was offered (harmless,
// and invisible); clearing it and not rebuilding leaves a page promising a
// month that is no longer granted, which is the failure this whole file exists
// to prevent.
const TRIAL_DAYS = 30;

// ── THE SECOND SWITCH, AND WHY IT IS IN THE REPO RATHER THAN THE DASHBOARD ──
//
// Ship-dark normally gives two switches: the code lands, and then somebody
// deliberately arms it. That is what #31 and #68 shipped under, and it is what
// this file was written for. **It did not hold here.** The operator set
// `CLOSE_TRIAL_DAYS=30` on the website's Netlify site at 22:55 on 10 Sep,
// before the code that reads it existed — harmless while nothing read it, and
// the moment this code deployed the offer armed itself with no second step.
// The first buyer after that deploy would have got a live 30-day trial on a
// path nobody has exercised end to end.
//
// So the second switch is HERE, where an env var set in advance cannot
// pre-empt it. `PROVEN` stays false until somebody has run a real test-mode
// trial and watched all three halves of what the page promises:
//
//   1. the workspace provisions from a trial checkout;
//   2. cancelling inside the window bills nothing;
//   3. day 31 charges $999.
//
// That is board row **#625**, and flipping this constant is the whole of what
// it unblocks — one line, one commit, and the offer the page already knows how
// to state goes live with it. Until then the page states nothing and the
// checkout grants nothing, which is the posture the offer should have shipped
// in and did not.
//
// The page is deliberately NOT held back with it: `/integrations/close/` is
// what Close's listing form needs, and an unshipped page costs a day on that
// listing where an unverified live trial costs a customer and a chargeback.
// PROOF BRANCH ONLY (#625) — flipped true on `close-trial-proof` so the deploy
// preview states and grants the offer for one real test-mode run. Do NOT merge
// this line to `main` until all three proofs above have been watched.
const PROVEN = true;

/** The trial to grant a Close arrival, in days — 0 when the offer is dark.
 *  `env` is injectable so a test can arm and disarm it without touching the
 *  process, and so the Eleventy build and the function read the same rule. */
function trialDays(env) {
  if (!PROVEN) return 0;
  const raw = String(((env || process.env).CLOSE_TRIAL_DAYS) ?? '').trim();
  if (!raw) return 0;
  if (raw !== String(TRIAL_DAYS)) {
    console.warn(`[trial] CLOSE_TRIAL_DAYS is ${JSON.stringify(raw)}, and the published offer says ` +
      `${TRIAL_DAYS} days — no trial granted. Set it to ${TRIAL_DAYS}, or change the copy first.`);
    return 0;
  }
  return TRIAL_DAYS;
}

/** The one arrival the offer is stated to, whitelisted the way `planOf`
 *  whitelists a plan: anything else is nobody, and nobody gets a trial. The
 *  marker also rides into Stripe's metadata whether or not a trial is armed,
 *  because that is what makes the directory's traffic countable on a site
 *  that runs no analytics at all. */
const PARTNERS = ['close'];
const partnerOf = value => {
  const name = String(value == null ? '' : value).trim().toLowerCase();
  return PARTNERS.indexOf(name) >= 0 ? name : '';
};

module.exports = { TRIAL_DAYS, PROVEN, trialDays, partnerOf, PARTNERS };

// Branch deploy trigger for #625 — enabling branch deploys does not retro-build.
// Rebuild after the branch-deploy Stripe test keys were set (#625).
