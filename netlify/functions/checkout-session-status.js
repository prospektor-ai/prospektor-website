// /checkout/done/'s one question: what did this checkout actually buy? (#244)
//
// Stripe redirects the buyer to /checkout/done/?session_id={CHECKOUT_SESSION_ID}
// and this function trades that id back for the three facts the confirmation
// shows: the amount actually paid (a promo code can make it anything from
// $0.01 to $999 — the page must never invent a number), the address the
// workspace is tied to, and whether the session is in fact paid.
//
// The session id is the authorisation. A cs_… id is a long unguessable token
// Stripe hands only to the buyer's own redirect — the same bearer-token model
// as Stripe's own success pages — so holding it is proof enough for these
// fields. Everything else on the session (line items, the subscription id, the
// rest of the metadata) deliberately stays server-side.
//
// #622 added a fifth, on the same terms: `trial`. A Close arrival hands over a
// card and is charged nothing, and this page's served copy said *Payment
// confirmed* and *your receipt is on its way* as constants — the first is not
// what happened and the second is a receipt for $0.
//
// The signal has to be a FACT rather than an inference. `payment_status` is no
// use: Stripe's reference says a trial session reads `paid`, because the $0
// trial invoice really is processed. `amount_total: 0` is no use either — a
// 100% promotion code produces exactly that, and that buyer HAS paid, in full,
// for nothing. So the subscription itself is asked: `?expand[]=subscription`
// on the read this function already makes (no second call), and a `trialing`
// status is the one thing that means *nothing has been charged yet*. The
// subscription's id and the rest of it stay server-side as they always did;
// one boolean crosses.
//
// #542 added a fourth, and it is the narrowest widening that would do: `plan`,
// one of exactly two words, read off the metadata the checkout call wrote. The
// order card on /checkout/done/ printed "$999/mo" as a constant, which is a
// sentence rather than a fact the moment a yearly plan exists — and the file's
// own rule two paragraphs up is that the page must never invent a number.
// Nothing else from the metadata crosses: the domain, the company and the
// buyer's target sentence stay where they are.
//
// Env-gated like every Stripe call here: no key, 503, and the page keeps its
// generic confirmation copy — a missing env var must never blank the page a
// buyer lands on seconds after paying.

const SESSION_ID_RE = /^cs_[a-zA-Z0-9_]{10,250}$/;

exports.handler = async function(event) {
  if (event.httpMethod !== 'GET') {
    return { statusCode: 405, body: 'Method not allowed' };
  }
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) {
    return { statusCode: 503, body: JSON.stringify({ error: 'Not configured' }) };
  }

  const id = ((event.queryStringParameters || {}).session_id || '').trim();
  if (!SESSION_ID_RE.test(id)) {
    return { statusCode: 400, body: JSON.stringify({ error: 'Bad session id' }) };
  }

  let response, session;
  try {
    response = await fetch('https://api.stripe.com/v1/checkout/sessions/' + id + '?expand[]=subscription', {
      headers: { 'Authorization': `Bearer ${key}` },
    });
    session = await response.json();
  } catch (e) {
    console.error('Stripe unreachable:', e.message);
    return { statusCode: 502, body: JSON.stringify({ error: 'Could not read the session' }) };
  }
  if (!response.ok || !session || session.object !== 'checkout.session') {
    return { statusCode: 404, body: JSON.stringify({ error: 'No such session' }) };
  }

  return {
    statusCode: 200,
    body: JSON.stringify({
      paid: session.payment_status === 'paid',
      // Still inside the free month (#622): the card is on file, the workspace
      // is real, and no money has moved. A different sentence, not a lesser
      // purchase. An unexpanded or absent subscription reads as false, which
      // is the page every buyer read before this existed.
      trial: !!(session.subscription && typeof session.subscription === 'object'
        && session.subscription.status === 'trialing'),
      amount_total: typeof session.amount_total === 'number' ? session.amount_total : null,
      currency: session.currency || 'usd',
      email: (session.customer_details && session.customer_details.email) || session.customer_email || null,
      // Absent means monthly, which is what the checkout call writes: it sends
      // no `plan` for the default, so an older session reads correctly too.
      plan: ((session.metadata || {}).plan === 'year') ? 'year' : 'month',
    }),
  };
};
