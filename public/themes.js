// Worlds the host can pick for a room. Each one swaps the background, the
// decorations, the host character, the rocks players sit on, the floating
// particles and the creatures that wander past.
export const THEMES = {
  reef: {
    name: 'Coral Reef', icon: '🐠', host: 'host',
    shades: ['#1f4f7a', '#21547f', '#1c4972', '#245a86', '#1a456c'], streak: 'rgba(160, 210, 255, 0.07)',
    deco: [['coral', '2%', 48], ['kelp', '9%', 36], ['kelp', '88%', 40], ['coral', '93%', 40]],
    rock: null,
    wanderers: ['fish', 'fish', 'ray', 'eel', 'whale', 'jelly'], big: 'shark',
  },
  space: {
    name: 'Outer Space', icon: '🚀', host: 'alien',
    shades: ['#0d0b24', '#110e2e', '#0a0920', '#15113a', '#0e0c27'], streak: 'rgba(255, 255, 255, 0.35)',
    deco: [['planet', '2%', 44], ['rocket', '10%', 46], ['rocket', '88%', 38], ['planet', '93%', 34]],
    rock: { B: '#5b5f78', L: '#8a8fab', D: '#3a3d52', O: '#08080f' },
    wanderers: ['rocket', 'planet', 'robot', 'alien'], big: 'rocket',
  },
  forest: {
    name: 'Enchanted Forest', icon: '🍄', host: 'fox',
    shades: ['#1d3b2a', '#20422e', '#1a3526', '#244a33', '#183022'], streak: 'rgba(200, 255, 160, 0.08)',
    deco: [['pine', '1%', 70], ['mushroom', '9%', 30], ['mushroom', '88%', 26], ['pine', '93%', 60]],
    rock: { B: '#7a5233', L: '#5fbf5f', D: '#4f331f', O: '#1a0f08' },
    wanderers: ['chick', 'bunny', 'frog', 'ghost'], big: 'dragon',
  },
  volcano: {
    name: 'Volcano Island', icon: '🌋', host: 'dragon',
    shades: ['#3a1714', '#421a16', '#331311', '#4a1f18', '#2d100e'], streak: 'rgba(255, 140, 60, 0.12)',
    deco: [['mini-volcano', '1%', 54], ['flame', '10%', 34], ['flame', '87%', 30], ['mini-volcano', '92%', 46]],
    rock: { B: '#33262a', L: '#ff7a2f', D: '#1e1517', O: '#0a0505' },
    wanderers: ['dragon', 'chick', 'ghost'], big: 'dragon',
  },
};

export const THEME_IDS = Object.keys(THEMES);
