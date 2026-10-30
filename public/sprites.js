// Pixel-art sprites, drawn as character maps and rendered to cached data URLs.
// Symmetric creatures are written as their left half and mirrored.
//
// Palette keys: O outline, B body, L light, D dark, W white, K pupil,
// P cheek, Y glow, M mouth, G secondary. "." is transparent.

const OUTLINE = '#0a1424';

const mirror = (rows) => rows.map((r) => r + [...r].reverse().join(''));

const SPRITES = {
  crab: {
    palette: { B: '#ef5a3c', L: '#ff9a74', D: '#a8321f' },
    rows: mirror([
      '........',
      '.OOO....',
      'OBLBO...',
      'OBBBO...',
      '.OBBOOO.',
      '..OBOWK.',
      '...OOOOO',
      '..OBBBBB',
      '.OBBLLBB',
      '.OBBBBBB',
      '.OBDBBBB',
      '..ODDDDD',
      '..OO.O.O',
      '.O..O..O',
    ]),
  },
  jelly: {
    palette: { B: '#d77bff', L: '#f3c4ff', D: '#9b45c9', P: '#ff9ccc' },
    rows: mirror([
      '........',
      '....OOOO',
      '...OBBBB',
      '..OBLLBB',
      '.OBLBBBB',
      '.OBBBBBB',
      '.OBBWKBB',
      '.OBPBBBB',
      '.ODBDBDB',
      '..O.O.O.',
      '..L.L.L.',
      '...L.L.L',
      '..L.L.L.',
      '...L...L',
    ]),
  },
  octopus: {
    palette: { B: '#ff8a3d', L: '#ffc08a', D: '#c25a1c', P: '#ff5c7a' },
    rows: mirror([
      '........',
      '.....OOO',
      '....OBBB',
      '...OBLBB',
      '..OBLBBB',
      '..OBBBBB',
      '..OBWKBB',
      '..OBPBBB',
      '...OBBBB',
      '..OBBOBB',
      '.OBO.OBO',
      '.OO.OBO.',
      '....OO..',
      '........',
    ]),
  },
  squid: {
    palette: { B: '#f4ead2', L: '#ffffff', D: '#c9b68e', K: '#2a1a3a' },
    rows: mirror([
      '.......O',
      '......OB',
      '.....OBL',
      '....OBLB',
      '...OBBBB',
      '..OOBBBB',
      '.OBOBBBB',
      '...OBBBB',
      '...OWKBB',
      '...OBBBB',
      '...OBDBD',
      '...O.O.O',
      '..O.O..O',
      '........',
    ]),
  },
  ray: {
    palette: { B: '#4fa3ff', L: '#9fd0ff', D: '#2d6cc0' },
    rows: mirror([
      '........',
      '........',
      '.......O',
      '......OB',
      '....OOBB',
      '..OOBBBL',
      'OOBBBLBB',
      '.OBBBWKB',
      '..OBBBBB',
      '...OODBB',
      '.....OOD',
      '.......O',
      '.......O',
      '........',
    ]),
  },
  fish: {
    palette: { B: '#ffb02e', L: '#ffd98a', D: '#d67a10' },
    rows: [
      '................',
      '................',
      '......OOOO......',
      '....OOBBBBOO....',
      'O..OBBWBBLLBO...',
      'OOOBBBWBBBWKBO..',
      'OBOBBBWBBBWWBBO.',
      'OBBBBBWBBBBBBBBO',
      'OBOBBBWBBBBBBBO.',
      'OOOBBBWBBBBBDO..',
      'O..OBBWBBBBDO...',
      '....OODDDDOO....',
      '......OOOO......',
      '................',
    ],
  },
  turtle: {
    palette: { B: '#a8e06a', L: '#4fbf73', D: '#2a8a4e' },
    rows: [
      '................',
      '................',
      '................',
      '.....OOOOOO.....',
      '....OLDLDLDO.OO.',
      '...OLDLDLDLDOBBO',
      '..ODLDLDLDLDOBKO',
      '..ODDDDDDDDDOBBO',
      '.OOOOOOOOOOOOBO.',
      'OBBO.OBBO.OBBO..',
      '.OO...OO...OO...',
      '................',
      '................',
      '................',
    ],
  },
  seahorse: {
    palette: { B: '#ffd23f', L: '#fff0a0', D: '#e0a000' },
    rows: [
      '......OOO.......',
      '.....OBBBO......',
      '....OBBKBBOOO...',
      '....OBBBBBBBBO..',
      '.....OOBBOOOO...',
      '....OBBBBO......',
      '...OBLBBO.......',
      '..OBLBBBO.......',
      '..OBLBBBBO......',
      '...OBLBBBO......',
      '....OBBBO.......',
      '.....OBBO..O....',
      '......OBBOOBO...',
      '.......OBBBO....',
    ],
  },
  eel: {
    palette: { B: '#3fd1b5', L: '#9ff2df', D: '#1f8f7a' },
    rows: [
      '................',
      '................',
      '..........OOOO..',
      '.........OBBBBO.',
      '........OBBWKBBO',
      '........OBLBBBO.',
      '...OOO..OBBOOO..',
      '..OBBBO.OBBO....',
      '.OBLOBBOBBO.....',
      '.OBO.OBBBO......',
      '..O...OOO.......',
      '................',
      '................',
      '................',
    ],
  },
  whale: {
    palette: { B: '#5b7cff', L: '#c7d3ff', D: '#3a52c4' },
    rows: [
      '................',
      '..........L.L...',
      '...........L....',
      '.....OOOOOOOO...',
      '...OOBBBBBBBBOO.',
      '..OBBBBBBBBBBBBO',
      'OOBBBBBBBBBBWKBO',
      'OBOBBBBBBBBBBBBO',
      'O.OBLLLLLLLLLLBO',
      '...OLLLLLLLLLLO.',
      '....OOOOOOOOOO..',
      '................',
      '................',
      '................',
    ],
  },
  host: {
    palette: { B: '#3b2f63', L: '#5d4b94', D: '#241c40', Y: '#fff27a', M: '#7a1838', G: '#ffb84d' },
    rows: [
      '...........YY...........',
      '..........YWWY..........',
      '..........YWWY..........',
      '...........YY...........',
      '...........O............',
      '............O...........',
      '......OOOOOOOOO.........',
      '....OOBBBBBBBBBOO.......',
      '...OBBLLBBBBBBBBBO......',
      '..OBBLBBBBBWWKBBBBO.....',
      'O.OBBBBBBBBWKKBBBBBO....',
      'OOBBBBBBBBBBBBBBBBBBO...',
      'OGOBBBBBBBBBBBBOOOOOOO..',
      'OGOBBBBBBBBBBBOWOWOWOWO.',
      'OOBBBBBBBBBBBBOMMMMMMMO.',
      'O.OBBBBBBBBBBBBOWOWOWO..',
      '...OBDDDDDDDDDDBOOOOO...',
      '....OODDDDDDDDOO........',
      '......OOOOOOOOO.........',
    ],
  },
  rock: {
    palette: { B: '#2e3b52', L: '#55688a', D: '#1b2436', O: '#060b14' },
    rows: [
      '......OOOOOOOOOOOO......',
      '...OOOLLLLLLLLLLLLOOO...',
      '..OLLLLBBBBBBBBBBLLLLO..',
      '.OLBBBBBBBBBBBBBBBBBBLO.',
      '.ODLLBBBBBBBBBBBBBBLLDO.',
      '.OBDDLLLLLLLLLLLLLLDDBO.',
      '.OBBDDBBBBDBBBBDBBDDBBO.',
      '.ODBBBDBBBBBDBBBBDBBBDO.',
      '..OBDBBBBDBBBBDBBBBDBO..',
      '..ODBBDBBBBBDBBBDBBBDO..',
      '...OODDDDDDDDDDDDDDOO...',
      '.....OOOOOOOOOOOOOO.....',
    ],
  },
  coral: {
    palette: { B: '#ff4f6d', L: '#ff9aab', D: '#b8263f' },
    rows: [
      '.O.....O..',
      'OBO..O.OBO',
      'OBO.OBOOBO',
      'OLBOOBOBO.',
      '.OBOBLBBO.',
      '..OBBBBO..',
      '...OBDO...',
      '...OBDO...',
      '..OOBDOO..',
    ],
  },
  kelp: {
    palette: { B: '#3fae6a', L: '#7fd99a', D: '#22703f' },
    rows: [
      '...O..',
      '..OBO.',
      '..OLO.',
      '.OBO..',
      '.OBLO.',
      '..OBO.',
      '..OBO.',
      '.OBO..',
      '.OLBO.',
      '..OBO.',
      '..ODO.',
      '.OBDO.',
    ],
  },
};

export const CREATURES = ['crab', 'jelly', 'turtle', 'octopus', 'seahorse', 'eel', 'fish', 'squid', 'ray', 'whale'];

const cache = new Map();

// Data URL for a sprite at 1px per cell; scale it up with CSS
// (image-rendering: pixelated keeps it crisp).
export function spriteUrl(name, { dim = false } = {}) {
  const key = `${name}${dim ? ':dim' : ''}`;
  if (cache.has(key)) return cache.get(key);
  const sprite = SPRITES[name] ?? SPRITES.fish;
  const h = sprite.rows.length;
  const w = Math.max(...sprite.rows.map((r) => r.length));
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const g = canvas.getContext('2d');
  const palette = { O: OUTLINE, W: '#ffffff', K: OUTLINE, P: '#ff8fb1', ...sprite.palette };
  sprite.rows.forEach((row, y) => {
    [...row].forEach((ch, x) => {
      if (ch === '.' || !palette[ch]) return;
      g.fillStyle = dim ? desaturate(palette[ch]) : palette[ch];
      g.fillRect(x, y, 1, 1);
    });
  });
  const url = canvas.toDataURL();
  cache.set(key, url);
  return url;
}

export function spriteSize(name) {
  const s = SPRITES[name] ?? SPRITES.fish;
  return { w: Math.max(...s.rows.map((r) => r.length)), h: s.rows.length };
}

function desaturate(hex) {
  const n = parseInt(hex.slice(1), 16);
  const r = (n >> 16) & 255, g = (n >> 8) & 255, b = n & 255;
  const v = Math.round((r * 0.3 + g * 0.59 + b * 0.11) * 0.55 + 20);
  return `rgb(${v}, ${v + 6}, ${v + 18})`;
}

// A tiled, noisy ocean-floor texture for the page background.
export function oceanTexture() {
  const size = 96;
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = size;
  const g = canvas.getContext('2d');
  const shades = ['#1f4f7a', '#21547f', '#1c4972', '#245a86', '#1a456c'];
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      g.fillStyle = shades[(Math.random() * shades.length) | 0];
      g.fillRect(x, y, 1, 1);
    }
  }
  // Soft horizontal "current" streaks.
  g.fillStyle = 'rgba(160, 210, 255, 0.07)';
  for (let i = 0; i < 14; i++) g.fillRect((Math.random() * size) | 0, (Math.random() * size) | 0, 6 + ((Math.random() * 10) | 0), 1);
  return canvas.toDataURL();
}
