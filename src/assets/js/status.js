// ── STATUS LINE (#980) ──
// Reads GET https://studio.prospektor.ai/api/status every half minute and
// writes one line and one note. The studio's heartbeat is the writer; this is
// a reader and nothing else. Spec: HANDOVER-website-funnel.md §4 in
// prospektor-ai/studio.
//
// English only, without the catalogue lookup: the page has no language twin, so its sentences
// would enter the inventory as untranslated noise in three catalogues.
(() => {
  const root = document.getElementById('status');
  if (!root) return;
  const API = root.getAttribute('data-api');
  const line = document.getElementById('statusLine');
  const note = document.getElementById('statusNote');
  const POLL_MS = 30000;
  const ASK_MS = 8000;

  const clock = iso => new Date(iso).toISOString().slice(11, 16) + ' UTC';

  // "4 minutes", "2 hours 10 minutes", "3 days": the reader is annoyed, so the
  // unit a person would say and nothing finer.
  const since = (fromIso, nowIso) => {
    const minutes = Math.max(0, Math.round((Date.parse(nowIso) - Date.parse(fromIso)) / 60000));
    if (minutes < 60) return minutes + (minutes === 1 ? ' minute' : ' minutes');
    const hours = Math.floor(minutes / 60);
    if (hours < 48) {
      const rest = minutes % 60;
      return hours + (hours === 1 ? ' hour' : ' hours') + (rest ? ' ' + rest + ' minutes' : '');
    }
    const days = Math.floor(hours / 24);
    return days + ' days';
  };

  const say = (headline, detail, state) => {
    line.textContent = headline;
    note.textContent = detail;
    root.setAttribute('data-state', state);
  };

  const render = s => {
    const now = s.now || new Date().toISOString();
    if (s.status === 'up') {
      say('Prospektor is up.', 'Last checked ' + clock(s.checked || now) + '. This page asks again every half minute.', 'up');
    } else if (s.status === 'back') {
      say('Prospektor is back.', 'Back since ' + clock(s.since) + ', ' + since(s.since, now) + ' ago. Everything is answering again.', 'back');
    } else if (s.status === 'down' && s.since) {
      say('Prospektor is degraded.',
        'The studio’s records have not answered since ' + clock(s.since) + ', ' + since(s.since, now) + ' ago. We know. A signed-in screen reconnects by itself once they do.', 'down');
    } else if (s.status === 'down') {
      say('Prospektor is degraded.', 'The studio’s records are not answering right now. A signed-in screen reconnects by itself once they do.', 'down');
    } else {
      say('No recent check.',
        (s.checked ? 'The last check was at ' + clock(s.checked) + ' and nothing has checked since. ' : 'Nothing has checked the studio yet. ') + 'Read this as unsure, not as up.', 'unknown');
    }
  };

  const ask = async () => {
    try {
      const r = await fetch(API, { cache: 'no-store', signal: AbortSignal.timeout(ASK_MS) });
      if (!r.ok) throw new Error(String(r.status));
      render(await r.json());
    } catch (e) {
      // The studio did not answer this page at all, which is its own kind of
      // down: say that, rather than a "since" nobody measured.
      say('Prospektor is not answering.', 'This page could not reach the studio just now. It asks again every half minute.', 'unreachable');
    }
  };

  ask();
  setInterval(ask, POLL_MS);
})();
