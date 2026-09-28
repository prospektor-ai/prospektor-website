// The clickable demo (#767): one screen at a time.
//
// The page is built whole — ten figures in order, each with its screen, its
// lit element and its card — and every Back, Next, chapter button and lit
// element is a plain link to another figure's id. This script only decides
// which figure is showing: the one the hash names, or the first. So a link
// changes the hash, the hash changes the figure, and a URL with `#step-6` in
// it opens on step 6 for whoever it was sent to. The arrow keys do what Next
// and Back do. Nothing here says a sentence, fetches anything, or keeps
// anything on the visitor's device.
(function () {
  const stage = document.getElementById('demoStage');
  if (!stage) return;
  const steps = Array.prototype.slice.call(stage.querySelectorAll('.demo-step'));
  if (!steps.length) return;
  const ids = steps.map(function (s) { return s.id; });

  function current() {
    const i = ids.indexOf(location.hash.replace(/^#/, ''));
    return i < 0 ? 0 : i;
  }

  function render() {
    const at = current();
    steps.forEach(function (s, k) { s.hidden = k !== at; });
    stage.setAttribute('data-at', String(at + 1));
  }

  function go(i) {
    const k = Math.max(0, Math.min(ids.length - 1, i));
    if (k === current()) return;
    location.hash = ids[k];
  }

  stage.classList.add('is-live');
  window.addEventListener('hashchange', render);
  document.addEventListener('keydown', function (e) {
    if (e.altKey || e.ctrlKey || e.metaKey || e.shiftKey) return;
    if (e.target && /^(?:input|textarea|select)$/i.test(e.target.tagName)) return;
    if (e.key === 'ArrowRight') { e.preventDefault(); go(current() + 1); }
    else if (e.key === 'ArrowLeft') { e.preventDefault(); go(current() - 1); }
  });
  render();
})();
