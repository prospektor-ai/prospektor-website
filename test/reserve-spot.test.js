// The founding-spot door (studio #1160, #1166). It mails the hello@ inbox for
// a stranger, so it must escape what it is sent, must not let one caller send
// it without end, and must not let every caller together send it without end
// either: the day has a ceiling in a shared store, and a store that cannot be
// reached closes the door rather than opening it. Its sibling `send-brief.js`
// had none of this and was deleted; this file also holds that it stays deleted.
const { test, describe, beforeEach } = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const { stubFetch, resetEnv } = require('./helpers');
const fn = require('../netlify/functions/reserve-spot');

const post = (body, ip = '203.0.113.7') => fn.handler({
  httpMethod: 'POST',
  headers: { 'x-nf-client-connection-ip': ip },
  body: JSON.stringify(body),
});

// A stand-in for the blob store: what the function reads and writes, in a Map,
// with the library's conditional write (an etag per version; `onlyIfMatch` and
// `onlyIfNew` answer `modified: false` on a lost race rather than writing).
const memStore = () => {
  const m = new Map(); const tags = new Map(); let v = 0;
  return {
    m,
    getWithMetadata: async k => (m.has(k) ? { data: m.get(k), etag: tags.get(k) } : null),
    set: async (k, value, cond = {}) => {
      if (cond.onlyIfNew && m.has(k)) return { modified: false };
      if (cond.onlyIfMatch && cond.onlyIfMatch !== tags.get(k)) return { modified: false };
      m.set(k, value); tags.set(k, 'v' + (++v));
      return { modified: true, etag: tags.get(k) };
    },
  };
};
const down = { getWithMetadata: async () => { throw new Error('store down'); }, set: async () => { throw new Error('store down'); } };

describe('reserve-spot', () => {
  let store;
  beforeEach(() => {
    resetEnv(); fn._resetLimit(); process.env.SENDGRID_API_KEY = 'test-key';
    store = memStore(); fn._setStoreForTests(store);
  });

  test('escapes what a stranger types before it reaches the mail', async () => {
    const calls = stubFetch([['sendgrid', { status: 202, body: '' }]]);
    const r = await post({ email: 'a@b.co', company: '<img src=x onerror=alert(1)>', goal: '"><script>' });
    assert.equal(r.statusCode, 200);
    const html = JSON.parse(calls[0].body).content[0].value;
    assert.ok(!html.includes('<img src=x'));
    assert.ok(!html.includes('<script>'));
    assert.ok(html.includes('&lt;img'));
  });

  test('one caller gets five sends a window, then 429 and nothing sent', async () => {
    const calls = stubFetch([['sendgrid', { status: 202, body: '' }]]);
    for (let i = 0; i < 5; i++) assert.equal((await post({ email: 'a@b.co' })).statusCode, 200);
    assert.equal((await post({ email: 'a@b.co' })).statusCode, 429);
    assert.equal(calls.length, 5);
    assert.equal((await post({ email: 'a@b.co' }, '198.51.100.9')).statusCode, 200, 'another caller is unaffected');
  });

  test('the day has a ceiling across every caller: past it, 429 and nothing sent', async () => {
    const calls = stubFetch([['sendgrid', { status: 202, body: '' }]]);
    const ip = i => `198.51.${Math.floor(i / 5)}.${i % 5}`; // never five from one address
    for (let i = 0; i < fn.DAILY_CAP; i++) assert.equal((await post({ email: 'a@b.co' }, ip(i))).statusCode, 200);
    const r = await post({ email: 'a@b.co' }, '192.0.2.1');
    assert.equal(r.statusCode, 429);
    assert.match(JSON.parse(r.body).error, /today/);
    assert.equal(calls.length, fn.DAILY_CAP);
    const [key, n] = [...store.m.entries()][0];
    assert.equal(key, new Date().toISOString().slice(0, 10), 'counted under the UTC date');
    assert.equal(Number(n), fn.DAILY_CAP, 'the refused call did not count');
  });

  test('a bot in the honeypot or a bad address never spends the day', async () => {
    stubFetch([]);
    assert.equal((await post({ email: 'a@b.co', hp: 'filled' })).statusCode, 200);
    assert.equal((await post({ email: 'not an address' })).statusCode, 400);
    assert.equal(store.m.size, 0);
  });

  test('a store that cannot be reached closes the door: 503, nothing sent', async () => {
    const calls = stubFetch([['sendgrid', { status: 202, body: '' }]]);
    fn._setStoreForTests(down);
    const r = await post({ email: 'a@b.co' });
    assert.equal(r.statusCode, 503);
    assert.equal(calls.length, 0);
    assert.ok(!r.body.includes('store down'));
  });

  test('a burst that reads the same count cannot all get through: the write is conditional', async () => {
    const calls = stubFetch([['sendgrid', { status: 202, body: '' }]]);
    // Every read sees the count frozen at one below the cap, as instances reading
    // at once would; only the first write lands, the rest lose the race.
    const key = new Date().toISOString().slice(0, 10);
    const inner = memStore();
    await inner.set(key, String(fn.DAILY_CAP - 1));
    const frozen = { ...inner, getWithMetadata: async () => ({ data: String(fn.DAILY_CAP - 1), etag: 'stale' }) };
    let first = true;
    frozen.set = async (k, value, cond) => { if (first) { first = false; return inner.set(k, value, { onlyIfNew: false }); } return { modified: false }; };
    fn._setStoreForTests(frozen);
    assert.equal((await post({ email: 'a@b.co' }, '192.0.2.10')).statusCode, 200, 'the one write that lands sends');
    const lost = await post({ email: 'a@b.co' }, '192.0.2.11');
    assert.equal(lost.statusCode, 503, 'a count that cannot be landed closes the door');
    assert.equal(calls.length, 1);
    assert.equal(inner.m.get(key), String(fn.DAILY_CAP));
  });

  test('a vendor failure answers 502 without the vendor\'s words', async () => {
    stubFetch([['sendgrid', { status: 400, body: 'secret vendor detail' }]]);
    const r = await post({ email: 'a@b.co' });
    assert.equal(r.statusCode, 502);
    assert.ok(!r.body.includes('secret vendor detail'));
  });

  test('a vendor that cannot be reached answers the same 502, not the platform\'s error', async () => {
    stubFetch([['sendgrid', new Error('ECONNRESET secret host')]]);
    const r = await post({ email: 'a@b.co' });
    assert.equal(r.statusCode, 502);
    assert.ok(!r.body.includes('secret host'));
  });

  test('send-brief, the callerless mail door, stays deleted', () => {
    assert.ok(!fs.existsSync(path.join(__dirname, '../netlify/functions/send-brief.js')));
  });
});
