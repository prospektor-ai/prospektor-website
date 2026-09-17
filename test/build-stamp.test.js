// The build stamp (#698): the one question production can always answer.
//
// A serverless-only change on this lane had no served byte to ask about, so
// it shipped on trust (#684). Now `checkout-session-status` names the build
// it is running on every response, read from `netlify/lib/build-stamp.js`,
// which `tools/build-stamp.js` rewrites from COMMIT_REF at the head of the
// Netlify build command. Three things are held here: the committed file is
// the placeholder and never a sha, the tool writes only a sha and only from
// COMMIT_REF, and the function answers the field on the responses a bare
// GET can reach, without a call to Stripe.
const { test, describe, beforeEach } = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const { stubFetch, resetEnv } = require('./helpers');
const stamp = require('../tools/build-stamp');
const fn = require('../netlify/functions/checkout-session-status');

const ROOT = path.join(__dirname, '..');
const get = (qs = {}) => fn.handler({ httpMethod: 'GET', queryStringParameters: qs });
const body = r => JSON.parse(r.body);

describe('the build stamp (#698)', () => {
  beforeEach(() => resetEnv());

  test('the committed stamp is the placeholder, never a sha', () => {
    const src = fs.readFileSync(stamp.STAMP_FILE, 'utf8');
    assert.match(src, /BUILD_COMMIT: null/,
      'netlify/lib/build-stamp.js carries a real sha. It is generated at build time and committed as null: '
      + 'a sha committed by hand is a stamp that lies about which build is running.');
    assert.strictEqual(require('../netlify/lib/build-stamp').BUILD_COMMIT, null);
  });

  test('the Netlify build command stamps before it builds, and npm run build does not', () => {
    const toml = fs.readFileSync(path.join(ROOT, 'netlify.toml'), 'utf8');
    assert.match(toml, /command = "node tools\/build-stamp\.js && npm run build"/,
      'netlify.toml must run tools/build-stamp.js ahead of the build, or every deploy answers commit: null');
    const pkg = require('../package.json');
    assert.ok(!/build-stamp/.test(pkg.scripts.build),
      'npm run build must not stamp: a local build would leave a sha in the working tree');
  });

  test('reads a sha from COMMIT_REF and nothing else', () => {
    assert.equal(stamp.readCommit({ COMMIT_REF: '7613713F1a' }), '7613713f1a');
    assert.equal(stamp.readCommit({ COMMIT_REF: 'a'.repeat(40) }), 'a'.repeat(40));
    assert.equal(stamp.readCommit({}), null, 'no COMMIT_REF is a local build: null');
    assert.equal(stamp.readCommit({ COMMIT_REF: 'main' }), null, 'a branch name is not a sha');
    assert.equal(stamp.readCommit({ COMMIT_REF: "'); process.exit(" }), null, 'nothing unexpected reaches the bundle');
  });

  test('renders the sha into the committed file, and null back to the placeholder byte for byte', () => {
    const committed = fs.readFileSync(stamp.STAMP_FILE, 'utf8');
    const stamped = stamp.render('7613713f1a');
    assert.match(stamped, /BUILD_COMMIT: '7613713f1a'/);
    assert.equal(stamped.replace(/'7613713f1a'/, 'null'), committed, 'only the value changes');
    assert.strictEqual(stamp.render(null), committed, 'a local run rewrites nothing');
  });

  test('checkout-session-status answers the field on a bare GET, with no call to Stripe', async () => {
    const calls = stubFetch([['api.stripe.com', { status: 200, body: {} }]]);
    const noKey = await get({});
    assert.equal(noKey.statusCode, 503);
    assert.ok('commit' in body(noKey), 'the unconfigured answer carries the stamp');
    process.env.STRIPE_SECRET_KEY = 'sk_test_x';
    const bare = await get({});
    assert.equal(bare.statusCode, 400);
    assert.deepEqual(body(bare), { error: 'Bad session id', commit: null });
    assert.equal(calls.length, 0, 'reading the build sha must never reach Stripe');
  });
});
