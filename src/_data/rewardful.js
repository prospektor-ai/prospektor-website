'use strict';
// What the build is allowed to say about the partner programme (#885).
//
// `on` is true only when `REWARDFUL_API_KEY` is set in this build's
// environment. The layout writes the consent handoff for Rewardful's script
// only then, /partners/ carries the terms only then, and the sitemap lists it
// only then; dark, every one of those is absent and the pages are the pages
// they were. See lib/rewardful.js for the reasoning and the two variables.
//
// A function rather than an object so Eleventy re-reads it per build:
// `test/rewardful.test.js` builds the site lit and dark from one process.
const { rewardfulKey, signupUrl, SCRIPT_SRC } = require('../../lib/rewardful.js');

module.exports = () => {
  const key = rewardfulKey();
  return { on: !!key, key, signup: key ? signupUrl() : '', script: SCRIPT_SRC };
};
