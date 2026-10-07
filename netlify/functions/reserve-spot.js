// Founding-spot reservations from /checkout/ while Stripe checkout isn't
// open yet. Sends one notification email to the operator. Nothing about the
// visitor is stored; the only thing written anywhere is the day's send count.

// Per-caller limit (studio #1160): a few sends per caller per window, counted in
// this instance's memory. It is best effort by design: a cold start or a second
// instance starts its own count. A real visitor who hits it still lands,
// because checkout.js falls back to Netlify Forms on any answer that is not ok.
const LIMIT = 5;
const WINDOW_MS = 10 * 60 * 1000;
const seen = new Map();

// Daily cap (studio #1166): the ceiling above the per-caller count, which a
// cold start, a second instance or a caller rotating addresses all get past.
// One counter per UTC day in Netlify Blobs, shared by every instance of this
// function; past DAILY_CAP the door answers 429 and sends nothing until the
// date changes. It is a cap, not a gate: the busiest real day this form has
// seen is nowhere near it, so a genuine visitor on a busy day still gets
// through, and the worst case is DAILY_CAP mails and that much SendGrid quota.
// The write is conditional on the version that was read (the blob's etag), so
// a burst of instances reading the same count cannot each add one and all get
// through: a lost race is retried, and a count that cannot be landed refuses.
// When the store cannot be reached the door fails CLOSED (503, nothing
// sent): a mail door that fails open under a store outage is the bug again,
// and the visitor still lands through checkout.js's Netlify Forms fallback.
// The functions here run in Lambda compatibility mode, where the blobs
// context rides on the event (`connectLambda`); without it, `getStore` reads
// the runtime's own environment, and with neither it throws, which closes the
// door.
const { connectLambda, getStore } = require('@netlify/blobs');
const DAILY_CAP = 50;
let storeForTests;

function dayStore(event) {
  if (storeForTests !== undefined) return storeForTests;
  if (event.blobs) connectLambda(event);
  return getStore({ name: 'reserve-spot', consistency: 'strong' });
}

// True when today's sends have reached the cap; otherwise counts this one and
// answers false. Throws when the store cannot be reached, or when the count
// could not be landed after a few lost races; either way the door closes.
async function overDailyCap(event, now) {
  const store = dayStore(event);
  const key = new Date(now).toISOString().slice(0, 10);
  for (let attempt = 0; attempt < 4; attempt++) {
    const { data, etag } = await store.getWithMetadata(key, { consistency: 'strong' }) || {};
    const n = Number(data) || 0;
    if (n >= DAILY_CAP) return true;
    const condition = etag ? { onlyIfMatch: etag } : { onlyIfNew: true };
    const { modified } = await store.set(key, String(n + 1), condition);
    if (modified) return false;
  }
  throw new Error('the day count could not be written after four attempts');
}

function limited(event, now) {
  const h = event.headers || {};
  const ip = h['x-nf-client-connection-ip'] || String(h['x-forwarded-for'] || '').split(',')[0].trim() || 'unknown';
  if (seen.size > 5000) seen.clear();
  const hits = (seen.get(ip) || []).filter(t => now - t < WINDOW_MS);
  if (hits.length >= LIMIT) { seen.set(ip, hits); return true; }
  hits.push(now);
  seen.set(ip, hits);
  return false;
}

exports._resetLimit = () => seen.clear();
exports._setStoreForTests = store => { storeForTests = store; };
exports.DAILY_CAP = DAILY_CAP;

exports.handler = async function(event) {
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: 'Method not allowed' };
  }

  if (limited(event, Date.now())) {
    return { statusCode: 429, body: JSON.stringify({ error: 'Too many from here. Try again in ten minutes.' }) };
  }

  let data;
  try {
    data = JSON.parse(event.body);
  } catch (e) {
    return { statusCode: 400, body: JSON.stringify({ error: 'Invalid JSON' }) };
  }

  const email = String(data.email || '').trim().slice(0, 200);
  const domain = String(data.domain || '').trim().slice(0, 200);
  const company = String(data.company || '').trim().slice(0, 200);
  const goal = String(data.goal || '').trim().slice(0, 2000);

  // Honeypot: bots fill every field; humans never see this one.
  if (data.hp) {
    return { statusCode: 200, body: JSON.stringify({ success: true }) };
  }

  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return { statusCode: 400, body: JSON.stringify({ error: 'That does not look like an email address.' }) };
  }

  const SENDGRID_API_KEY = process.env.SENDGRID_API_KEY;
  if (!SENDGRID_API_KEY) {
    return { statusCode: 503, body: JSON.stringify({ error: 'Not configured' }) };
  }

  // After the honeypot and the address check, so a bot's filled trap or a
  // mistyped address never spends the day's budget; before the send, so the
  // count is of mails this function tried to send.
  let capped;
  try {
    capped = await overDailyCap(event, Date.now());
  } catch (err) {
    console.error('reserve-spot: day counter unreachable:', err.message);
    return { statusCode: 503, body: JSON.stringify({ error: 'This form is paused for a moment. Try again shortly.' }) };
  }
  if (capped) {
    return { statusCode: 429, body: JSON.stringify({ error: 'This form has reached its limit for today. Try again tomorrow.' }) };
  }

  const esc = s => s.replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const line = (label, value) => value
    ? `<tr><td style="padding:8px 12px;font-family:monospace;font-size:11px;color:#80868b;text-transform:uppercase;vertical-align:top;">${label}</td><td style="padding:8px 12px;font-size:14px;color:#1f1f1f;">${esc(value)}</td></tr>`
    : '';

  const htmlBody = `
<body style="margin:0;padding:24px;background:#f7f7f9;font-family:system-ui,sans-serif;">
  <div style="max-width:560px;margin:0 auto;background:#ffffff;border:1px solid #e6e6ea;border-radius:12px;padding:24px;">
    <p style="font-size:16px;font-weight:700;color:#1f1f1f;margin:0 0 16px;">Founding spot requested</p>
    <table style="width:100%;border-collapse:collapse;">
      ${line('Email', email)}
      ${line('Domain', domain)}
      ${line('Company', company)}
      ${line('Their target', goal)}
    </table>
    <p style="font-size:12px;color:#80868b;margin:16px 0 0;">Sent from the /checkout/ payment step, before Stripe checkout opened. Reply goes to the buyer.</p>
  </div>
</body>`;

  let response;
  try {
    response = await fetch('https://api.sendgrid.com/v3/mail/send', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${SENDGRID_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        personalizations: [{ to: [{ email: 'hello@prospektor.ai', name: 'Prospektor' }] }],
        from: { email: 'hello@prospektor.ai', name: 'Prospektor Checkout' },
        reply_to: { email: email },
        subject: `Founding spot: ${email}${company ? ' · ' + company : domain ? ' · ' + domain : ''}`,
        content: [{ type: 'text/html', value: htmlBody }],
      }),
    });
  } catch (err) {
    // A network throw is the vendor failing too; the platform's own error
    // body must not be what answers (studio #1166's pass).
    console.error('SendGrid unreachable:', err.message);
    return { statusCode: 502, body: JSON.stringify({ error: 'Email failed' }) };
  }

  if (response.status === 202) {
    return { statusCode: 200, body: JSON.stringify({ success: true }) };
  }
  console.error('SendGrid error:', response.status, await response.text());
  return { statusCode: 502, body: JSON.stringify({ error: 'Email failed' }) };
};
