'use strict';
// ── WHAT A STRIPE FAILURE MAY SAY, AND THE ONE THING IT MUST NEVER SAY ──
//
// #684, out of #676. Two functions here threw away the cause of a Stripe
// failure and then logged a sentence that blamed something else. #676 cost six
// hours and two wrong theories for exactly that reason: every surface the
// operator could reach reported an *absence*, and the one-line answer was
// sitting in a Stripe response body nobody kept.
//
// So the cause travels now. This module is the two rules that make that safe
// and useful, in one place because both functions need both.
//
// THE GUARD. Stripe's 403 embeds the key it refused, masked — and a masked key
// is still a key-shaped string that must not reach a log line somebody pastes
// into a board row, let alone a customer. So anything key-shaped is redacted
// before it leaves a function. It is done here rather than at each call site
// because a redaction that has to be remembered is a redaction that will be
// forgotten.
//
// THE DISCRIMINATOR. `worthRetrying` separates "Stripe could not be asked"
// from "Stripe answered, and the answer is no". That distinction is the whole
// of the webhook half of this row: a 403 on a customer read used to be
// indistinguishable from a customer who genuinely has no address, and the
// webhook answered 200 to both — which tells Stripe never to re-deliver, so
// the event was gone for good.

// The four key prefixes Stripe issues. Deliberately NOT `cus_`, `sub_`, `in_`
// or any other object id: those are not secret, they are exactly what makes a
// log line actionable, and redacting them would trade this row's benefit away
// for nothing.
const KEYISH = /\b(?:sk|rk|pk|whsec)_[A-Za-z0-9_*]{2,}/gi;
const BEARER = /\bBearer\s+\S+/gi;

/** Whatever Stripe said, with anything key-shaped taken out of it. */
function redactKeys(text) {
  return String(text == null ? '' : text)
    .replace(BEARER, 'Bearer [redacted]')
    .replace(KEYISH, '[redacted key]');
}

/*
 * Statuses that mean "ask again once somebody fixes this", as opposed to
 * "this will answer the same way for ever".
 *
 * 401/403 are the case #676 hit: a restricted key without the permission it
 * needs. The fix is a dashboard change, after which the very same delivery
 * would succeed — so it must be retried, not acknowledged.
 * 408/409/425/429 and every 5xx are transport, contention and rate limits.
 *
 * A 404 is deliberately absent, and it is the one that keeps this honest: a
 * customer Stripe does not have is not going to appear, so the webhook's
 * existing "acknowledged, not retried for ever" answer is right for it and
 * stays right.
 */
const ASK_AGAIN = new Set([401, 403, 408, 409, 425, 429]);

/** True when a failed Stripe call is worth re-delivering rather than swallowing. */
function worthRetrying(status) {
  // `null` and `undefined` mean the call never produced a status at all — a
  // transport error, a DNS failure, an aborted socket. Checked before the
  // coercion rather than after it, because `Number(null)` is `0`, which is
  // finite, and would have made the one case that certainly deserves a retry
  // the one case that never got one.
  if (status === null || status === undefined || status === '') return true;
  const code = Number(status);
  if (!Number.isFinite(code)) return true;
  return code >= 500 || ASK_AGAIN.has(code);
}

module.exports = { redactKeys, worthRetrying };
