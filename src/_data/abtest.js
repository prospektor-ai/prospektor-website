// ── The homepage tiles test: drawings or photos (studio #1185) ──────────────
//
// FOR NILS: the four photos. The test switches itself on the first build after
// all four of these files are committed, and stays off while any one is
// missing:
//
//   src/assets/img/tiles/who.jpg     a founder at a kitchen table, laptop open,
//                                    circling one name on a printed list
//   src/assets/img/tiles/what.jpg    hands on a laptop, a short email on
//                                    screen, a coffee beside it
//   src/assets/img/tiles/intro.jpg   two people laughing over coffee, one
//                                    showing the other a phone
//   src/assets/img/tiles/learn.jpg   a small team round a whiteboard, one
//                                    ticking off a name
//
// Each one a JPEG, landscape, about 1200 x 800, under about 200 KB. The exact
// size does not matter: the build reads the real width and height out of the
// file. The tile crops to fill, so keep the subject near the middle.
// `test/ab.test.js` fails on a photo that is not a JPEG, is portrait, or is
// over 250 KB. The alt text a screen reader hears is the caption above, short,
// and lives in src/index.njk inside {% t %} so it is translated.
//
// What "on" means: the homepage (and its /de/, /es/, /nl/ twins) carries a
// one-line inline script in <head> that picks "draw" or "photo" with
// Math.random() on every page view and writes it to <html data-v>, before
// the first paint. CSS shows the drawing or the photo from that attribute;
// with JavaScript off there is no attribute and everybody sees the drawings.
// `src/assets/js/ab.js` then sends one beacon per event (a view; and at most
// once per view, a scan, a demo press, a sign-up press) to
// `netlify/functions/ab.js`, which adds one to a daily total per version.
// Nothing is written on the visitor's device and nothing about the visitor is
// stored with us, which is why consent.js's inventory has no row for it (the
// inventory lists what this origin puts on, or reads from, a device).
// `npm run ab` prints the totals and whether the gap is real yet.
//
// What "off" means: no photo markup, no inline script, no ab.js tag. The page
// is byte for byte the page it was before this file existed.

const fs = require('node:fs');
const path = require('node:path');

const DIR = path.join(__dirname, '..', 'assets', 'img', 'tiles');
const TILES = ['who', 'what', 'intro', 'learn'];

// Width and height from a JPEG's start-of-frame marker, so the <img> carries
// the photo's true size and the tile does not jump when it loads. Null for a
// file that is not a JPEG this can read.
function jpegSize(buf) {
  if (!buf || buf.length < 4 || buf[0] !== 0xff || buf[1] !== 0xd8) return null;
  let i = 2;
  while (i + 9 < buf.length) {
    if (buf[i] !== 0xff) return null;
    const marker = buf[i + 1];
    if (marker === 0xff) { i += 1; continue; }
    const len = buf.readUInt16BE(i + 2);
    // SOF0..SOF15, bar DHT (c4), JPG (c8) and DAC (cc).
    if (marker >= 0xc0 && marker <= 0xcf && ![0xc4, 0xc8, 0xcc].includes(marker)) {
      return { height: buf.readUInt16BE(i + 5), width: buf.readUInt16BE(i + 7) };
    }
    i += 2 + len;
  }
  return null;
}

function read(dir = DIR) {
  const photos = {};
  for (const name of TILES) {
    const file = path.join(dir, name + '.jpg');
    if (!fs.existsSync(file)) return { enabled: false, photos: {} };
    const size = jpegSize(fs.readFileSync(file)) || { width: 1200, height: 800 };
    photos[name] = { src: '/assets/img/tiles/' + name + '.jpg', ...size };
  }
  return { enabled: true, photos };
}

module.exports = read();
module.exports.read = read;
module.exports.jpegSize = jpegSize;
module.exports.TILES = TILES;
module.exports.DIR = DIR;
