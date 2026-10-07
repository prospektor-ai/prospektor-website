// The founding-spot door (studio #1160). It mails the hello@ inbox for a
// stranger, so it must escape what it is sent and must not let one caller send
// it without end. Its sibling `send-brief.js` had neither and was deleted; this
// file also holds that it stays deleted.
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

describe('reserve-spot', () => {
  beforeEach(() => { resetEnv(); fn._resetLimit(); process.env.SENDGRID_API_KEY = 'test-key'; });

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

  test('a vendor failure answers 502 without the vendor\'s words', async () => {
    stubFetch([['sendgrid', { status: 400, body: 'secret vendor detail' }]]);
    const r = await post({ email: 'a@b.co' });
    assert.equal(r.statusCode, 502);
    assert.ok(!r.body.includes('secret vendor detail'));
  });

  test('send-brief, the callerless mail door, stays deleted', () => {
    assert.ok(!fs.existsSync(path.join(__dirname, '../netlify/functions/send-brief.js')));
  });
});
