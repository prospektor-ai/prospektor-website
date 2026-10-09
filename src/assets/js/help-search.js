/* The help hub's search (studio #1201): filters the articles by title and
   dek, from the index the build wrote into the page (#helpIndex). No storage
   and no strings of its own: every sentence is in the page, in the page's
   language, and this only shows or hides it. Typing asks the network nothing.

   When nothing matches, Ask (or Enter) sends the question to the studio's
   /api/help-ask (#1224), which answers from the help articles only and names
   the articles it used; those come back as the same cards the search shows.

   Every word typed must appear in the title or the dek (accents and case
   ignored, a plural folded onto its word); title hits are listed first. */
(function () {
  'use strict';
  var input = document.getElementById('helpSearch');
  var data = document.getElementById('helpIndex');
  var hub = document.getElementById('helpHub');
  var results = document.getElementById('helpResults');
  var hits = document.getElementById('helpHits');
  var none = document.getElementById('helpNone');
  var askBtn = document.getElementById('helpAsk');
  var box = document.getElementById('helpAnswer');
  var thinking = document.getElementById('helpThinking');
  var said = document.getElementById('helpAnswerText');
  var from = document.getElementById('helpAnswerFrom');
  var foot = document.getElementById('helpAnswerFoot');
  var fail = document.getElementById('helpAnswerFail');
  var API = 'https://studio.prospektor.ai/api/help-ask';
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

  var rows = index.map(function (a) {
    return { a: a, title: ' ' + words(a.t).join(' '), all: ' ' + words(a.t + ' ' + a.d).join(' ') };
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

  var asked = 0;
  function clearAnswer() {
    asked += 1;
    if (box) box.hidden = true;
  }

  function run() {
    clearAnswer();
    var terms = words(input.value);
    if (!terms.length) {
      if (askBtn) askBtn.hidden = true;
      results.hidden = true;
      hub.hidden = false;
      return;
    }
    var found = rows.filter(function (r) {
      return terms.every(function (w) { return r.all.indexOf(' ' + w) >= 0; });
    }).map(function (r) {
      var score = terms.filter(function (w) { return r.title.indexOf(' ' + w) >= 0; }).length;
      return { r: r, score: score };
    }).sort(function (x, y) { return y.score - x.score; });
    while (hits.firstChild) hits.removeChild(hits.firstChild);
    found.forEach(function (f) { hits.appendChild(card(f.r.a)); });
    none.hidden = found.length > 0;
    if (askBtn) askBtn.hidden = found.length > 0;
    results.hidden = false;
    hub.hidden = true;
  }

  function slugOf(u) { var m = /\/help\/([^/]+)\/$/.exec(u || ''); return m ? m[1] : ''; }

  function ask() {
    var question = input.value.trim();
    if (!box || !question) return;
    var mine = ++asked;
    none.hidden = true;
    askBtn.hidden = true;
    said.textContent = '';
    while (from.firstChild) from.removeChild(from.firstChild);
    foot.hidden = true;
    fail.hidden = true;
    thinking.hidden = false;
    box.hidden = false;
    function failed() {
      if (mine !== asked) return;
      thinking.hidden = true;
      fail.hidden = false;
    }
    fetch(API, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ question: question, lang: document.documentElement.lang || 'en' })
    }).then(function (r) { return r.ok ? r.json() : null; }).then(function (a) {
      if (mine !== asked) return;
      if (!a || !a.answer) return failed();
      thinking.hidden = true;
      said.textContent = a.answer;
      (a.articles || []).forEach(function (name) {
        var row = rows.filter(function (r) { return slugOf(r.a.u) === name; })[0];
        if (row) from.appendChild(card(row.a));
      });
      foot.hidden = false;
    }).catch(failed);
  }

  input.addEventListener('input', run);
  if (askBtn) askBtn.addEventListener('click', function (e) { e.preventDefault(); ask(); });
  input.addEventListener('keydown', function (e) {
    if (e.key === 'Enter' && askBtn && !askBtn.hidden) { e.preventDefault(); ask(); }
  });
  if (input.value) run();
})();
