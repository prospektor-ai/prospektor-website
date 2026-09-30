'use strict';
// /partners/ while the programme is dark is one line, *Coming soon*, and a
// one-line page is not one to ask search to rank: `noindex` until the key is
// set, and out of the sitemap the same way (src/sitemap.njk). Lit, it is a
// real page with the terms on it and indexes like any other.
module.exports = {
  eleventyComputed: {
    noindex: data => !(data.rewardful && data.rewardful.on),
  },
};
