/* The help hub's search (studio #1201): ranks the articles against what was
   typed, from the index the build wrote into the page (#helpIndex). No
   network, no storage, no strings of its own: the "nothing matches" sentence
   is in the page, in the page's language, and this only shows or hides it.

   People type questions, not titles ("how do I get a warm intro"), so the
   small words are dropped and an article needs only most of the rest, found
   in its title, topic, dek or steps (accents and case ignored, a plural
   folded onto its word, a word matching the start of a longer one). A word
   in the title counts most and one in the steps least. */
(function () {
  'use strict';
  var input = document.getElementById('helpSearch');
  var data = document.getElementById('helpIndex');
  var hub = document.getElementById('helpHub');
  var results = document.getElementById('helpResults');
  var hits = document.getElementById('helpHits');
  var none = document.getElementById('helpNone');
  if (!input || !data || !hub || !results || !hits || !none) return;

  var index;
  try { index = JSON.parse(data.textContent) || []; } catch (e) { return; }

  function fold(s) {
    s = String(s || '').toLowerCase();
    if (s.normalize) s = s.normalize('NFD').replace(/[̀-ͯ]/g, '');
    return s.replace(/[’']/g, '');
  }
  function stem(w) { return w.length > 4 && /es$/.test(w) ? w.slice(0, -2) : w.length > 3 && /s$/.test(w) ? w.slice(0, -1) : w; }
  function words(s) { return fold(s).split(/[^a-z0-9]+/).filter(function (w) { return w.length > 1; }).map(stem); }
  // The words a question is built from, in the two languages the help is in.
  var SMALL = (' how what when where why who which can could do does did is are was be the and for with from into'
    + ' you your yours my me our we it its this that these those there then than have has get got make want need'
    + ' to of in on at by or an as if not no so up out about any some all one'
    + ' como que cuando donde por para con una uno los las del el la en es mi mis tu tus su sus se lo le hay'
    + ' hacer puedo quiero necesito ').split(' ');
  function isSmall(w) { return SMALL.indexOf(w) >= 0; }

  var rows = index.map(function (a) {
    function pad(s) { return ' ' + words(s).join(' '); }
    return { a: a, t: pad(a.t), k: pad(a.k), d: pad(a.d), b: pad(a.b) };
  });

  function card(a) {
    var link = document.createElement('a');
    link.className = 'hp-next-card hp-hit';
    link.href = a.u;
    if (a.l && a.l !== document.documentElement.lang) link.lang = a.l;
    var text = document.createElement('span');
    var t = document.createElement('strong');
    t.textContent = a.t;
    var d = document.createElement('span');
    d.className = 'hp-hit-dek';
    d.textContent = a.d;
    text.appendChild(t);
    text.appendChild(d);
    var arrow = document.createElement('span');
    arrow.setAttribute('aria-hidden', 'true');
    arrow.textContent = '›';
    link.appendChild(text);
    link.appendChild(arrow);
    return link;
  }

  function run() {
    var typed = words(input.value);
    if (!typed.length) {
      results.hidden = true;
      hub.hidden = false;
      return;
    }
    // A query made only of small words ("how do I") still searches them.
    var terms = typed.filter(function (w) { return !isSmall(w); });
    if (!terms.length) terms = typed;
    var needed = Math.max(1, Math.ceil(terms.length * 0.6));
    var found = rows.map(function (r) {
      var hit = 0, score = 0;
      terms.forEach(function (w) {
        var at = ' ' + w;
        var weight = r.t.indexOf(at) >= 0 ? 8 : r.k.indexOf(at) >= 0 ? 4 : r.d.indexOf(at) >= 0 ? 3 : r.b.indexOf(at) >= 0 ? 1 : 0;
        if (weight) { hit++; score += weight; }
      });
      return { r: r, hit: hit, score: score };
    }).filter(function (f) { return f.hit >= needed; })
      .sort(function (x, y) { return y.hit - x.hit || y.score - x.score; })
      .slice(0, 8);
    while (hits.firstChild) hits.removeChild(hits.firstChild);
    found.forEach(function (f) { hits.appendChild(card(f.r.a)); });
    none.hidden = found.length > 0;
    results.hidden = false;
    hub.hidden = true;
  }

  input.addEventListener('input', run);
  if (input.value) run();
})();
