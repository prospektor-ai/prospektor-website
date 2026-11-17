// Keep your CRM (#1396): the flow map on the homepage. The diagram and its
// side panel are built whole; this only decides which pane the panel shows,
// the one for the part under the pointer, the focus or the last tap. Nothing
// here says a sentence, fetches anything, or keeps anything on the visitor's
// device.
(function () {
  const map = document.querySelector('[data-flowmap]');
  if (!map) return;
  const panes = Array.prototype.slice.call(map.querySelectorAll('[data-pane]'));
  const nodes = Array.prototype.slice.call(map.querySelectorAll('[data-step]'));
  function show(node) {
    const step = node.getAttribute('data-step');
    panes.forEach(function (p) { p.hidden = p.getAttribute('data-pane') !== step; });
    nodes.forEach(function (n) { n.classList.toggle('is-on', n === node); });
  }
  nodes.forEach(function (n) {
    n.addEventListener('mouseenter', function () { show(n); });
    n.addEventListener('focus', function () { show(n); });
    n.addEventListener('click', function () { show(n); });
  });
})();
