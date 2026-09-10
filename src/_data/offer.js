'use strict';
// What the build is allowed to promise on /integrations/close/ (#622).
//
// `close` is true only when the offer is armed in this build's environment, and
// the page writes its offer block only then — so the page and the charge cannot
// disagree in either direction: unarmed, nothing is promised and nothing is
// granted; armed, the sentence and `trial_period_days` come from the same
// `lib/trial.js` constant. See that file for why the env var cannot set the
// number, only arm it.
//
// A function rather than an object so Eleventy re-reads it per build — `npm test`
// builds the site twice, armed and dark, from one process.
const { TRIAL_DAYS, trialDays } = require('../../lib/trial.js');

module.exports = () => ({ trialDays: TRIAL_DAYS, close: trialDays() > 0 });
