// Payment success becomes a provisioned studio. The webhook's job is to be
// idempotent, to never provision an unpaid session, and to make a silent
// failure visible in the operator's inbox.
const { test, describe, beforeEach } = require('node:test');
const assert = require('node:assert');
const { stubFetch, resetEnv, signedStripeEvent, checkoutSessionCompleted } = require('./helpers');
const fn = require('../netlify/functions/stripe-webhook');

const SECRET = 'whsec_test';
const provisioned = (extra = {}) => ['/api/provision', { status: 201, body: { client: { id: 'acme' }, research: 'pending', ...extra } }];
const mail = calls => calls.filter(c => c.url.includes('postmarkapp')).map(c => JSON.parse(c.body));
const notice = calls => mail(calls).find(m => /order/i.test(m.Subject));
const welcome = calls => mail(calls).find(m => /studio is ready/i.test(m.Subject));

describe('stripe-webhook', () => {
  beforeEach(() => {
    resetEnv();
    process.env.STRIPE_WEBHOOK_SECRET = SECRET;
    process.env.STUDIO_PROVISION_SECRET = 'shh';
    process.env.POSTMARK_SERVER_TOKEN = 'pm';
  });

  test('refuses an unsigned or badly signed event', async () => {
    const r = await fn.handler({ httpMethod: 'POST', body: '{}', headers: { 'stripe-signature': 't=1,v1=deadbeef' } });
    assert.equal(r.statusCode, 400);
  });

  test('never provisions an unpaid session', async () => {
    const calls = stubFetch([provisioned(), ['postmarkapp', { status: 200, body: {} }]]);
    const r = await fn.handler(signedStripeEvent(SECRET, checkoutSessionCompleted({ email: 'b@acme.com', paid: false })));
    assert.equal(r.statusCode, 200);
    assert.equal(calls.filter(c => c.url.includes('/api/provision')).length, 0);
  });

  // ── The trial checkout (#622), which the row asked to be verified ──
  //
  // Verified against Stripe's API reference: a session whose subscription is on
  // a free trial completes `paid`, because the $0 trial invoice is processed.
  // So the answer to the row's question is yes — a trial buyer provisions like
  // any other, through the gate exactly as it stood. This test is what keeps
  // that true if the gate is ever tightened again.
  test('provisions a trial checkout — the card is on file and the workspace is real', async () => {
    const calls = stubFetch([provisioned(), ['postmarkapp', { status: 200, body: {} }]]);
    const r = await fn.handler(signedStripeEvent(SECRET, checkoutSessionCompleted({
      email: 'b@acme.com', paid: 'trial', metadata: { domain: 'acme.com', company: 'Acme', via: 'close' } })));
    assert.equal(r.statusCode, 200);
    const p = calls.find(c => c.url.includes('/api/provision'));
    assert.ok(p, 'a trial buyer must be provisioned like any other');
    assert.equal(JSON.parse(p.body).email, 'b@acme.com');
    assert.ok(welcome(calls), 'and welcomed like any other');
  });

  // ── The free month reaches the studio (#689) ──
  //
  // `plan: 'paid'` means *came through checkout*, and a trial checks out like
  // anything else — so the studio's ledger read a Close arrival on a free
  // month as a customer paying list price, and a desk wrote that into a file
  // before the operator corrected it. The day the month ends is read off the
  // subscription, never computed from our own offer, and sent as `endsAt`.
  test('a trial checkout tells the studio the day the free month ends, read off the subscription', async () => {
    process.env.STRIPE_SECRET_KEY = 'rk_test_1';
    const calls = stubFetch([
      ['api.stripe.com/v1/subscriptions/sub_123', { status: 200, body: { id: 'sub_123', status: 'trialing', trial_end: 1791000000 } }],
      provisioned({ endsAt: true }), ['postmarkapp', { status: 200, body: {} }],
    ]);
    const r = await fn.handler(signedStripeEvent(SECRET, checkoutSessionCompleted({
      email: 'b@acme.com', paid: 'trial', metadata: { domain: 'acme.com', company: 'Acme', via: 'close' } })));
    assert.equal(r.statusCode, 200);
    const read = calls.find(c => c.url.includes('/v1/subscriptions/sub_123'));
    assert.ok(read, 'the trial end is READ, not modelled');
    assert.equal(read.headers.authorization, 'Bearer rk_test_1');
    const body = JSON.parse(calls.find(c => c.url.includes('/api/provision')).body);
    assert.equal(body.plan, 'paid', 'a free month is still a checkout');
    assert.equal(body.endsAt, '2026-10-03', 'and the day it ends is Stripe’s trial_end, as a UTC calendar day');
  });

  test('a subscription the event carries expanded is read where it stands, with no second call', async () => {
    const calls = stubFetch([provisioned(), ['postmarkapp', { status: 200, body: {} }]]);
    const event = checkoutSessionCompleted({ email: 'b@acme.com', paid: 'trial', metadata: { domain: 'acme.com' } });
    event.data.object.subscription = { id: 'sub_9', status: 'trialing', trial_end: 1791000000 };
    await fn.handler(signedStripeEvent(SECRET, event));
    assert.ok(!calls.find(c => c.url.includes('api.stripe.com')), 'nothing to ask Stripe');
    assert.equal(JSON.parse(calls.find(c => c.url.includes('/api/provision')).body).endsAt, '2026-10-03');
  });

  test('a refused subscription read still provisions, and sends no day rather than a guessed one', async () => {
    process.env.STRIPE_SECRET_KEY = 'rk_test_1';
    const calls = stubFetch([
      ['api.stripe.com/v1/subscriptions/sub_123', { status: 403, body: { error: { message: 'This API key (rk_test_1***) does not have the required permissions' } } }],
      provisioned(), ['postmarkapp', { status: 200, body: {} }],
    ]);
    const r = await fn.handler(signedStripeEvent(SECRET, checkoutSessionCompleted({
      email: 'b@acme.com', paid: 'trial', metadata: { domain: 'acme.com', company: 'Acme', via: 'close' } })));
    assert.equal(r.statusCode, 200);
    const body = JSON.parse(calls.find(c => c.url.includes('/api/provision')).body);
    assert.ok(body.email, 'the buyer is provisioned whatever the read said');
    assert.equal(body.endsAt, undefined, 'and nothing is asserted about a free month the read could not confirm');
  });

  test('a full-price checkout sends no end day, so nothing changes for every other buyer', async () => {
    process.env.STRIPE_SECRET_KEY = 'rk_test_1';
    const calls = stubFetch([
      ['api.stripe.com/v1/subscriptions/sub_1', { status: 200, body: { id: 'sub_1', status: 'active', trial_end: null } }],
      provisioned(), ['postmarkapp', { status: 200, body: {} }],
    ]);
    const event = checkoutSessionCompleted({ email: 'b@acme.com', metadata: { domain: 'acme.com' } });
    event.data.object.subscription = 'sub_1';
    await fn.handler(signedStripeEvent(SECRET, event));
    assert.equal(JSON.parse(calls.find(c => c.url.includes('/api/provision')).body).endsAt, undefined);
  });

  test('and provisions the second door too, so a billing anchor cannot strand a buyer', async () => {
    const calls = stubFetch([provisioned(), ['postmarkapp', { status: 200, body: {} }]]);
    await fn.handler(signedStripeEvent(SECRET, checkoutSessionCompleted({
      email: 'b@acme.com', paid: 'no_payment_required', metadata: { domain: 'acme.com', company: 'Acme' } })));
    assert.ok(calls.find(c => c.url.includes('/api/provision')),
      'no_payment_required means nothing is DUE, never that funds are missing');
  });

  test('the arrival marker changes nothing about provisioning', async () => {
    // `via` rides through for the operator's own counting. The studio is never
    // told about it and nothing here reads it — a Close buyer's workspace is
    // the workspace every other buyer gets.
    const calls = stubFetch([provisioned(), ['postmarkapp', { status: 200, body: {} }]]);
    await fn.handler(signedStripeEvent(SECRET, checkoutSessionCompleted({
      email: 'b@acme.com', metadata: { domain: 'acme.com', company: 'Acme', via: 'close', utm_source: 'close' } })));
    const sent = JSON.parse(calls.find(c => c.url.includes('/api/provision')).body);
    for (const k of ['via', 'utm_source'])
      assert.ok(!(k in sent), k + ' is ours to count, not the studio\'s to store');
  });

  test('provisions on payment and sends both mails', async () => {
    const calls = stubFetch([provisioned({ goal: true }), ['postmarkapp', { status: 200, body: {} }]]);
    const r = await fn.handler(signedStripeEvent(SECRET, checkoutSessionCompleted({
      email: 'b@acme.com', metadata: { domain: 'acme.com', company: 'Acme', goal: 'Property managers' } })));
    assert.equal(r.statusCode, 200);
    assert.ok(notice(calls), 'the operator is told about every sale');
    const w = welcome(calls);
    assert.ok(w, 'a new workspace earns a welcome email');
    // The sign-in links carry ?signin=<address> so the studio prefills its
    // emailed-link field — the old flow made the buyer retype the address the
    // mail was literally sent to (operator, 19 Aug).
    assert.ok(w.TextBody.includes('/?signin=' + encodeURIComponent('b@acme.com')), 'the text link prefills');
    assert.ok(w.HtmlBody.includes('/?signin=' + encodeURIComponent('b@acme.com')), 'the button link prefills');
  });

  // #721: the mail's three lines describe the first minute the studio actually
  // has. Signing in lands on the deck, three companies one at a time, Glance
  // the read and Prospekt the run (#725), the checkout sentence already in the
  // brief. Every screen and button the mail names is pinned to the studio's
  // own getting-started article, as snapshotted in data/help-corpus.json
  // (`npm run help:snapshot` refreshes it), so a renamed button is red here
  // rather than a wrong instruction in a customer's inbox. And the old first
  // step, which nothing on screen asks for since #248, must not come back.
  test('the welcome mail says what the first screen does, in the walkthrough\'s words (#721)', async () => {
    const calls = stubFetch([provisioned({ goal: true }), ['postmarkapp', { status: 200, body: {} }]]);
    await fn.handler(signedStripeEvent(SECRET, checkoutSessionCompleted({
      email: 'b@acme.com', metadata: { domain: 'acme.com', company: 'Acme', goal: 'Property managers' } })));
    const w = welcome(calls);
    const corpus = require('../data/help-corpus.json');
    const article = corpus.files.find(f => f.name === '01-getting-started.md');
    assert.ok(article && article.text, 'data/help-corpus.json holds no getting-started article');
    for (const name of ['Glance', 'Prospekt', 'Getting started']) {
      assert.ok(w.TextBody.includes(name), `the text mail names ${name}`);
      assert.ok(w.HtmlBody.includes(name), `the HTML mail names ${name}`);
      assert.ok(article.text.includes(name),
        `the mail names ${name} and the studio's getting-started article does not: the studio renamed it, `
        + 'or the snapshot is stale (npm run help:snapshot). The mail says what the screen says, or it says nothing');
    }
    assert.ok(w.TextBody.includes('three companies'), 'the deck: three companies, one at a time');
    for (const stale of [/confirm your target sentence/i, /researched prospects are waiting/i])
      assert.doesNotMatch(w.TextBody + w.HtmlBody, stale, 'the first step #248 removed is back in the mail');
  });

  // #114: a buyer who bought in Spanish is welcomed in Spanish, the operator is
  // told which language, and the studio is offered the language for the
  // workspace (it ignores the field until it learns it). An English buyer's
  // mail is byte for byte the one this always sent — no language is written
  // for English at checkout, so none arrives here.
  test('a Spanish buyer is welcomed in Spanish, and the operator and the studio are told', async () => {
    const calls = stubFetch([provisioned({ goal: true }), ['postmarkapp', { status: 200, body: {} }]]);
    const r = await fn.handler(signedStripeEvent(SECRET, checkoutSessionCompleted({
      email: 'b@acme.com', metadata: { domain: 'acme.com', language: 'es' } })));
    assert.equal(r.statusCode, 200);
    const w = mail(calls).find(m => /estudio está listo/.test(m.Subject));
    assert.ok(w, 'the welcome subject is Spanish');
    assert.ok(w.TextBody.includes('Tu espacio de trabajo de Prospektor está listo.'), 'the text body is Spanish');
    assert.ok(w.HtmlBody.includes('Entrar en tu estudio &rarr;'), 'the button is Spanish');
    assert.ok(w.TextBody.includes('/?signin=' + encodeURIComponent('b@acme.com')), 'the sign-in link still prefills');
    assert.ok(!/Your studio is ready/.test(w.TextBody + w.HtmlBody), 'no English sentence leaks into the Spanish mail');
    const n = notice(calls);
    assert.ok(/Language: Spanish/.test(n.TextBody), 'the operator notice names the language');
    const body = JSON.parse(calls.find(c => c.url.includes('/api/provision')).body);
    assert.equal(body.language, 'es', 'the studio is offered the language');
  });

  test('an English buyer gets the English mail, and no language field anywhere', async () => {
    const calls = stubFetch([provisioned({ goal: true }), ['postmarkapp', { status: 200, body: {} }]]);
    await fn.handler(signedStripeEvent(SECRET, checkoutSessionCompleted({ email: 'b@acme.com', metadata: { domain: 'acme.com' } })));
    const w = welcome(calls);
    assert.ok(w && w.TextBody.startsWith('Your Prospektor workspace is ready.'));
    assert.ok(!/Language:/.test(notice(calls).TextBody), 'nothing to say about English');
    const body = JSON.parse(calls.find(c => c.url.includes('/api/provision')).body);
    assert.ok(!('language' in body), 'an older studio sees nothing new');
  });

  test('a language outside the set is treated as English, never as a fifth language', async () => {
    const calls = stubFetch([provisioned({ goal: true }), ['postmarkapp', { status: 200, body: {} }]]);
    await fn.handler(signedStripeEvent(SECRET, checkoutSessionCompleted({ email: 'b@acme.com', metadata: { domain: 'acme.com', language: 'fr' } })));
    assert.ok(welcome(calls), 'the English welcome went out');
    assert.ok(!('language' in JSON.parse(calls.find(c => c.url.includes('/api/provision')).body)));
  });

  test('sends the shared secret to the studio, and no secret to the buyer', async () => {
    const calls = stubFetch([provisioned(), ['postmarkapp', { status: 200, body: {} }]]);
    await fn.handler(signedStripeEvent(SECRET, checkoutSessionCompleted({ email: 'b@acme.com', metadata: { domain: 'acme.com' } })));
    const p = calls.find(c => c.url.includes('/api/provision'));
    assert.equal(p.headers['x-provision-secret'], 'shh');
    assert.ok(!JSON.stringify(mail(calls)).includes('shh'));
  });

  test('treats an existing workspace as success, warns loudly, and sends no welcome', async () => {
    const calls = stubFetch([['/api/provision', { status: 200, body: { client: { id: 'acme' }, existing: true } }], ['postmarkapp', { status: 200, body: {} }]]);
    const r = await fn.handler(signedStripeEvent(SECRET, checkoutSessionCompleted({ email: 'b@acme.com', metadata: { domain: 'acme.com' } })));
    assert.equal(r.statusCode, 200, 'existing:true is success — webhooks double-fire');
    assert.match(notice(calls).Subject, /needs attention/);
    assert.equal(welcome(calls), undefined, '"your studio is ready" would be a lie here');
  });

  test('passes a ticked marketing box to the studio, and only a ticked one (#204)', async () => {
    const calls = stubFetch([provisioned({ marketing: true }), ['postmarkapp', { status: 200, body: {} }]]);
    await fn.handler(signedStripeEvent(SECRET, checkoutSessionCompleted({
      email: 'b@acme.com', metadata: { domain: 'acme.com', marketing: 'yes' } })));
    const p = JSON.parse(calls.find(c => c.url.includes('/api/provision')).body);
    assert.equal(p.marketing, true, 'the tick reaches the studio');

    // No tick means the field is absent entirely — never false, never a
    // string — so the studio's strict === true check sees nothing at all.
    const quiet = stubFetch([provisioned(), ['postmarkapp', { status: 200, body: {} }]]);
    await fn.handler(signedStripeEvent(SECRET, checkoutSessionCompleted({
      email: 'b@acme.com', metadata: { domain: 'acme.com' } })));
    assert.ok(!('marketing' in JSON.parse(quiet.find(c => c.url.includes('/api/provision')).body)));
  });

  test('reports a target sentence the studio did not record', async () => {
    const calls = stubFetch([provisioned({ goal: false }), ['postmarkapp', { status: 200, body: {} }]]);
    await fn.handler(signedStripeEvent(SECRET, checkoutSessionCompleted({
      email: 'b@acme.com', metadata: { domain: 'acme.com', goal: 'Property managers' } })));
    assert.match(notice(calls).Subject, /target sentence dropped/);
    assert.match(notice(calls).TextBody, /SENT BUT NOT RECORDED/);
  });

  test('does NOT warn when no sentence was sent — that is the direct pay path', async () => {
    const calls = stubFetch([provisioned({ goal: false }), ['postmarkapp', { status: 200, body: {} }]]);
    await fn.handler(signedStripeEvent(SECRET, checkoutSessionCompleted({ email: 'b@acme.com', metadata: { domain: 'visible.xyz' } })));
    assert.match(notice(calls).Subject, /^New order:/);
    assert.match(notice(calls).TextBody, /bought straight from the pricing tile/);
  });

  test('does NOT warn when the studio does not report the field at all', async () => {
    const calls = stubFetch([provisioned(), ['postmarkapp', { status: 200, body: {} }]]);
    await fn.handler(signedStripeEvent(SECRET, checkoutSessionCompleted({
      email: 'b@acme.com', metadata: { domain: 'acme.com', goal: 'Property managers' } })));
    assert.match(notice(calls).Subject, /^New order:/);
    assert.doesNotMatch(notice(calls).TextBody, /NOT RECORDED/);
  });

  test('returns non-2xx when provisioning fails, so Stripe keeps retrying', async () => {
    const calls = stubFetch([['/api/provision', { status: 400, body: { error: 'no company or website' } }], ['postmarkapp', { status: 200, body: {} }]]);
    const r = await fn.handler(signedStripeEvent(SECRET, checkoutSessionCompleted({ email: 'b@acme.com', metadata: {} })));
    assert.ok(r.statusCode >= 400, 'a paid buyer with no workspace must not be marked delivered');
    assert.equal(mail(calls).length, 0);
  });

  test('is retryable when the provision secret is missing, so it self-heals', async () => {
    delete process.env.STUDIO_PROVISION_SECRET;
    stubFetch([provisioned(), ['postmarkapp', { status: 200, body: {} }]]);
    const r = await fn.handler(signedStripeEvent(SECRET, checkoutSessionCompleted({ email: 'b@acme.com', metadata: { domain: 'acme.com' } })));
    assert.ok(r.statusCode >= 400);
  });

  test('stays silent, not broken, when no mail provider is configured', async () => {
    delete process.env.POSTMARK_SERVER_TOKEN;
    stubFetch([provisioned()]);
    const r = await fn.handler(signedStripeEvent(SECRET, checkoutSessionCompleted({ email: 'b@acme.com', metadata: { domain: 'acme.com' } })));
    assert.equal(r.statusCode, 200, 'a missing mail token must never fail a paid webhook');
  });
});

// The billing gate: failure events lock a workspace, recovery unlocks it.
// The webhook's whole contribution is naming the right action and the right
// address — the studio's PATCH is idempotent, so double-fires are free.
describe('stripe-webhook billing gate', () => {
  beforeEach(() => {
    resetEnv();
    process.env.STRIPE_WEBHOOK_SECRET = SECRET;
    process.env.STUDIO_PROVISION_SECRET = 'shh';
    process.env.STRIPE_SECRET_KEY = 'sk_test_x';
  });

  const patchCalls = calls => calls.filter(c => c.url.includes('/api/provision') && c.method === 'PATCH');
  const suspended = (body = {}) => ['/api/provision', { status: 200, body: { action: 'suspend', existed: true, ...body } }];

  test('a failed renewal suspends the workspace by the buyer email', async () => {
    const calls = stubFetch([suspended()]);
    const r = await fn.handler(signedStripeEvent(SECRET, {
      type: 'invoice.payment_failed',
      data: { object: { customer: 'cus_1', customer_email: 'b@acme.com' } },
    }));
    assert.equal(r.statusCode, 200);
    const [patch] = patchCalls(calls);
    assert.ok(patch, 'the studio was told');
    assert.equal(patch.headers['x-provision-secret'], 'shh');
    assert.deepEqual(JSON.parse(patch.body), { email: 'b@acme.com', action: 'suspend', reason: 'payment_failed' });
  });

  // #542 asked for this to be VERIFIED rather than assumed, and a test says it
  // better than a reading does: the gate is keyed on the event TYPE and the
  // address, and reads nothing about the money. A yearly renewal is the same
  // five events twelve months apart, so a yearly customer is locked and
  // unlocked by exactly the path a monthly one is — and a future line that
  // starts reading an amount, an interval or a price id turns this red.
  test('a yearly renewal locks and unlocks the same way a monthly one does (#542)', async () => {
    const YEARLY = {
      customer: 'cus_1',
      customer_email: 'b@acme.com',
      amount_due: 999000,
      lines: { data: [{ price: { recurring: { interval: 'year' }, unit_amount: 999000 } }] },
      period_start: 1757289600, period_end: 1788825600,
    };
    for (const [type, want] of [
      ['invoice.payment_failed', { email: 'b@acme.com', action: 'suspend', reason: 'payment_failed' }],
      ['invoice.paid', { email: 'b@acme.com', action: 'resume' }],
    ]) {
      const calls = stubFetch([suspended()]);
      const r = await fn.handler(signedStripeEvent(SECRET, { type, data: { object: YEARLY } }));
      assert.equal(r.statusCode, 200, type);
      assert.deepEqual(JSON.parse(patchCalls(calls)[0].body), want, type);
    }
  });

  // #689: a resume says what the invoice collected, so the studio can tell a
  // free month that converted from one that ended. The $0 invoice that opens a
  // trial is `paid` too, and must carry nothing — or the trial reads as
  // converted on the day it began.
  test('a paid renewal carries the money to the studio; the $0 trial invoice carries none', async () => {
    let calls = stubFetch([['/api/provision', { status: 200, body: { action: 'resume', existed: true, paid: true } }]]);
    await fn.handler(signedStripeEvent(SECRET, {
      type: 'invoice.paid',
      data: { object: { customer: 'cus_1', customer_email: 'b@acme.com', amount_paid: 99900, currency: 'usd', status_transitions: { paid_at: 1791000000 } } },
    }));
    assert.deepEqual(JSON.parse(patchCalls(calls)[0].body), {
      email: 'b@acme.com', action: 'resume', paid: { at: '2026-10-03T04:00:00.000Z', amount: 99900, currency: 'usd' },
    });

    calls = stubFetch([['/api/provision', { status: 200, body: { action: 'resume', existed: true, paid: false } }]]);
    await fn.handler(signedStripeEvent(SECRET, {
      type: 'invoice.paid',
      data: { object: { customer: 'cus_1', customer_email: 'b@acme.com', amount_paid: 0, currency: 'usd' } },
    }));
    assert.deepEqual(JSON.parse(patchCalls(calls)[0].body), { email: 'b@acme.com', action: 'resume' });
  });

  test('a chargeback suspends, resolving the customer when the event has no email', async () => {
    const calls = stubFetch([
      ['api.stripe.com/v1/customers/cus_9', { status: 200, body: { email: 'B@Acme.com' } }],
      suspended(),
    ]);
    const r = await fn.handler(signedStripeEvent(SECRET, {
      type: 'charge.dispute.created',
      data: { object: { id: 'dp_1', customer: 'cus_9' } },
    }));
    assert.equal(r.statusCode, 200);
    const body = JSON.parse(patchCalls(calls)[0].body);
    assert.equal(body.email, 'b@acme.com', 'resolved via the customer, lowercased');
    assert.equal(body.reason, 'chargeback');
  });

  test('a cancelled subscription suspends; a recovered one resumes', async () => {
    let calls = stubFetch([
      ['api.stripe.com/v1/customers/cus_9', { status: 200, body: { email: 'b@acme.com' } }],
      suspended(),
    ]);
    await fn.handler(signedStripeEvent(SECRET, {
      type: 'customer.subscription.deleted',
      data: { object: { id: 'sub_1', customer: 'cus_9', status: 'canceled' } },
    }));
    assert.equal(JSON.parse(patchCalls(calls)[0].body).reason, 'subscription_canceled');

    // past_due -> active after a successful retry: unlock without anyone writing in.
    calls = stubFetch([
      ['api.stripe.com/v1/customers/cus_9', { status: 200, body: { email: 'b@acme.com' } }],
      ['/api/provision', { status: 200, body: { action: 'resume', existed: true } }],
    ]);
    await fn.handler(signedStripeEvent(SECRET, {
      type: 'customer.subscription.updated',
      data: { object: { id: 'sub_1', customer: 'cus_9', status: 'active' } },
    }));
    const resume = JSON.parse(patchCalls(calls)[0].body);
    assert.equal(resume.action, 'resume');
    assert.equal(resume.reason, undefined, 'a resume carries no reason');
  });

  test('a paused subscription reporting active is NOT recovery — the workspace stays locked', async () => {
    // pause_collection is the studio's own suspend reaching Stripe
    // (billing-action.js); the update event it fires must not undo the lock.
    const calls = stubFetch([]);
    const r = await fn.handler(signedStripeEvent(SECRET, {
      type: 'customer.subscription.updated',
      data: { object: { id: 'sub_1', customer: 'cus_9', status: 'active', pause_collection: { behavior: 'void' } } },
    }));
    assert.equal(r.statusCode, 200);
    assert.equal(calls.length, 0, 'no resume was sent for a paused subscription');
  });

  test('a subscription update that is not active does nothing', async () => {
    const calls = stubFetch([]);
    const r = await fn.handler(signedStripeEvent(SECRET, {
      type: 'customer.subscription.updated',
      data: { object: { id: 'sub_1', customer: 'cus_9', status: 'past_due' } },
    }));
    assert.equal(r.statusCode, 200);
    assert.equal(calls.length, 0, 'past_due on its own is Stripe mid-retry — the invoice event decides');
  });

  test('an unresolvable email is acknowledged, not retried for ever', async () => {
    const calls = stubFetch([['api.stripe.com/v1/customers/cus_9', { status: 404, body: {} }]]);
    const r = await fn.handler(signedStripeEvent(SECRET, {
      type: 'invoice.payment_failed',
      data: { object: { customer: 'cus_9' } },
    }));
    assert.equal(r.statusCode, 200, 'a retry would find the same nothing');
    assert.equal(patchCalls(calls).length, 0);
  });

  /*
   * #684, out of #676, and the two tests below are opposite halves of one
   * distinction. `customerEmail` returned `''` for both cases, so a refused
   * read was logged as "carried no resolvable email" and answered 200 — which
   * tells Stripe the event is handled and never to re-deliver it. The
   * permission failure behind it is a one-minute dashboard change; the
   * delivery it swallowed is gone for good.
   */
  test('a refused customer read answers non-2xx, so the delivery survives the fix', async () => {
    const calls = stubFetch([['api.stripe.com/v1/customers/cus_9', { status: 403, body: { error: {
      message: "The provided key 'sk_live_51H****abcd' does not have the required permissions.",
    } } }]]);
    const r = await fn.handler(signedStripeEvent(SECRET, {
      type: 'invoice.payment_failed',
      data: { object: { customer: 'cus_9' } },
    }));
    assert.equal(r.statusCode, 502, 'Stripe re-delivers a non-2xx');
    assert.ok(!r.body.includes('sk_live'), 'and the key it named does not leave the function');
    assert.equal(patchCalls(calls).length, 0, 'nothing was touched on a lookup that failed');
  });

  test('a transport failure on the lookup is retried too, not read as an address-less event', async () => {
    stubFetch([['api.stripe.com/v1/customers/cus_9', new Error('socket hang up')]]);
    const r = await fn.handler(signedStripeEvent(SECRET, {
      type: 'invoice.payment_failed',
      data: { object: { customer: 'cus_9' } },
    }));
    assert.equal(r.statusCode, 502);
  });

  test('an event that carries its own address never triggers the lookup at all', async () => {
    // The short-circuit the old `||` chain gave for free, kept deliberately:
    // one fewer authenticated read on every renewal invoice.
    const calls = stubFetch([['/api/provision', { status: 200, body: { ok: true } }]]);
    const r = await fn.handler(signedStripeEvent(SECRET, {
      type: 'invoice.payment_failed',
      data: { object: { customer: 'cus_9', customer_email: 'B@Acme.com' } },
    }));
    assert.equal(r.statusCode, 200);
    assert.equal(calls.filter(c => c.url.includes('/v1/customers/')).length, 0);
  });

  test('a studio failure returns non-2xx so Stripe re-delivers', async () => {
    stubFetch([['/api/provision', { status: 503, body: { error: 'not configured' } }]]);
    const r = await fn.handler(signedStripeEvent(SECRET, {
      type: 'invoice.payment_failed',
      data: { object: { customer: 'cus_1', customer_email: 'b@acme.com' } },
    }));
    assert.equal(r.statusCode, 502);
  });

  test('checkout provisions as paid — the one door money actually comes through', async () => {
    process.env.POSTMARK_SERVER_TOKEN = 'pm';
    const calls = stubFetch([provisioned(), ['postmarkapp', { status: 200, body: {} }]]);
    await fn.handler(signedStripeEvent(SECRET, checkoutSessionCompleted({ email: 'b@acme.com', metadata: { domain: 'acme.com' } })));
    const post = calls.find(c => c.url.includes('/api/provision') && c.method === 'POST');
    assert.equal(JSON.parse(post.body).plan, 'paid');
  });
});

// The re-subscribe landing: existing + resumed is the gate working, not a
// collision — the operator hears good news, and the buyer gets no second
// welcome mail for a studio they already know.
describe('stripe-webhook resume notice', () => {
  beforeEach(() => {
    resetEnv();
    process.env.STRIPE_WEBHOOK_SECRET = SECRET;
    process.env.STUDIO_PROVISION_SECRET = 'shh';
    process.env.POSTMARK_SERVER_TOKEN = 'pm';
  });

  test('a resumed workspace is reported calmly, with the double-billing hand-check', async () => {
    const calls = stubFetch([
      ['/api/provision', { status: 200, body: { client: { id: 'acme' }, existing: true, resumed: true } }],
      ['postmarkapp', { status: 200, body: {} }],
    ]);
    const r = await fn.handler(signedStripeEvent(SECRET, checkoutSessionCompleted({ email: 'b@acme.com', metadata: { domain: 'acme.com' } })));
    assert.equal(r.statusCode, 200);
    const m = mail(calls).find(x => /resumed/i.test(x.Subject));
    assert.ok(m, 'the operator hears it as good news');
    assert.doesNotMatch(m.Subject, /needs attention/);
    assert.match(m.TextBody, /billed twice/, 'the one hand-check is named');
    assert.equal(welcome(calls), undefined, 'no second welcome for a studio they already know');
  });
});
