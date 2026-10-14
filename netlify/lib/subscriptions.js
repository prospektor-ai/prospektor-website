// Reading an address's Stripe subscriptions, shared by billing-action and the
// checkout webhook (studio #1335). One email can back several Stripe customers
// (each checkout mints one), so every read walks all of them.

const STRIPE = 'https://api.stripe.com/v1';

async function stripe(key, method, path, params) {
  const response = await fetch(STRIPE + path, {
    method,
    headers: {
      'Authorization': `Bearer ${key}`,
      ...(params ? { 'Content-Type': 'application/x-www-form-urlencoded' } : {}),
    },
    body: params ? params.toString() : undefined,
  });
  const data = await response.json().catch(() => null);
  if (!response.ok || !data) {
    const detail = data && data.error && data.error.message;
    throw new Error(`Stripe ${method} ${path} answered ${response.status}${detail ? `: ${detail}` : ''}`);
  }
  return data;
}

// Every not-yet-canceled subscription behind an address, across every
// customer that address has minted. `status=all` because a past_due or
// trialing subscription still bills; the canceled ones are already done.
async function subscriptionsFor(key, email) {
  const customers = await stripe(key, 'GET', '/customers?' + new URLSearchParams({ email, limit: '100' }));
  const found = [];
  for (const customer of customers.data || []) {
    const subscriptions = await stripe(key, 'GET', '/subscriptions?' + new URLSearchParams({
      customer: customer.id, status: 'all', limit: '100',
    }));
    for (const subscription of subscriptions.data || []) {
      if (subscription.status === 'canceled' || subscription.status === 'incomplete_expired') continue;
      // The customer it hangs off, for the portal: a session is minted per
      // customer, and the one holding a live subscription is the one to open.
      found.push(Object.assign({}, subscription, { customer: customer.id }));
    }
  }
  return found;
}

module.exports = { STRIPE, stripe, subscriptionsFor };
