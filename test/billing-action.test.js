// The studio's hand on a subscription (studio queue #29). What these guard:
// the door is the shared secret and nothing reaches Stripe before it is
// checked; every non-canceled subscription behind the address is acted on,
// across every customer that address has minted (a re-subscribe can leave
// two); pause is pause_collection:'void', resume only unpauses, cancel
// deletes; and a Stripe failure is a loud 502, never a quiet half-answer.
const { test, describe, beforeEach } = require('node:test');
const assert = require('node:assert');
const { stubFetch, resetEnv } = require('./helpers');
const fn = require('../netlify/functions/billing-action');

const SECRET = 's'.repeat(40);

const post = (body, secret = SECRET) => fn.handler({
  httpMethod: 'POST',
  headers: secret === null ? {} : { 'x-provision-secret': secret },
  body: JSON.stringify(body),
});

// One address, two customers (each checkout mints one), three subscriptions:
// an active, a paused, and a long-canceled one that must be left alone.
const stripeRoutes = (extra = []) => [
  ['/v1/customers?', { status: 200, body: { data: [{ id: 'cus_1' }, { id: 'cus_2' }] } }],
  ['/v1/subscriptions?customer=cus_1', { status: 200, body: { data: [
    { id: 'sub_active', status: 'active' },
    { id: 'sub_dead', status: 'canceled' },
  ] } }],
  ['/v1/subscriptions?customer=cus_2', { status: 200, body: { data: [
    { id: 'sub_paused', status: 'active', pause_collection: { behavior: 'void' } },
  ] } }],
  ...extra,
  ['/v1/subscriptions/', { status: 200, body: { id: 'sub_x' } }],
];

const acts = calls => calls.filter(c => c.url.includes('/v1/subscriptions/'));

describe('billing-action', () => {
  beforeEach(() => {
    resetEnv();
    process.env.STUDIO_PROVISION_SECRET = SECRET;
    process.env.STRIPE_SECRET_KEY = 'sk_test_x';
  });

  test('the door: 405 on GET, 503 unset or short, 403 wrong — and Stripe is never asked first', async () => {
    const calls = stubFetch(stripeRoutes());
    assert.equal((await fn.handler({ httpMethod: 'GET' })).statusCode, 405);

    delete process.env.STUDIO_PROVISION_SECRET;
    assert.equal((await post({ email: 'b@acme.com', action: 'pause' })).statusCode, 503);
    process.env.STUDIO_PROVISION_SECRET = 'short';
    assert.equal((await post({ email: 'b@acme.com', action: 'pause' }, 'short')).statusCode, 503,
      'a weak secret means the door does not exist');
    process.env.STUDIO_PROVISION_SECRET = SECRET;
    assert.equal((await post({ email: 'b@acme.com', action: 'pause' }, 'wrong')).statusCode, 403);
    assert.equal((await post({ email: 'b@acme.com', action: 'pause' }, null)).statusCode, 403);
    assert.equal(calls.length, 0, 'every refusal happened before any Stripe call');
  });

  test('refuses garbage before Stripe: a bad action, a non-address, no key', async () => {
    const calls = stubFetch(stripeRoutes());
    assert.equal((await post({ email: 'b@acme.com', action: 'obliterate' })).statusCode, 400);
    assert.equal((await post({ email: 'not-an-email', action: 'pause' })).statusCode, 400);
    delete process.env.STRIPE_SECRET_KEY;
    assert.equal((await post({ email: 'b@acme.com', action: 'pause' })).statusCode, 503);
    assert.equal(calls.length, 0);
  });

  test('pause voids collection on every live subscription, across customers, skipping the canceled', async () => {
    const calls = stubFetch(stripeRoutes());
    const r = await post({ email: 'B@Acme.com', action: 'pause' });
    assert.equal(r.statusCode, 200);
    const body = JSON.parse(r.body);
    assert.equal(body.matched, 2, 'the active and the already-paused — never the canceled');
    assert.deepEqual(body.subscriptions, ['sub_active', 'sub_paused']);
    const touched = acts(calls);
    assert.ok(touched.every(c => c.method === 'POST' && String(c.body).includes('pause_collection%5Bbehavior%5D=void')),
      'pause is pause_collection, not cancellation');
    assert.ok(!touched.some(c => c.url.includes('sub_dead')), 'the canceled subscription is left alone');
    const customers = calls.find(c => c.url.includes('/v1/customers?'));
    assert.ok(customers.url.includes('email=b%40acme.com'), 'the address is lowercased before Stripe sees it');
  });

  test('resume clears pause_collection on paused subscriptions only', async () => {
    const calls = stubFetch(stripeRoutes());
    const r = await post({ email: 'b@acme.com', action: 'resume' });
    const body = JSON.parse(r.body);
    assert.deepEqual(body.subscriptions, ['sub_paused'], 'an unpaused subscription needs nothing');
    const [touch] = acts(calls);
    assert.equal(touch.method, 'POST');
    assert.equal(String(touch.body), 'pause_collection=', 'an empty value is how Stripe unsets it');
  });

  test('cancel deletes every live subscription', async () => {
    const calls = stubFetch(stripeRoutes());
    const r = await post({ email: 'b@acme.com', action: 'cancel' });
    assert.equal(JSON.parse(r.body).matched, 2);
    assert.ok(acts(calls).every(c => c.method === 'DELETE'));
  });

  test('an address with nothing behind it answers matched 0, calmly', async () => {
    stubFetch([['/v1/customers?', { status: 200, body: { data: [] } }]]);
    const r = await post({ email: 'nobody@acme.com', action: 'cancel' });
    assert.equal(r.statusCode, 200);
    assert.equal(JSON.parse(r.body).matched, 0);
  });

  test('a Stripe failure is a loud 502, so the studio never reports billing stopped when it did not', async () => {
    stubFetch([['/v1/customers?', { status: 500, body: { error: { message: 'boom' } } }]]);
    const r = await post({ email: 'b@acme.com', action: 'pause' });
    assert.equal(r.statusCode, 502);
    assert.match(JSON.parse(r.body).error, /Stripe dashboard/, 'the answer says where to finish the job');
  });

  // #684, out of #676: the 502 used to carry the sentence above and nothing
  // else, so the cause existed only in a Netlify log nobody had opened — six
  // hours and two wrong theories to find a one-line answer.
  test('the 502 carries what Stripe actually said, so the cause is not left in a log', async () => {
    stubFetch([['/v1/customers?', { status: 403, body: { error: {
      message: "The provided key 'sk_live_51H****abcd' does not have the required permissions.",
    } } }]]);
    const r = await post({ email: 'b@acme.com', action: 'pause' });
    const body = JSON.parse(r.body);
    assert.equal(r.statusCode, 502);
    assert.match(body.cause, /does not have the required permissions/, 'the cause travels');
    assert.match(body.cause, /answered 403/, 'with the status that produced it');
    assert.match(body.cause, /\/customers/, 'and the call that failed');
  });

  test('and the key Stripe names in a 403 never leaves this function', async () => {
    stubFetch([['/v1/customers?', { status: 403, body: { error: {
      message: "The provided key 'sk_live_51H****abcd' does not have the required permissions.",
    } } }]]);
    const r = await post({ email: 'b@acme.com', action: 'pause' });
    const body = JSON.parse(r.body);
    assert.ok(!r.body.includes('sk_live'), 'nothing key-shaped in the answer at all');
    assert.match(body.cause, /\[redacted key\]/);
  });

  test('`error` is unchanged, so a studio that has not been redeployed reads exactly what it read before', async () => {
    // The two repos deploy independently and in either order. This is what
    // makes that safe: the old field keeps its bytes and `cause` is additive.
    stubFetch([['/v1/customers?', { status: 500, body: { error: { message: 'boom' } } }]]);
    const r = await post({ email: 'b@acme.com', action: 'pause' });
    assert.equal(JSON.parse(r.body).error,
      'Stripe could not be asked. Finish this in the Stripe dashboard');
  });

  // studio #686: the hosted portal. Its whole contract is that it reads and
  // never writes a subscription, so the assertions are about what left the
  // process as much as about what came back.
  test('portal mints a Customer Portal session for the customer with the live subscription, and touches nothing', async () => {
    const calls = stubFetch(stripeRoutes([
      ['/v1/billing_portal/sessions', { status: 200, body: { id: 'bps_1', url: 'https://billing.stripe.com/p/session/x' } }],
    ]));
    const r = await post({ email: 'B@Acme.com', action: 'portal', returnUrl: 'https://studio.prospektor.ai/settings/workspace' });
    assert.equal(r.statusCode, 200);
    const body = JSON.parse(r.body);
    assert.equal(body.matched, 1);
    assert.equal(body.url, 'https://billing.stripe.com/p/session/x');
    assert.equal(body.customer, 'cus_1', 'the customer whose subscription is live, not the first the address minted');
    const minted = calls.find(c => c.url.includes('/v1/billing_portal/sessions'));
    assert.equal(minted.method, 'POST');
    assert.ok(String(minted.body).includes('customer=cus_1'));
    assert.ok(String(minted.body).includes('return_url=https%3A%2F%2Fstudio.prospektor.ai%2Fsettings%2Fworkspace'));
    assert.equal(acts(calls).length, 0, 'no subscription was written');
  });

  test('portal with nothing live behind the address answers matched 0 and mints nothing', async () => {
    const calls = stubFetch([
      ['/v1/customers?', { status: 200, body: { data: [{ id: 'cus_9' }] } }],
      ['/v1/subscriptions?customer=cus_9', { status: 200, body: { data: [{ id: 'sub_dead', status: 'canceled' }] } }],
    ]);
    const r = await post({ email: 'b@acme.com', action: 'portal', returnUrl: 'https://studio.prospektor.ai/settings/workspace' });
    assert.equal(r.statusCode, 200);
    assert.equal(JSON.parse(r.body).matched, 0);
    assert.ok(!calls.some(c => c.url.includes('/v1/billing_portal')), 'a canceled customer gets no portal');
  });

  test('portal refuses a missing or non-https returnUrl before Stripe is asked', async () => {
    const calls = stubFetch(stripeRoutes());
    assert.equal((await post({ email: 'b@acme.com', action: 'portal' })).statusCode, 400);
    assert.equal((await post({ email: 'b@acme.com', action: 'portal', returnUrl: 'http://evil.example/' })).statusCode, 400);
    assert.equal((await post({ email: 'b@acme.com', action: 'portal', returnUrl: 'not a url' })).statusCode, 400);
    assert.equal(calls.length, 0);
  });

  test('a portal the key may not mint is the same loud 502, with the cause', async () => {
    stubFetch(stripeRoutes([
      ['/v1/billing_portal/sessions', { status: 403, body: { error: { message: 'This API key does not have the required permissions for this endpoint on account acct_1' } } }],
    ]));
    const r = await post({ email: 'b@acme.com', action: 'portal', returnUrl: 'https://studio.prospektor.ai/settings/workspace' });
    assert.equal(r.statusCode, 502);
    const body = JSON.parse(r.body);
    assert.match(body.cause, /required permissions/);
    assert.match(body.cause, /billing_portal/);
  });
});
