// The commit this build was made from (#698).
//
// GENERATED AT BUILD TIME. The value committed here is always `null`, and
// `test/build-stamp.test.js` fails if a real sha is ever committed: a stale
// sha in the repo would be a stamp that lies about which build is running,
// and a lying stamp is worse than none.
//
// `tools/build-stamp.js` rewrites this file at the head of the Netlify build
// command (`netlify.toml`) from `COMMIT_REF`, which the platform sets for the
// build and not for the function runtime; the bundler then ships the value
// inside every function that requires it. `checkout-session-status` answers
// it as `commit` on every response, so a serverless-only change has one
// question production can always answer, the way the studio's `/api/me` does.
module.exports = { BUILD_COMMIT: null };
