// The findings of #137's SEO audit, turned into a suite that fails when one of
// them comes back.
//
// Every assertion here is a defect that was really on prospektor.ai on 24 Aug
// 2026, measured by `node tools/seo-audit.js` against production — not a
// checklist copied off an SEO blog. What was found, and what each test pins:
//
//   - nine article <title>s ran 74-110 characters, so Google truncated every
//     one of them and the brand never appeared;
//   - the 294-character site description was the meta description of `/`,
//     `/checkout/` AND `/checkout/done/` — one snippet, cut in half, on three
//     pages;
//   - eight of the seventeen indexable pages had NO structured data, and the
//     page with the price on it was one of them;
//   - the homepage outline read h1 → h3(empty) → h2, and /checkout/ had three
//     <h1>s;
//   - five of nine articles had exactly one inbound internal link, because
//     "related" articles were sorted by date.
//
// The build is done once, here, and read as files. Nothing hits the network.
const { test, describe, before, after } = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');

const ROOT = path.join(__dirname, '..');
const site = require('../src/_data/site.json');
const { siteBuild } = require('./helpers.js');
const { parse, tagAttr } = require('../tools/seo-audit.js');
const i18n = require('../lib/i18n.js');

// What a search result actually shows. Both are soft limits measured in pixels
// rather than characters, so they are rounded generously — the point is to
// catch a 294-character description, not to argue about 161.
const TITLE_MAX = 60;
const DESC_MAX = 160;

let SITE, built;
const htmlFiles = dir => fs.readdirSync(dir, { withFileTypes: true }).flatMap(e =>
  e.isDirectory() ? htmlFiles(path.join(dir, e.name))
    : e.name.endsWith('.html') ? [path.join(dir, e.name)] : []);

// Titles and descriptions are measured as a search result RENDERS them, not as
// the HTML spells them: `"Too expensive" is never why they left` is 37
// characters on the page and 49 in the source, because each quote is `&quot;`.
// Measuring the source failed this suite on two pages that were within budget.
const decode = s => s === null ? null : s
  .replace(/&quot;/g, '"').replace(/&#39;|&apos;/g, "'").replace(/&lt;/g, '<')
  .replace(/&gt;/g, '>').replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&');

const pages = () => htmlFiles(SITE).map(f => {
  const html = fs.readFileSync(f, 'utf8');
  const url = '/' + path.relative(SITE, f).replace(/index\.html$/, '').replace(/\\/g, '/');
  const attr = re => decode((html.match(re) || [])[1] ?? null);
  return {
    url, html,
    title: attr(/<title[^>]*>([\s\S]*?)<\/title>/i),
    description: attr(/<meta[^>]+name="description"[^>]+content="([^"]*)"/i),
    noindex: /<meta[^>]+name="robots"[^>]+content="[^"]*noindex/i.test(html),
    h1s: [...html.matchAll(/<h1\b[^>]*>([\s\S]*?)<\/h1>/gi)].map(m => m[1]),
    jsonld: [...html.matchAll(/<script[^>]+type="application\/ld\+json"[^>]*>([\s\S]*?)<\/script>/gi)]
      .map(m => m[1]),
  };
});

// Every page the sitemap asks Google to rank. Those are the ones a duplicate
// title or a missing description actually costs something on.
const indexable = () => {
  const sm = fs.readFileSync(path.join(SITE, 'sitemap.xml'), 'utf8');
  const urls = new Set([...sm.matchAll(/<loc>([^<]+)<\/loc>/g)]
    .map(m => m[1].replace(site.url, '') || '/'));
  return pages().filter(p => urls.has(p.url));
};

describe('SEO — the #137 findings, pinned', () => {
  before(() => { built = siteBuild('seo'); SITE = built.dir; });
  after(() => built && built.cleanup());

  // Every language builds its own /pricing/ (#114), and the Product block is in
  // all of them — so a schema assertion that reads only the English page passes
  // while three others are wrong.
  const pricingPages = () => {
    const found = pages().filter(p => /^(\/[a-z]{2})?\/pricing\/$/.test(p.url));
    assert.ok(found.length, 'no /pricing/ page was built');
    return found;
  };

  test('every title fits the result, or says why it cannot', () => {
    for (const p of pages())
      assert.ok(p.title && p.title.length <= TITLE_MAX,
        `${p.url}: title is ${p.title ? p.title.length : 0} chars (max ${TITLE_MAX}) — ` +
        `"${p.title}". Give the page a shorter \`seoTitle\` in its frontmatter; ` +
        `the <h1> a reader sees does not change.`);
  });

  test('every title is unique among the pages we ask to be ranked', () => {
    const seen = new Map();
    for (const p of indexable()) {
      assert.ok(!seen.has(p.title), `${p.url} and ${seen.get(p.title)} share the title "${p.title}"`);
      seen.set(p.title, p.url);
    }
  });

  test('every page has a description that fits the snippet', () => {
    for (const p of pages()) {
      assert.ok(p.description, `${p.url}: no meta description`);
      assert.ok(p.description.length <= DESC_MAX,
        `${p.url}: description is ${p.description.length} chars (max ${DESC_MAX}) — the tail is cut`);
    }
  });

  test('no two indexable pages share a description', () => {
    // The one that was really there: site.description served `/`, `/checkout/`
    // and `/checkout/done/`. A page that has not been given its own falls back
    // to site.json's, which is how three pages ended up identical in search.
    const seen = new Map();
    for (const p of indexable()) {
      assert.ok(!seen.has(p.description),
        `${p.url} and ${seen.get(p.description)} share a description — one of them needs its own`);
      seen.set(p.description, p.url);
    }
  });

  test('every page has exactly one h1', () => {
    for (const p of pages())
      assert.strictEqual(p.h1s.length, 1, `${p.url}: ${p.h1s.length} <h1> elements`);
  });

  test('no heading is empty', () => {
    // h1 → h3(empty) → h2 on the homepage: the scan result was marked up as a
    // heading and rendered blank until JavaScript filled it.
    for (const p of pages())
      for (const m of p.html.matchAll(/<h([1-6])\b[^>]*>([\s\S]*?)<\/h\1>/gi))
        assert.ok(m[2].replace(/<[^>]*>/g, '').trim(),
          `${p.url}: empty <h${m[1]}> — if it is filled by script it is not a heading`);
  });

  test('every structured-data block is valid JSON', () => {
    for (const p of pages())
      for (const block of p.jsonld)
        assert.doesNotThrow(() => JSON.parse(block), `${p.url}: invalid JSON-LD`);
  });

  test('Organization and WebSite are on every page, with the @ids the rest point at', () => {
    for (const p of pages()) {
      const types = p.jsonld.flatMap(b => {
        const v = JSON.parse(b);
        return (v['@graph'] || [v]).map(n => n['@type']);
      });
      assert.ok(types.includes('Organization'), `${p.url}: no Organization`);
      assert.ok(types.includes('WebSite'), `${p.url}: no WebSite`);
      assert.ok(p.html.includes(`"@id": "${site.url}/#organization"`), `${p.url}: no @id to reference`);
    }
  });

  test('every indexable page carries structured data beyond the sitewide pair', () => {
    // Eight pages had none at all. The sitewide Organization/WebSite closes
    // that for all of them; this asserts the pair is really reaching them.
    for (const p of indexable())
      assert.ok(p.jsonld.length >= 1, `${p.url}: no structured data`);
  });

  test('every Offer on /pricing/ is a price Stripe actually charges', () => {
    // The numbers in the schema and the numbers in the charge cannot be allowed
    // to drift: one of them is what a buyer reads in a search result and the
    // other is what leaves their card.
    //
    // #542 made this a set rather than a number, because there are now two ways
    // to buy the same workspace. It reads the function's own PLANS table rather
    // than the file's text, and it asserts in BOTH directions — a plan with no
    // Offer, and an Offer no plan backs, each fail — so adding a third plan and
    // forgetting the page is red, and so is inventing a price on the page.
    const { PLANS } = require(path.join(ROOT, 'netlify/functions/create-checkout-session.js'));
    const fn = fs.readFileSync(path.join(ROOT, 'netlify/functions/create-checkout-session.js'), 'utf8');
    const currency = (fn.match(/'line_items\[0\]\[price_data\]\[currency\]':\s*'(\w+)'/) || [])[1];
    assert.ok(currency, 'could not read the currency out of create-checkout-session.js');
    assert.ok(Object.keys(PLANS).length, 'create-checkout-session.js exports no plans');

    const pricing = pages().find(p => p.url === '/pricing/');
    const product = pricing.jsonld.map(JSON.parse).find(v => v['@type'] === 'Product');
    assert.ok(product, '/pricing/ has no Product structured data');
    const offers = [].concat(product.offers);
    // schema.org's own period for a recurring charge, per interval.
    const PERIOD = { month: 'P1M', year: 'P1Y' };

    const charged = Object.entries(PLANS).map(([name, p]) => ({
      name,
      price: (Number(p.unit_amount) / 100).toFixed(2),
      period: PERIOD[p.interval],
    }));
    for (const plan of charged) {
      assert.ok(plan.period, `no schema billingPeriod is written for the ${plan.name} interval`);
      const offer = offers.find(o => o.price === plan.price);
      assert.ok(offer, `Stripe charges ${plan.price} for the ${plan.name} plan; /pricing/ offers no such price`);
      assert.strictEqual(offer.priceCurrency, currency.toUpperCase());
      assert.strictEqual(offer.priceSpecification.price, plan.price);
      assert.strictEqual(offer.priceSpecification.billingPeriod, plan.period,
        `the ${plan.name} Offer is billed ${offer.priceSpecification.billingPeriod}, Stripe every ${plan.interval}`);
    }
    for (const offer of offers)
      assert.ok(charged.some(p => p.price === offer.price),
        `/pricing/ offers ${offer.price}, which no plan in create-checkout-session.js charges`);
  });

  // ---- #674, 15 Sep 2026. Two Search Console mails, five findings on the
  // Product block above. Three of the five are pinned here: one that was a
  // real defect, one that is now stated, and one that must never be "fixed".

  test('the Product on /pricing/ names a brand and a seller Google can read', () => {
    // The measured defect: `brand` was `{ "@id": ".../#organization" }`, a
    // pointer into the OTHER <script> block on the page. Valid JSON-LD, and
    // Search Console still said "Invalid object type for field brand" — it
    // does not resolve the reference across blocks, so it saw an untyped node.
    // A bare @id here is therefore the bug, in any language.
    for (const p of pricingPages()) {
      const product = p.jsonld.map(JSON.parse).find(v => v['@type'] === 'Product');
      assert.ok(product, `${p.url}: no Product structured data`);

      const named = (node, field) => {
        assert.ok(node && typeof node === 'object', `${p.url}: ${field} is not an object`);
        assert.ok(node['@type'], `${p.url}: ${field} has no @type — a bare @id is what Google rejected`);
        assert.ok(node.name, `${p.url}: ${field} has no name`);
      };
      named(product.brand, 'brand');
      assert.strictEqual(product.brand['@type'], 'Brand',
        `${p.url}: Google's Product documentation asks for the Brand type`);
      for (const offer of [].concat(product.offers)) named(offer.seller, 'seller');
    }
  });

  test('every Offer on /pricing/ carries the money-back promise the page makes in words', () => {
    // The page says "money back if it doesn't earn its keep" in the hero, in
    // the buy line and in a FAQ answer that puts no clock on it. Until #674
    // the markup said none of it, and Search Console asked for the field by
    // name. The assertion runs both ways: the promise in words and the promise
    // in markup have to keep agreeing, so dropping either one fails.
    for (const p of pricingPages()) {
      const product = p.jsonld.map(JSON.parse).find(v => v['@type'] === 'Product');
      for (const offer of [].concat(product.offers)) {
        const policy = offer.hasMerchantReturnPolicy;
        assert.ok(policy, `${p.url}: the ${offer.name} Offer has no hasMerchantReturnPolicy`);
        assert.strictEqual(policy['@type'], 'MerchantReturnPolicy');
        assert.ok(policy.merchantReturnLink,
          `${p.url}: no merchantReturnLink — it is what satisfies Google without a country list`);
        assert.strictEqual(policy.returnPolicyCategory,
          'https://schema.org/MerchantReturnUnlimitedWindow',
          `${p.url}: the FAQ promises a refund with no window; the markup must say the same`);
      }
    }
    // The words themselves, on the English page, so the two cannot drift apart.
    const en = pages().find(p => p.url === '/pricing/');
    assert.match(en.html, /money back/i,
      '/pricing/ no longer promises money back — then the schema must stop promising it too');
  });

  test('/pricing/ invents no rating, no review and no shipment', () => {
    // This one guards against a FIX, not against a regression, and it is the
    // reason the other two exist. Search Console also asks /pricing/ for
    // `aggregateRating`, `review` and `shippingDetails`. All three are
    // non-critical suggestions that suppress nothing, and all three are absent
    // because they would be untrue: Prospektor has no customers yet, so it has
    // no ratings and no reviews, and a workspace is not shipped anywhere.
    //
    // Fabricated review markup is against Google's structured data policy and
    // is grounds for a manual action against the whole domain. So the day
    // somebody clears the warning by writing "4.8 from 37 reviews", this test
    // goes red and says why. When the reviews are REAL, delete this test in
    // the same commit that adds them — that is the only honest way past it.
    for (const p of pricingPages()) {
      const product = p.jsonld.map(JSON.parse).find(v => v['@type'] === 'Product');
      for (const field of ['aggregateRating', 'review', 'reviews'])
        assert.ok(!(field in product),
          `${p.url}: Product.${field} is set. If these are real customer reviews, delete this test with the commit that adds them; if they are not, Google calls this a policy violation.`);
      for (const offer of [].concat(product.offers))
        assert.ok(!('shippingDetails' in offer),
          `${p.url}: the ${offer.name} Offer declares shippingDetails. Nothing is shipped — a workspace is a login.`);
    }
  });

  test('every article is reachable from three other articles, not one', () => {
    // The measured defect: `related` sorted by date, so inbound links ran
    // 9,9,9,4,1,1,1,1,1 and five articles were reachable only from the hub.
    // A ring makes the count identical for every article by construction, so
    // this asserts evenness rather than a floor — a floor would pass again the
    // moment somebody re-sorted by date and left one article on top.
    //
    // ── #446: the evenness is asserted of the RING, not of every link ──────
    //
    // This used to count every `/resources/` link on the page, which conflated
    // two things that want opposite guarantees. The ring is STRUCTURAL and must
    // stay perfectly even — that is #137 F4's whole finding. An in-prose link
    // written by a human into an article's body is EDITORIAL, and a topic
    // cluster is deliberately uneven on purpose: a pillar page having more
    // inbound links than its spokes is what makes it the pillar.
    //
    // Counting them together meant the first hand-written cluster link failed
    // this test, and the only ways to pass were to delete the link or to relax
    // the assertion to a floor — the floor the comment above correctly refuses.
    // So the ring is measured where the ring actually lives, which is strictly
    // sharper than before: a prose link can no longer mask a ring that has
    // stopped being a ring, and it could have.
    const articles = pages().filter(p => /^\/resources\/.+\//.test(p.url));
    assert.ok(articles.length >= 4, 'expected the resources collection to be populated');

    const linksIn = (html, url) => new Set(
      [...html.matchAll(/href="(\/resources\/[^"#?]+\/)"/g)].map(m => m[1])
    ).has(url);

    // The "Keep reading" block — what `related` emits, and nothing else.
    const keepReading = html =>
      (html.match(/<section class="res-more">[\s\S]*?<\/section>/) || [''])[0];

    const ring = Object.fromEntries(articles.map(a => [a.url, 0]));
    const total = Object.fromEntries(articles.map(a => [a.url, 0]));
    for (const from of articles) {
      for (const to of Object.keys(ring)) {
        if (to === from.url) continue;
        if (linksIn(keepReading(from.html), to)) ring[to]++;
        if (linksIn(from.html, to)) total[to]++;
      }
    }

    const ringCounts = [...new Set(Object.values(ring))];
    assert.strictEqual(ringCounts.length, 1,
      `the ring is no longer even — is \`related\` sorting again? ${JSON.stringify(ring)}`);
    assert.ok(ringCounts[0] >= 3, `the ring gives each article only ${ringCounts[0]} inbound links`);

    // And nothing may be BELOW the ring: an article the ring skips is the
    // orphan F4 was about, whatever the prose does.
    for (const [url, n] of Object.entries(total)) {
      assert.ok(n >= ringCounts[0], `${url} has ${n} inbound article links, below the ring's ${ringCounts[0]}`);
    }
  });

  test('every article carries Article and BreadcrumbList', () => {
    for (const p of pages().filter(p => /^\/resources\/.+\//.test(p.url))) {
      const types = p.jsonld.flatMap(b => {
        const v = JSON.parse(b);
        return (v['@graph'] || [v]).map(n => n['@type']);
      });
      assert.ok(types.includes('Article'), `${p.url}: no Article`);
      assert.ok(types.includes('BreadcrumbList'), `${p.url}: no BreadcrumbList`);
    }
  });

  test('every help guide carries TechArticle and BreadcrumbList', () => {
    // #166 gave each guide its own URL. A guide page three levels of meaning
    // deep with no machine-readable path back up is the same defect #137 found
    // on the articles, so it is closed here at the same time rather than
    // waiting to be measured again.
    const guides = pages().filter(p => /^\/help\/.+\//.test(p.url));
    assert.ok(guides.length >= 4, 'expected the help guides to be built');
    for (const p of guides) {
      const types = p.jsonld.flatMap(b => {
        const v = JSON.parse(b);
        return (v['@graph'] || [v]).map(n => n['@type']);
      });
      assert.ok(types.includes('TechArticle'), `${p.url}: no TechArticle`);
      assert.ok(types.includes('BreadcrumbList'), `${p.url}: no BreadcrumbList`);
    }
  });

  test('canonical, lang and viewport are on every page', () => {
    for (const p of pages()) {
      const canonical = (p.html.match(/<link[^>]+rel="canonical"[^>]+href="([^"]*)"/i) || [])[1];
      assert.strictEqual(canonical, site.url + p.url, `${p.url}: canonical is ${canonical}`);
      // The language is the URL's (#114): `/es/…` says es, the rest says en.
      assert.match(p.html, new RegExp(`<html[^>]+lang="${i18n.localeOf(p.url)}"`), `${p.url}: wrong or no lang`);
      assert.match(p.html, /<meta[^>]+name="viewport"/, `${p.url}: no viewport`);
    }
  });

  // ── #446 ──────────────────────────────────────────────────────────────
  // Two checks the portable SEO brief asks for that #137's pass did not have.
  // Neither defect is on this site today; both are silent when they arrive,
  // which is the only reason they are worth a test rather than a look.

  test('no page leaves a tag unterminated in <head>', () => {
    // The brief puts this first, and its story is the argument: a scripted
    // head insert left `<link rel="canonical">` without its `>` across 36
    // files, swallowing every tag after it, and nobody noticed for weeks.
    // What makes it worth pinning is how it FAILS — not with a broken page,
    // but by deleting the canonical, the OG card and the JSON-LD from the
    // document a crawler sees, so every other check here reports "absent" and
    // sends the reader to add a tag the template already has.
    for (const p of pages()) {
      const { unterminated } = parse(p.html, site.url + p.url);
      assert.deepEqual(unterminated, [], `${p.url}: unterminated in <head>`);
    }
  });

  test('the audit reads an attribute whose value contains the other quote', () => {
    // `content=["']([^"']*)["']` — the spelling tools/seo-audit.js used until
    // #446 — terminates on the first quote of EITHER kind, so one apostrophe
    // inside a double-quoted value truncates the capture and the tool reports
    // a healthy 155-character description as 30 characters.
    //
    // Nothing on this site triggers it, because Nunjucks escapes `'` to
    // `&#39;` inside an attribute. That is luck rather than design — one
    // `| safe` on a description starts it lying — and a measuring tool that
    // lies quietly is worse than no tool, so the delimiter is back-referenced
    // and this is what says so.
    const apostrophe = `<meta name="description" content="Toronto's best, and why that matters">`;
    assert.strictEqual(
      tagAttr(apostrophe, /<meta[^>]+name=["']description["'][^>]*>/i, 'content'),
      "Toronto's best, and why that matters");

    const quoted = `<meta name='description' content='She said "no" and meant it'>`;
    assert.strictEqual(
      tagAttr(quoted, /<meta[^>]+name=["']description["'][^>]*>/i, 'content'),
      'She said "no" and meant it');

    // And attribute ORDER stops mattering: `content=` before `name=` is valid
    // HTML, and the old one-regex spelling needed a hand-written second
    // alternation to cope with it — which existed for `description` alone, so
    // every other field was one reordered attribute away from reading null.
    const reordered = `<meta content="Ordered the other way" name="description">`;
    assert.strictEqual(
      tagAttr(reordered, /<meta[^>]+name=["']description["'][^>]*>/i, 'content'),
      'Ordered the other way');
  });
});
