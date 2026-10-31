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
  trophy: {
    palette: { B: '#ffc93c', L: '#fff1a8', D: '#c98a12' },
    rows: [
      '..OOOOOOOOOO..',
      'OOBLLLLLLLLBOO',
      'OBOBLLLBBBBOBO',
      'OBOBLBBBBBBOBO',
      'OBOBLBBBBBBOBO',
      '.OOBBBBBBBBOO.',
      '..OBBBBBBBDO..',
      '...OBBBBBDO...',
      '....ODBBDO....',
      '.....OBDO.....',
      '.....OBDO.....',
      '...OOOOOOOO...',
      '...OBBBBBDO...',
      '..OOOOOOOOOO..',
    ],
  },
  // ---- land, sky & space friends ----
  cat: {
    palette: { B: '#ff9f43', L: '#ffd6a5', D: '#c46a1c', P: '#ff7aa8' },
    rows: mirror([
      '.O......',
      'OBO.....',
      'OBBO....',
      'OBLBOOOO',
      'OBBBBBBB',
      'OBBBBBBB',
      'OBWKBBBB',
      'OBBBBBBP',
      '.OBBBDBB',
      '..OBBBBB',
      '.OBBBBBB',
      'OBBLBBBB',
      'OBBBBBBB',
      '.OOOOOOO',
    ]),
  },
  dog: {
    palette: { B: '#c98b5a', L: '#f2d3b0', D: '#6e4325' },
    rows: mirror([
      '........',
      '...OOOOO',
      '..OBBBBB',
      'OOOBBBBB',
      'ODDOBBBB',
      'ODDOWKBB',
      'ODDOBBBB',
      '.OOBBBBB',
      '..OBBLLK',
      '..OBBLLL',
      '...OBBBB',
      '..OBBBBB',
      '..OBBBBB',
      '..OOOOOO',
    ]),
  },
  frog: {
    palette: { B: '#5fd35f', L: '#c9f5a8', D: '#2f8a3a', P: '#ff8fb1' },
    rows: mirror([
      '........',
      '.OOOO...',
      'OWWWWO..',
      'OWKKWOOO',
      'OBOOOBBB',
      'OBBBBBBB',
      'OBBBBBBB',
      'OBPBBBBB',
      'OBBOOOOO',
      'OBBBBBBB',
      '.OBLLLLL',
      '.OBLLLLL',
      'OBBOOBBB',
      'OOO..OOO',
    ]),
  },
  fox: {
    palette: { B: '#ff7a2f', L: '#fff4e6', D: '#b84a12' },
    rows: mirror([
      'O.......',
      'OOO.....',
      'OBBO....',
      'OBBBOOOO',
      'OBBBBBBB',
      'OBWKBBBB',
      'OLLBBBBB',
      '.OLLLLLK',
      '..OLLLLL',
      '...OBBBB',
      '..OBBBBB',
      '..OBBLLL',
      '..OBBBBB',
      '..OOOOOO',
    ]),
  },
  bunny: {
    palette: { B: '#f4f4fa', L: '#ffc2d6', D: '#c3c3d6' },
    rows: mirror([
      '..OO....',
      '.OBLO...',
      '.OBLO...',
      '.OBLO...',
      '.OBBO...',
      '..OOOOOO',
      '.OBBBBBB',
      'OBBKBBBB',
      'OBLBBBBK',
      'OBBBBBBB',
      '.OBBBBBB',
      '.OBBDBBB',
      '.OBBBBBB',
      '..OOOOOO',
    ]),
  },
  panda: {
    palette: { B: '#f7f7f7', D: '#1d2230', L: '#ffffff' },
    rows: mirror([
      '.OO.....',
      'ODDO....',
      'ODDOOOOO',
      '.OBBBBBB',
      'OBBBBBBB',
      'OBDDBBBB',
      'OBDWBBBB',
      'OBBBBBBD',
      '.OBBBBBB',
      '..ODDDDD',
      '.ODDBBBB',
      '.ODBBBBB',
      '.OBBDBBB',
      '..OOOOOO',
    ]),
  },
  chick: {
    palette: { B: '#ffe14d', L: '#fff3a6', D: '#e0b000', Y: '#ff9a1f' },
    rows: mirror([
      '......OO',
      '.....OBB',
      '...OOOBB',
      '..OBBBBB',
      '.OBBBBBB',
      '.OBBWKBB',
      '.OBBBBBY',
      '.OBBBBBY',
      'OBBLBBBB',
      'OBLLBBBB',
      'OBBLBBBB',
      '.OBBBBBB',
      '..OOOOOO',
      '...Y..Y.',
    ]),
  },
  penguin: {
    palette: { B: '#2a3348', L: '#ffffff', Y: '#ffa21f' },
    rows: mirror([
      '....OOOO',
      '...OBBBB',
      '..OBBBBB',
      '..OBLLLL',
      '..OBLKLL',
      '.OBLLLLY',
      '.OBLLLLL',
      'OBBLLLLL',
      'OBBLLLLL',
      'OBBLLLLL',
      '.OBLLLLL',
      '..OBLLLL',
      '...OOOOO',
      '...YY...',
    ]),
  },
  robot: {
    palette: { B: '#a9b8cc', L: '#e2ebf5', D: '#5e6e85', K: '#0a1424', Y: '#ff5c6c' },
    rows: mirror([
      '.......Y',
      '.......O',
      '..OOOOOO',
      '.OBBBBBB',
      '.OBKKBBB',
      '.OBKWBBB',
      '.OBBBBBB',
      '.OBDDDDD',
      '..OOOOOO',
      '.OBBBBBB',
      'OBOBLLLL',
      'OBOBLYLL',
      '..OBBBBB',
      '..OO..OO',
    ]),
  },
  alien: {
    palette: { B: '#7dff8a', L: '#c7ffcc', D: '#33b84a', K: '#101820' },
    rows: mirror([
      '..OOOOOO',
      '.OBBBBBB',
      'OBBLBBBB',
      'OBKKKBBB',
      'OBKKWBBB',
      'OBBKKBBB',
      '.OBBBBBB',
      '..OBBBDD',
      '...OBBBB',
      '....OOBB',
      '..OBBBBB',
      '.OBOBBBB',
      '.O.OBBBB',
      '...OO..O',
    ]),
  },
  ghost: {
    palette: { B: '#f0f4ff', L: '#ffffff', D: '#b9c4e0', P: '#ff9cc2' },
    rows: mirror([
      '....OOOO',
      '..OOBBBB',
      '.OBLBBBB',
      '.OBBBBBB',
      'OBBKKBBB',
      'OBBKKBBB',
      'OBBBBBBB',
      'OBPBBBOO',
      'OBBBBBBB',
      'OBBBBBBB',
      'OBBBBBBB',
      'OBBOBBOB',
      'OBO.OBO.',
      '.O...O..',
    ]),
  },
  dragon: {
    palette: { B: '#9b6bff', L: '#ffd36b', D: '#5d38b8', Y: '#ff6b3d' },
    rows: mirror([
      '.O......',
      '.OO...OO',
      '..OBOOBB',
      '..OBBBBB',
      '.OBBBBBB',
      'OLOBWKBB',
      'OLLOBBBB',
      'OLLOBBBB',
      '.OLOBBYB',
      '..OOBBBB',
      '..OBLLBB',
      '..OBLLBB',
      '..OBBBBB',
      '..OOO.OO',
    ]),
  },
  shark: {
    palette: { B: '#7f93ad', L: '#e6eef7', D: '#4e6079' },
    rows: [
      '..........O.............',
      '.........OBO............',
      '........OBBO............',
      'O......OBBBBOOOOOO......',
      'OO...OOBBBBBBBBBBBOO....',
      'OBO.OBBBBBBBBBBBBBWKOO..',
      'OBBOBBBBBBBBBBBBBBBBBBO.',
      'OBOLLLLLLLLLLLWOWOWOWLO.',
      'OO..OLLLLLLLLLLLLLLLOO..',
      'O.....OOOOOOOOOOOOOO....',
    ],
  },

  // ---- hats (drawn on top of a character's head) ----
  'hat-party': {
    palette: { B: '#ff6fa5', L: '#ffe066', Y: '#ffffff' },
    rows: [
      '.......YY.......',
      '.......OO.......',
      '......OBBO......',
      '.....OBLBBO.....',
      '....OBBBLBBO....',
      '...OBLBBBBLBO...',
      '..OBBBBLBBBBBO..',
      '..OOOOOOOOOOOO..',
    ],
  },
  'hat-crown': {
    palette: { Y: '#ffd23f', R: '#ff3d6e', B: '#ffd23f' },
    rows: [
      '.O....O..O....O.',
      '.OO..OYOOYO..OO.',
      '.OYO.OYYYYO.OYO.',
      '.OYYOYYYYYYOYYO.',
      '.OYYYYYRRYYYYYO.',
      '.OYYYYYYYYYYYYO.',
      '.OOOOOOOOOOOOOO.',
      '................',
    ],
  },
  'hat-wizard': {
    palette: { B: '#5b3fd1', Y: '#ffe066' },
    rows: [
      '.........OO.....',
      '........OBBO....',
      '.......OBBO.....',
      '......OBBBO.....',
      '.....OBBYBBO....',
      '....OBBBBBBBO...',
      '.OOOBBBBBBBBBOOO',
      'OBBBBBBBBBBBBBBO',
    ],
  },
  'hat-shades': {
    palette: { K: '#0a1424', L: '#9fd8ff' },
    rows: [
      '................',
      '................',
      '................',
      'OOOOOOOOOOOOOOOO',
      '.OKKKKO..OKKKKO.',
      '.OKLKKO..OKLKKO.',
      '..OKKO....OKKO..',
      '................',
    ],
  },
  'hat-bow': {
    palette: { P: '#ff4f8b', L: '#ffb3cf' },
    rows: [
      '................',
      '................',
      '..OOO......OOO..',
      '.OPPPO.OO.OPPPO.',
      '.OPLPPOPPOPPLPO.',
      '.OPPPO.OO.OPPPO.',
      '..OOO......OOO..',
      '................',
    ],
  },

  // ---- world decorations ----
  planet: {
    palette: { B: '#b38cff', L: '#e2d1ff', D: '#6f4fc2', Y: '#ffd36b' },
    rows: [
      '....OOOO....',
      '..OOBBLLOO..',
      '.OBBBBBLLBO.',
      'YYYYYYYYYYYY',
      'OBDBBBBBBBBO',
      'OBDDBBBBBBBO',
      '.OBDDBBBBBO.',
      '..OODDDDOO..',
      '....OOOO....',
    ],
  },
  rocket: {
    palette: { B: '#e8eef7', L: '#6cc4ff', D: '#ff5c6c', Y: '#ffa24a' },
    rows: [
      '....OO....',
      '...OBBO...',
      '..OBBBBO..',
      '..OBLLBO..',
      '..OBLLBO..',
      '..OBBBBO..',
      '.ODOBBODO.',
      'ODDOBBODDO',
      'OO.OOOO.OO',
      '...YOOY...',
      '....YY....',
    ],
  },
  pine: {
    palette: { B: '#2f9e5a', L: '#5fd38a', D: '#1b6b3a', Y: '#8b5a2b' },
    rows: [
      '.....OO.....',
      '....OBBO....',
      '...OBLBBO...',
      '..OBBBBBBO..',
      '...OBLBBO...',
      '..OBBBBLBO..',
      '.OBLBBBBBBO.',
      '..OBBBBLBO..',
      '.OBBLBBBBBO.',
      'OBBBBBBBLBBO',
      'OOOOOYYOOOOO',
      '.....YY.....',
      '.....YY.....',
    ],
  },
  mushroom: {
    palette: { B: '#ff4f5e', L: '#ffffff', D: '#c2303d', Y: '#f4e6c8' },
    rows: [
      '...OOOOOO...',
      '..OBBLBBBO..',
      '.OBLLBBBLBO.',
      'OBBBBBBBLLBO',
      'ODDDDDDDDDDO',
      '.OOOYYYYOOO.',
      '....OYYO....',
      '....OYYO....',
      '...OOOOOO...',
    ],
  },
  'mini-volcano': {
    palette: { B: '#5a3a33', L: '#ff7a2f', D: '#3a2420', Y: '#ffd23f' },
    rows: [
      '....Y..Y....',
      '.....YY.....',
      '....OLLO....',
      '...OBLLBO...',
      '...OBBLBO...',
      '..OBBBBBBO..',
      '..OBDBBBBO..',
      '.OBBBBBDBBO.',
      '.OBDBBBBBBO.',
      'OBBBBBBDBBBO',
      'OOOOOOOOOOOO',
    ],
  },
  flame: {
    palette: { B: '#ff7a2f', L: '#ffe066', D: '#ff3d3d' },
    rows: [
      '....O.....',
      '...OBO....',
      '...OBBO...',
      '..OBBBO.O.',
      '..OBLBBOBO',
      '.OBBLLBBBO',
      '.OBLLLLBBO',
      'ODBLLLLBDO',
      'ODBBLLBBDO',
      '.ODDBBDDO.',
      '..OOOOOO..',
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

export const CREATURES = [
  'crab', 'jelly', 'turtle', 'octopus', 'seahorse', 'eel', 'fish', 'squid', 'ray', 'whale',
  'cat', 'dog', 'frog', 'fox', 'bunny', 'panda', 'chick', 'penguin', 'robot', 'alien', 'ghost', 'dragon',
];
export const HATS = ['none', 'party', 'crown', 'wizard', 'shades', 'bow'];

const cache = new Map();

// Data URL for a sprite at 1px per cell; scale it up with CSS
// (image-rendering: pixelated keeps it crisp).
export const TROPHY_PALETTES = {
  1: { B: '#ffc93c', L: '#fff1a8', D: '#c98a12' },
  2: { B: '#c9d3de', L: '#ffffff', D: '#8a96a6' },
  3: { B: '#d0844a', L: '#f4b483', D: '#8f4f22' },
};

export const trophyUrl = (place) => spriteUrl('trophy', { palette: TROPHY_PALETTES[place] ?? TROPHY_PALETTES[1], key: `trophy${place}` });

export function spriteUrl(name, { dim = false, palette: override = null, key: customKey = null } = {}) {
  const key = `${customKey ?? name}${dim ? ':dim' : ''}`;
  if (cache.has(key)) return cache.get(key);
  const sprite = SPRITES[name] ?? SPRITES.fish;
  const h = sprite.rows.length;
  const w = Math.max(...sprite.rows.map((r) => r.length));
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const g = canvas.getContext('2d');
  const palette = { O: OUTLINE, W: '#ffffff', K: OUTLINE, P: '#ff8fb1', ...sprite.palette, ...(override ?? {}) };
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
export function oceanTexture(shades = ['#1f4f7a', '#21547f', '#1c4972', '#245a86', '#1a456c'], streak = 'rgba(160, 210, 255, 0.07)') {
  const size = 96;
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = size;
  const g = canvas.getContext('2d');
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      g.fillStyle = shades[(Math.random() * shades.length) | 0];
      g.fillRect(x, y, 1, 1);
    }
  }
  // Soft horizontal "current" streaks.
  g.fillStyle = streak;
  for (let i = 0; i < 14; i++) g.fillRect((Math.random() * size) | 0, (Math.random() * size) | 0, 6 + ((Math.random() * 10) | 0), 1);
  return canvas.toDataURL();
}
