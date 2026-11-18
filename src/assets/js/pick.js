// Pick your CRM (#1398, /how-it-works/): one button per CRM, one setup panel
// shown at a time. Plain tabs: the pressed button is aria-selected, its panel
// loses `hidden`, the rest gain it. With JavaScript off the first panel shows
// and the buttons do nothing, which is the page a crawler reads.
(function () {
  var root = document.querySelector('[data-pick]');
  if (!root) return;
  var tabs = [].slice.call(root.querySelectorAll('[role="tab"]'));
  var panels = [].slice.call(root.querySelectorAll('[role="tabpanel"]'));
  function show(tab) {
    tabs.forEach(function (t) { t.setAttribute('aria-selected', t === tab ? 'true' : 'false'); });
    panels.forEach(function (p) { p.hidden = p.id !== tab.getAttribute('aria-controls'); });
  }
  tabs.forEach(function (t) { t.addEventListener('click', function () { show(t); }); });
})();
