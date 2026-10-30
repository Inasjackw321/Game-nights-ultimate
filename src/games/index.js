import deepcut from './deepcut.js';
import hivemind from './hivemind.js';
import fib from './fib.js';
import blitz from './blitz.js';
import likely from './likely.js';
import whoami from './whoami.js';
import blackjack from './blackjack.js';
import dice from './dice.js';
import derby from './derby.js';

export const GAMES = [deepcut, hivemind, fib, blitz, likely, whoami, blackjack, dice, derby];
export const GAME_BY_ID = Object.fromEntries(GAMES.map((g) => [g.meta.id, g]));
export const CATALOG = GAMES.map((g) => g.meta);

export function defaultSettings(meta) {
  return Object.fromEntries(meta.options.map((o) => [o.key, o.default]));
}
