// The cause of a Stripe failure travels now, and one thing never travels with
// it (#684, out of #676).
//
// #676 cost six hours and two wrong theories because every surface the
// operator could reach reported an *absence*: `billing-action` put the Stripe
// message in `console.error` and returned a fixed 502 body, and the webhook's
// customer lookup returned the same empty string for "Stripe refused" as for
// "this customer has no address". These guard the two rules that fix both.
const { test, describe } = require('node:test');
const assert = require('node:assert');
const { redactKeys, worthRetrying } = require('../lib/stripe-error');

describe('redactKeys', () => {
  test('a masked key in a 403 is still a key, and does not leave the function', () => {
    // The shape #676 actually hit: Stripe names the key it refused.
    const said = "The provided key 'sk_live_51H****************abcd' does not have the "
      + 'required permissions for this endpoint.';
    const out = redactKeys(said);
    assert.ok(!out.includes('sk_live'), 'the key is gone');
    assert.match(out, /\[redacted key\]/);
    assert.match(out, /does not have the required permissions/, 'and the useful half survives');
  });

  test('every prefix Stripe issues, and an Authorization header if one ever leaks', () => {
    for (const key of ['sk_test_abc123', 'rk_live_abc123', 'pk_live_abc123', 'whsec_abc123']) {
      assert.ok(!redactKeys(`used ${key} here`).includes(key), `${key} survives redaction`);
    }
    assert.equal(redactKeys('Authorization: Bearer sk_test_abc'), 'Authorization: Bearer [redacted]');
  });

  test('object ids are NOT redacted — they are what makes a log line actionable', () => {
    const out = redactKeys('Stripe GET /customers/cus_9 answered 403 for sub_1 on in_42');
    assert.match(out, /cus_9/);
    assert.match(out, /sub_1/);
    assert.match(out, /in_42/);
  });

  test('nothing in, empty string out — never the word undefined', () => {
    assert.equal(redactKeys(undefined), '');
    assert.equal(redactKeys(null), '');
  });
});

describe('worthRetrying', () => {
  test('a refused read is retried, because the fix is a dashboard change away', () => {
    // #676's own failure: a restricted key without the customers permission.
    // The very same delivery succeeds once somebody widens the key.
    assert.equal(worthRetrying(403), true);
    assert.equal(worthRetrying(401), true);
    assert.equal(worthRetrying(429), true);
    assert.equal(worthRetrying(500), true);
    assert.equal(worthRetrying(503), true);
  });

  test('a 404 is an answer, not a failure — it must stay un-retried', () => {
    // The half that keeps the existing behaviour honest: a customer Stripe
    // does not have is not going to appear, so re-delivering for ever buys
    // nothing. `stripe-webhook.test.js` pins the same rule end to end.
    assert.equal(worthRetrying(404), false);
    assert.equal(worthRetrying(400), false);
    assert.equal(worthRetrying(402), false);
  });

  test('a transport error told us nothing, so it is worth asking again', () => {
    assert.equal(worthRetrying(null), true);
    assert.equal(worthRetrying(undefined), true);
  });
});
