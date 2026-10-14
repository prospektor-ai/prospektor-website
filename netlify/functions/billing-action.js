// The studio's hand on a subscription — pause, resume, or cancel billing for
// a workspace the operator is suspending, resuming or deleting (studio queue
// #29). Until this, causality ran one way only: billing events → workspace
// state, via the webhook. An operator who suspended a workspace by hand had
// closed the door and left the meter running — the customer kept being
// charged until somebody remembered the Stripe dashboard.
//
// Server to server only, the resubscribe pattern in reverse: the studio asks,
// this site acts, and the Stripe key never leaves this repo. The caller
// proves itself with the same shared secret the webhook uses to call the
// studio — one secret, two names (PROVISION_SECRET there,
// STUDIO_PROVISION_SECRET here), rotated together per the 19 Aug incident
// lesson — so arming this endpoint adds no new secret to either deploy.
//
// One email can back several Stripe customers (each checkout mints one), and
// a re-subscribe can leave an old subscription beside the new — the webhook's
// own notice asks the operator to hand-cancel exactly that case. So every
// action here walks ALL the customers behind the address and acts on every
// subscription that is not already canceled: pausing a workspace's billing
// must not leave a second subscription quietly charging.
//
// pause uses Stripe's pause_collection with behavior:'void' — the
// subscription stays alive (so resume is cheap and the customer's history
// survives) but invoices are voided instead of collected. A paused
// subscription still reports status 'active'; the webhook knows not to read
// that as recovery.

const crypto = require('node:crypto');
const { redactKeys } = require('../../lib/stripe-error');
const { stripe, subscriptionsFor } = require('../lib/subscriptions');

const ACTIONS = ['pause', 'resume', 'cancel', 'portal'];
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// Same posture as the studio's own door: an unset or too-short secret means
// the endpoint does not exist rather than standing guessably open.
function secretMatches(given, expected) {
  const a = Buffer.from(String(given || ''));
  const b = Buffer.from(String(expected || ''));
  return a.length === b.length && a.length > 0 && crypto.timingSafeEqual(a, b);
}

exports.handler = async function(event) {
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: 'Method not allowed' };
  }
  const secret = process.env.STUDIO_PROVISION_SECRET || '';
  if (secret.length < 32) {
    return { statusCode: 503, body: JSON.stringify({ error: 'Billing actions are not configured on this deploy' }) };
  }
  const given = (event.headers && (event.headers['x-provision-secret'] || event.headers['X-Provision-Secret'])) || '';
  if (!secretMatches(given, secret)) {
    return { statusCode: 403, body: JSON.stringify({ error: 'Wrong or missing provisioning secret' }) };
  }
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) {
    return { statusCode: 503, body: JSON.stringify({ error: 'Stripe is not configured on this deploy' }) };
  }

  let data;
  try {
    data = JSON.parse(event.body || '{}');
  } catch (e) {
    return { statusCode: 400, body: JSON.stringify({ error: 'Invalid JSON' }) };
  }
  const email = String(data.email || '').trim().toLowerCase();
  const action = String(data.action || '').trim();
  // The workspace (studio #1240). One address can pay for several now, each on
  // its own subscription named in `metadata.workspace` by the webhook. Given,
  // the action touches the subscriptions that carry this id; a customer from
  // before the webhook named them has exactly one live subscription with no
  // name, and that one is still theirs.
  const workspace = String(data.workspace || '').trim().slice(0, 120);
  if (!EMAIL_RE.test(email)) {
    return { statusCode: 400, body: JSON.stringify({ error: 'Say whose subscription: email' }) };
  }
  if (!ACTIONS.includes(action)) {
    return { statusCode: 400, body: JSON.stringify({ error: `action must be one of: ${ACTIONS.join(', ')}` }) };
  }
  // Where Stripe sends the customer back when they close the portal. Refused
  // before Stripe is asked, and https only: the studio passes its own origin.
  const returnUrl = String(data.returnUrl || '').trim();
  if (action === 'portal') {
    let parsed = null;
    try { parsed = new URL(returnUrl); } catch (e) { parsed = null; }
    if (!parsed || parsed.protocol !== 'https:') {
      return { statusCode: 400, body: JSON.stringify({ error: 'portal needs an https returnUrl' }) };
    }
  }

  try {
    let subscriptions = await subscriptionsFor(key, email);
    if (workspace) {
      const named = subscriptions.filter(s => s.metadata && s.metadata.workspace === workspace);
      const unnamed = subscriptions.filter(s => !(s.metadata && s.metadata.workspace));
      // A lone unnamed subscription is by construction the pre-#1240 one: every
      // later one is named by the webhook, so a customer who then bought a second
      // workspace can still pause or cancel the first (security pass, 13 Oct 2026).
      subscriptions = named.length ? named : (unnamed.length === 1 ? unnamed : []);
      if (!subscriptions.length) console.log(`billing-action: ${action} for workspace ${workspace} matched no subscription behind ${email}`);
    }

    if (action === 'portal') {
      // No live subscription, no portal: matched 0 is the studio's cue to say
      // so, and the same shape the three verbs above answer for an address
      // Stripe does not know.
      if (!subscriptions.length) {
        console.log(`billing-action: portal for ${email} found no live subscription`);
        return { statusCode: 200, body: JSON.stringify({ action, email, matched: 0, subscriptions: [] }) };
      }
      const customer = subscriptions[0].customer;
      const session = await stripe(key, 'POST', '/billing_portal/sessions',
        new URLSearchParams({ customer, return_url: returnUrl }));
      console.log(`billing-action: portal for ${email} opened on ${customer}`);
      return { statusCode: 200, body: JSON.stringify({
        action, email, matched: 1, subscriptions: [subscriptions[0].id], customer, url: session.url,
      }) };
    }

    // Resuming only unpauses — a subscription that is not paused needs
    // nothing, and touching it would invent work out of idempotent retries.
    if (action === 'resume') subscriptions = subscriptions.filter(s => s.pause_collection);

    const acted = [];
    for (const subscription of subscriptions) {
      if (action === 'cancel') {
        await stripe(key, 'DELETE', '/subscriptions/' + encodeURIComponent(subscription.id));
      } else if (action === 'pause') {
        await stripe(key, 'POST', '/subscriptions/' + encodeURIComponent(subscription.id),
          new URLSearchParams({ 'pause_collection[behavior]': 'void' }));
      } else {
        // Clearing pause_collection is Stripe's "resume": an empty value
        // unsets the property and collection picks up at the next cycle.
        await stripe(key, 'POST', '/subscriptions/' + encodeURIComponent(subscription.id),
          new URLSearchParams({ pause_collection: '' }));
      }
      acted.push(subscription.id);
    }
    console.log(`billing-action: ${action} for ${email} touched ${acted.length} subscription(s)`, acted.join(', ') || '(none)');
    return { statusCode: 200, body: JSON.stringify({ action, email, matched: acted.length, subscriptions: acted }) };
  } catch (e) {
    // Partial failure is a 502 on purpose: the studio reports it loudly and
    // the operator finishes in the Stripe dashboard — a quiet half-done
    // answer here would read as "billing stopped" while it had not.
    //
    // And the cause travels with it (#684). Until this, `e.message` went to
    // `console.error` and nowhere else, so the studio's notice, the operator's
    // screen and the board all reported an absence while the one-line answer
    // sat in a Netlify log nobody had opened — six hours and two wrong
    // theories on #676. `error` is unchanged, byte for byte, because the
    // studio keys its own sentence off the status and off that string;
    // `cause` is the new half, and an older studio that ignores it is no worse
    // off than it is today.
    const cause = redactKeys(e.message);
    console.error('billing-action failed:', cause);
    return { statusCode: 502, body: JSON.stringify({
      error: 'Stripe could not be asked. Finish this in the Stripe dashboard',
      cause,
    }) };
  }
};
