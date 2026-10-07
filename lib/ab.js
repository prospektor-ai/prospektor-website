// The homepage tiles test's two arms (studio #1185), in one place: the counter
// (netlify/functions/ab.js) accepts a beacon for one of these and nothing
// else, and since studio #1195 checkout writes the arm a buyer saw into the
// session's `metadata[ab]`, and the webhook hands it to /api/provision, so the
// test can count paying customers and not only presses. A closed set, so a
// query parameter anybody can type never becomes a stored value of its own
// making: anything not on the list is nothing, and nothing is written.
const ARMS = ['draw', 'photo'];

const armOf = value => {
  const arm = String(value || '').trim().toLowerCase();
  return ARMS.includes(arm) ? arm : '';
};

module.exports = { ARMS, armOf };
