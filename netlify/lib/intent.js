// A second-workspace intent, as the studio signs it (studio #1240, lib/intent.js).
//
// The studio mints a token `base64url(JSON{ id, email, domain, exp }).HMAC`
// signed with the one secret the two deploys share (PROVISION_SECRET there,
// STUDIO_PROVISION_SECRET here). create-checkout-session verifies it before it
// lets an address that already owns a studio past the ownership guard; the
// webhook forwards the same token to /api/provision, which verifies it again
// and redeems it once. Nothing here reads a store: a verified token says only
// who may buy what, and the studio decides whether it has already been spent.

const crypto = require('node:crypto');

function verifyIntent(token, secret) {
  const text = String(token || '');
  const key = String(secret || '');
  if (key.length < 32 || text.length > 1200) return null;
  const dot = text.lastIndexOf('.');
  if (dot <= 0) return null;
  const payload = text.slice(0, dot);
  const expected = Buffer.from(crypto.createHmac('sha256', key).update(payload).digest('base64url'));
  const given = Buffer.from(text.slice(dot + 1));
  if (given.length !== expected.length || !crypto.timingSafeEqual(given, expected)) return null;
  let claims;
  try {
    claims = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8'));
  } catch (e) {
    return null;
  }
  if (!claims || typeof claims !== 'object') return null;
  const { id, email, domain, exp } = claims;
  if (typeof id !== 'string' || !/^int-[A-Za-z0-9_-]{1,80}$/.test(id)) return null;
  if (typeof email !== 'string' || typeof domain !== 'string') return null;
  if (!Number.isFinite(Number(exp)) || Number(exp) < Date.now()) return null;
  return { id, email: email.toLowerCase(), domain: domain.toLowerCase(), exp: Number(exp) };
}

// The studio's own grammar, for tests and tools that need to mint one here.
function signIntent(claims, secret) {
  const payload = Buffer.from(JSON.stringify(claims)).toString('base64url');
  return payload + '.' + crypto.createHmac('sha256', String(secret)).update(payload).digest('base64url');
}

module.exports = { verifyIntent, signIntent };
