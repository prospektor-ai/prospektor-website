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
// ONE THING THE OPERATOR HAS TO KNOW: the page is BUILT from this variable and
// the function READS it per request, so arming or disarming the offer needs a
// **redeploy**, not just a change in the Netlify dashboard. Setting it and not
// rebuilding grants a free month nobody was offered (harmless, and invisible);
// clearing it and not rebuilding leaves a page promising a month that is no
// longer granted, which is the failure this whole file exists to prevent. Set
// the variable, then trigger a deploy.
const TRIAL_DAYS = 30;

/** The trial to grant a Close arrival, in days — 0 when the offer is dark.
 *  `env` is injectable so a test can arm and disarm it without touching the
 *  process, and so the Eleventy build and the function read the same rule. */
function trialDays(env) {
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

module.exports = { TRIAL_DAYS, trialDays, partnerOf, PARTNERS };
