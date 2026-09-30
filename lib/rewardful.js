'use strict';
// ── THE PARTNER PROGRAMME, RENTED, AND DARK UNTIL THE OPERATOR SAYS SO (#885) ──
//
// #87 asked where the referral ledger should live. The operator answered on
// 29 Sep 2026: rent Rewardful, and *"put a 'coming soon' notice when I actually
// onboard with them and have customers, rather than beta"*. So the website's
// half is built here and switched off, and one variable is the switch:
//
//   REWARDFUL_API_KEY   Rewardful's site key, the one that goes into
//                       `data-rewardful="…"` on their script tag. It is a
//                       PUBLIC key by Rewardful's own design (it is printed in
//                       every customer's HTML), so serving it in a page is not
//                       a leak; it is still read from the environment rather
//                       than written here, because setting it is #886, the
//                       operator's row, and this repo must not decide it.
//   REWARDFUL_SIGNUP_URL  Where a partner signs up: the affiliate portal
//                       Rewardful gives the campaign. Optional; with the key
//                       set and no URL, /partners/ says to write to us for a
//                       link, which is true.
//
// While the key is absent, NOTHING changes: the build writes no handoff node,
// so `consent.js` declares no Rewardful entry and never loads `rw.js`; the
// checkout function ignores a `referral` a browser might send; `/partners/`
// reads *Coming soon*. `test/rewardful.test.js` proves the dark build and a
// build with a malformed key are byte for byte the same pages.
//
// While the key is set, the script is still not simply served. Rewardful's
// `rw.js` writes a first-party cookie and talks to Rewardful's servers, which
// is a marketing tracker under this site's own consent contract (consent.js,
// #143): it is declared in the inventory, the banner asks, and the script is
// created only inside `gate('marketing', …)`. The referral id it resolves
// (`Rewardful.referral`, a UUID) is read at the moment the buy form is
// submitted, sent as `referral`, and put on the Checkout Session as
// `client_reference_id`, which is how Rewardful's own Stripe integration
// finds the sale (their server-side checkout guide, read 30 Sep 2026: *"only
// be sent when present"*, because Stripe refuses a blank one). It is
// mirrored as `metadata[ref]` so the webhook can hand it to `/api/provision`
// as `ref`, the marker the studio has asked for since 24 Aug (#126).
//
// The commission, the hold, the cookie window and the payout are set inside
// Rewardful, never here; this file carries no rate and no number.

/** The key's shape. Rewardful's keys are short alphanumerics; anything else
 *  is refused so a value nobody vetted can never land inside an HTML
 *  attribute. */
const KEY_RE = /^[A-Za-z0-9_-]{4,64}$/;

/** Stripe's rule for `client_reference_id`: letters, digits, `-` and `_`,
 *  at most 200 characters. A Rewardful referral is a UUID, which fits. An
 *  address, a name, a sentence: none of them pass, which is what makes the
 *  marker a marker and never a person. */
const REFERRAL_RE = /^[A-Za-z0-9_-]{1,200}$/;

/** The Rewardful site key, or '' when the programme is dark. `env` is
 *  injectable so a test can light and darken it without touching the
 *  process, and so the Eleventy build and the functions read one rule. */
function rewardfulKey(env) {
  const raw = String(((env || process.env).REWARDFUL_API_KEY) ?? '').trim();
  if (!raw) return '';
  if (!KEY_RE.test(raw)) {
    console.warn('[rewardful] REWARDFUL_API_KEY is not the shape of a Rewardful key; the programme stays dark.');
    return '';
  }
  return raw;
}

/** Where a partner signs up, or '' when none is set or the value is not an
 *  https URL. Only ever written into an href by the build. */
function signupUrl(env) {
  const raw = String(((env || process.env).REWARDFUL_SIGNUP_URL) ?? '').trim();
  if (!raw) return '';
  try {
    const u = new URL(raw);
    if (u.protocol !== 'https:') throw new Error('not https');
    return u.href;
  } catch (e) {
    console.warn('[rewardful] REWARDFUL_SIGNUP_URL is not an https URL; /partners/ offers the mail address instead.');
    return '';
  }
}

/** A referral marker a browser sent, or '' when it is not one. */
function referralOf(value) {
  // A string, and only a string: the page sends one, and a number or an
  // object in the field is nothing the page would ever send.
  if (typeof value !== 'string') return '';
  const s = value.trim();
  return REFERRAL_RE.test(s) ? s : '';
}

/** Rewardful's script and its one host, named once so the handoff the build
 *  writes, the loader in consent.js and the tests agree on the bytes. */
const SCRIPT_SRC = 'https://r.wdfl.co/rw.js';

module.exports = { rewardfulKey, signupUrl, referralOf, KEY_RE, REFERRAL_RE, SCRIPT_SRC };
