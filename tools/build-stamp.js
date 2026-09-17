#!/usr/bin/env node
'use strict';

// Stamp the functions with the commit they were built from (#698).
//
//   node tools/build-stamp.js
//
// This runs at the head of the Netlify build command (`netlify.toml`) and
// exists because rule 5 of the thread protocol left one gap open on this
// lane: a thread is not done until its work is *asked of the live site*, and
// a serverless-only change (#684 was two of them, both behind the
// provisioning secret or a signed Stripe webhook) has no page byte that can
// tell the new build from the old. So a fix to a function shipped on trust.
//
// The studio closed the same gap with #306: `COMMIT_REF` is a BUILD variable,
// set while this script runs and not passed to the function runtime, so the
// value is written into `netlify/lib/build-stamp.js` before the functions are
// bundled, and `checkout-session-status` reads it from there. The one-line
// check this buys the lane:
//
//   curl -s https://prospektor.ai/.netlify/functions/checkout-session-status | grep -o '"commit":"[0-9a-f]*"'
//
// The committed file holds `null`, and a test keeps it that way. Outside a
// Netlify build there is no COMMIT_REF, so a local `npm run build` never
// rewrites the file with a sha that would then sit in the working tree:
// `render(null)` is byte for byte the committed placeholder.

const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.join(__dirname, '..');
const STAMP_FILE = path.join(ROOT, 'netlify', 'lib', 'build-stamp.js');

/** A commit sha and nothing else: anything unexpected becomes null rather than reaching the bundle. */
function readCommit(env = process.env) {
  const sha = (env.COMMIT_REF || '').trim();
  return /^[0-9a-f]{7,40}$/i.test(sha) ? sha.toLowerCase() : null;
}

/** The whole of `netlify/lib/build-stamp.js` for a commit; `null` renders the committed placeholder. */
function render(commit) {
  const committed = fs.readFileSync(STAMP_FILE, 'utf8');
  return committed.replace(/BUILD_COMMIT: (null|'[0-9a-f]+')/, `BUILD_COMMIT: ${commit ? `'${commit}'` : 'null'}`);
}

function stamp(env = process.env) {
  const commit = readCommit(env);
  const next = render(commit);
  if (fs.readFileSync(STAMP_FILE, 'utf8') !== next) fs.writeFileSync(STAMP_FILE, next);
  return commit;
}

if (require.main === module) {
  const commit = stamp();
  console.log(`build stamp: ${commit || 'null (no COMMIT_REF; checkout-session-status will answer commit: null)'}`);
}

module.exports = { STAMP_FILE, readCommit, render, stamp };
