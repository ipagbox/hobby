// Generate PWA PNG icons from scratch (no external dependencies)
// Creates proper-sized PNG icons with a simple teal clipboard design
const fs = require('fs');
const path = require('path');
const zlib = require('zlib');

/**
 * Build a valid PNG file buffer at the given size with a teal icon on dark background
 */
function createPNG(size) {
  // RGBA pixel data: each row has a filter byte (0 = None) + size * 4 bytes
  const raw = Buffer.alloc((1 + size * 4) * size);

  const bgR = 0x1a, bgG = 0x1a, bgB = 0x2e;
  const fgR = 0x16, fgG = 0xa5, fgB = 0x96;

  // Draw background and a simple clipboard shape
  const cx = size / 2;
  const cy = size / 2;
  const pad = size * 0.18; // padding from edges
  const cornerR = size * 0.12;

  // Clipboard body bounds
  const bodyLeft = pad;
  const bodyRight = size - pad;
  const bodyTop = pad + size * 0.06;
  const bodyBottom = size - pad;

  // Clip tab bounds (centered top)
  const tabW = size * 0.28;
  const tabH = size * 0.10;
  const tabLeft = cx - tabW / 2;
  const tabRight = cx + tabW / 2;
  const tabTop = pad - size * 0.02;
  const tabBottom = tabTop + tabH;

  // Line positions inside the body
  const lineLeft = bodyLeft + size * 0.12;
  const lineRight = bodyRight - size * 0.12;
  const lineThick = Math.max(2, Math.round(size * 0.028));

  for (let y = 0; y < size; y++) {
    const rowOffset = y * (1 + size * 4);
    raw[rowOffset] = 0; // filter byte: None
    for (let x = 0; x < size; x++) {
      const px = rowOffset + 1 + x * 4;
      let r = bgR, g = bgG, b = bgB, a = 255;

      // Rounded rect check helper
      const inRoundedRect = (left, top, right, bottom, radius) => {
        if (x < left || x > right || y < top || y > bottom) return false;
        // Check corners
        const corners = [
          [left + radius, top + radius],
          [right - radius, top + radius],
          [left + radius, bottom - radius],
          [right - radius, bottom - radius],
        ];
        for (const [cx2, cy2] of corners) {
          const isCornerQuadrant =
            (x < left + radius && y < top + radius) ||
            (x > right - radius && y < top + radius) ||
            (x < left + radius && y > bottom - radius) ||
            (x > right - radius && y > bottom - radius);
          if (isCornerQuadrant) {
            const dx = x - cx2;
            const dy = y - cy2;
            if (dx * dx + dy * dy > radius * radius) return false;
          }
        }
        return true;
      };

      // Body outline (filled rounded rect, then hollow out interior)
      const borderW = Math.max(2, Math.round(size * 0.032));
      const inBody = inRoundedRect(bodyLeft, bodyTop, bodyRight, bodyBottom, cornerR);
      const inBodyInner = inRoundedRect(
        bodyLeft + borderW, bodyTop + borderW,
        bodyRight - borderW, bodyBottom - borderW,
        Math.max(0, cornerR - borderW)
      );

      // Tab (small rounded rect at top center)
      const tabR = size * 0.04;
      const inTab = inRoundedRect(tabLeft, tabTop, tabRight, tabBottom, tabR);
      const inTabInner = inRoundedRect(
        tabLeft + borderW, tabTop + borderW,
        tabRight - borderW, tabBottom - borderW,
        Math.max(0, tabR - borderW)
      );

      // Horizontal lines inside the body
      const line1Y = bodyTop + (bodyBottom - bodyTop) * 0.30;
      const line2Y = bodyTop + (bodyBottom - bodyTop) * 0.48;
      const line3Y = bodyTop + (bodyBottom - bodyTop) * 0.66;
      const inLine = (ly) => x >= lineLeft && x <= lineRight && y >= ly && y < ly + lineThick;

      if ((inBody && !inBodyInner) || (inTab && !inTabInner)) {
        r = fgR; g = fgG; b = fgB;
      } else if (inLine(line1Y) || inLine(line2Y) || inLine(line3Y)) {
        r = fgR; g = fgG; b = fgB;
      }

      // Round outer edges of full image (rounded square icon mask)
      const imgR = size * 0.15;
      const inImage = inRoundedRect(0, 0, size - 1, size - 1, imgR);
      if (!inImage) a = 0;

      raw[px] = r;
      raw[px + 1] = g;
      raw[px + 2] = b;
      raw[px + 3] = a;
    }
  }

  // Build PNG file
  const signature = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);

  function makeChunk(type, data) {
    const len = Buffer.alloc(4);
    len.writeUInt32BE(data.length);
    const typeBuffer = Buffer.from(type, 'ascii');
    const crcData = Buffer.concat([typeBuffer, data]);
    const crc = Buffer.alloc(4);
    crc.writeUInt32BE(crc32(crcData) >>> 0);
    return Buffer.concat([len, typeBuffer, data, crc]);
  }

  // IHDR
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);   // width
  ihdr.writeUInt32BE(size, 4);   // height
  ihdr[8] = 8;                   // bit depth
  ihdr[9] = 6;                   // color type: RGBA
  ihdr[10] = 0;                  // compression
  ihdr[11] = 0;                  // filter
  ihdr[12] = 0;                  // interlace

  // IDAT (compressed pixel data)
  const compressed = zlib.deflateSync(raw);

  // IEND
  const iend = Buffer.alloc(0);

  return Buffer.concat([
    signature,
    makeChunk('IHDR', ihdr),
    makeChunk('IDAT', compressed),
    makeChunk('IEND', iend),
  ]);
}

// CRC32 for PNG chunks
function crc32(buf) {
  let crc = 0xffffffff;
  for (let i = 0; i < buf.length; i++) {
    crc ^= buf[i];
    for (let j = 0; j < 8; j++) {
      crc = (crc >>> 1) ^ ((crc & 1) ? 0xedb88320 : 0);
    }
  }
  return crc ^ 0xffffffff;
}

// Generate both sizes
const icon192 = createPNG(192);
const icon512 = createPNG(512);

fs.writeFileSync(path.join(__dirname, 'public', 'icons', 'icon-192.png'), icon192);
fs.writeFileSync(path.join(__dirname, 'public', 'icons', 'icon-512.png'), icon512);

console.log(`Generated icon-192.png (${icon192.length} bytes) and icon-512.png (${icon512.length} bytes)`);
