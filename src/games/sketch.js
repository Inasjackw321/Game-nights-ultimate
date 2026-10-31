// Reef Sketch: one player draws a secret word, everyone else races to guess
// it. Ink streams live to every screen. Letter hints appear as time runs out,
// close guesses get a private "so close!", and faster guesses score more.
import { SKETCH_WORDS } from '../content/sketch.js';
import { cleanLabel, levenshtein, sameAnswer, toKey } from '../match.js';
import { addPoints, clearTimer, everyoneIn, setTimer, shuffleWith, tooLate, zeroScores } from './kit.js';

const CHOOSE_SECONDS = 12;
const REVEAL_SECONDS = 6;
const CHAT_SIZE = 14;
export const MAX_INK_POINTS = 40000; // per drawing, so one turn can't flood the room
export const ARTIST_POINTS = 80;
export const PALETTE_SIZE = 12;

export function guessPoints(msLeft, duration) {
  return 100 + Math.round(400 * Math.max(0, Math.min(1, msLeft / duration)));
}

// "so close": a couple of letters off, but not the word itself.
export function isClose(guess, word) {
  const a = toKey(guess);
  const b = toKey(word);
  if (!a || a === b) return false;
  return levenshtein(a, b) <= (b.length >= 6 ? 2 : 1) || (a.length >= 4 && (b.includes(a) || a.includes(b)));
}

// The word as blanks, with `reveal` letters shown in a fixed random order.
export function maskWord(word, order, reveal) {
  const shown = new Set(order.slice(0, reveal));
  return [...word].map((ch, i) => (ch === ' ' ? ' ' : shown.has(i) ? ch : '_')).join('');
}

export default {
  meta: {
    id: 'sketch',
    name: 'Reef Sketch',
    tagline: 'Draw the secret word while everyone races to guess it.',
    category: 'Drawing',
    minPlayers: 2,
    options: [
      { key: 'rounds', label: 'Turns each', values: [1, 2, 3], default: 1 },
      { key: 'seconds', label: 'Seconds to draw', values: [60, 80, 100], default: 80 },
    ],
  },

  init(ctx) {
    const order = shuffleWith(ctx.ids, ctx.rand);
    const g = {
      ids: ctx.ids,
      scores: zeroScores(ctx.ids),
      drawers: Array.from({ length: ctx.settings.rounds }, () => order).flat(),
      turn: -1,
      used: [],
      ink: [],
      inkPoints: 0,
      inkVersion: 0,
      chat: [],
    };
    nextTurn(g, ctx);
    return g;
  },

  action(g, pid, msg, ctx) {
    if (!g.ids.includes(pid)) return 'You joined mid-game — you can play the next one.';
    const drawer = g.drawers[g.turn];

    if (msg.type === 'choose') {
      if (g.stage !== 'choose' || pid !== drawer) return 'Not your pick.';
      const word = g.choices[Number(msg.index)];
      if (!word) return 'Pick one of the words.';
      startDrawing(g, word, ctx);
      return;
    }

    if (msg.type === 'answer') {
      if (g.stage !== 'draw') return 'Hold on, nobody is drawing yet.';
      if (pid === drawer) return "You're the artist! No guessing your own word.";
      if (pid in g.guessed) return 'You already got it! Shh, no spoilers.';
      if (tooLate(g, ctx)) return 'Too late — time is up.';
      const text = cleanLabel(msg.text, 40);
      if (!text) return 'Type a guess.';
      if (sameAnswer(text, g.word) || toKey(text) === toKey(g.word)) {
        const pts = guessPoints(g.deadline - ctx.now, g.duration);
        g.guessed[pid] = pts;
        g.order.push(pid);
        pushChat(g, { kind: 'correct', who: ctx.name(pid), pid, pts });
        const guessers = g.ids.filter((id) => id !== drawer);
        if (everyoneIn(guessers, g.guessed, ctx)) reveal(g, ctx);
        return;
      }
      if (isClose(text, g.word)) return `“${text}” is so close!`;
      pushChat(g, { kind: 'guess', who: ctx.name(pid), pid, text });
      return;
    }

    if (msg.type === 'next' && g.stage === 'reveal') {
      if (!ctx.isHost(pid)) return 'Only the host can do that.';
      return nextTurn(g, ctx);
    }
    return 'Not right now.';
  },

  // Live drawing: only the artist may draw, only while drawing. Returns the
  // cleaned-up op to relay to everyone else, or null to ignore it.
  ink(g, pid, op) {
    if (g.stage !== 'draw' || pid !== g.drawers[g.turn] || !op || typeof op !== 'object') return null;
    if (op.k === 'c') {
      g.ink = [];
      g.inkPoints = 0;
      return { k: 'c' };
    }
    if (op.k === 'u') {
      const gone = g.ink.pop();
      if (gone) g.inkPoints -= gone.p.length / 2;
      return { k: 'u' };
    }
    const pts = Array.isArray(op.p) ? op.p.slice(0, 400).map((n) => Math.max(0, Math.min(1000, Math.round(Number(n) || 0)))) : [];
    if (pts.length % 2) pts.pop();
    if (!pts.length || g.inkPoints + pts.length / 2 > MAX_INK_POINTS) return null;
    if (op.k === 's') {
      const stroke = { id: String(op.id ?? '').slice(0, 24), c: Math.max(0, Math.min(PALETTE_SIZE - 1, Number(op.c) | 0)), w: Math.max(1, Math.min(4, Number(op.w) | 0)), p: pts };
      g.ink.push(stroke);
      g.inkPoints += pts.length / 2;
      return { k: 's', id: stroke.id, c: stroke.c, w: stroke.w, p: pts };
    }
    if (op.k === 'a') {
      const stroke = g.ink.at(-1);
      if (!stroke || stroke.id !== String(op.id ?? '')) return null;
      stroke.p.push(...pts);
      g.inkPoints += pts.length / 2;
      return { k: 'a', id: stroke.id, p: pts };
    }
    return null;
  },

  timeout(g, ctx) {
    if (g.stage === 'choose') startDrawing(g, g.choices[Math.floor(ctx.rand() * g.choices.length)], ctx);
    else if (g.stage === 'draw') reveal(g, ctx);
    else if (g.stage === 'reveal') nextTurn(g, ctx);
  },

  view(g, pid, ctx) {
    const drawer = g.drawers[g.turn];
    const isDrawer = pid === drawer;
    const marks = { [drawer]: 'turn' };
    for (const id of Object.keys(g.guessed ?? {})) marks[id] = 'done';
    let mask = null;
    if (g.stage === 'draw') {
      // Hints: a third of the letters by half time, two thirds by the last quarter.
      const elapsed = 1 - (g.deadline - ctx.now) / g.duration;
      const letters = [...g.word].filter((c) => c !== ' ').length;
      const reveal = elapsed > 0.75 ? Math.floor(letters * 0.5) : elapsed > 0.5 ? Math.floor(letters * 0.25) : 0;
      mask = maskWord(g.word, g.hintOrder, Math.min(reveal, letters - 1));
    }
    const knowsWord = isDrawer || pid in (g.guessed ?? {}) || g.stage === 'reveal';
    const title = g.stage === 'choose'
      ? (isDrawer ? 'Pick something to draw!' : `${ctx.name(drawer)} is choosing a word…`)
      : g.stage === 'draw'
        ? (isDrawer ? `Draw: ${g.word.toUpperCase()}` : knowsWord ? `You got it: ${g.word}! Shh…` : `${ctx.name(drawer)} is drawing!`)
        : `It was “${g.word}”!`;
    return {
      stage: g.over ? 'done' : g.stage,
      title,
      round: g.turn,
      total: g.drawers.length,
      deadline: g.deadline,
      duration: g.duration,
      canPlay: g.ids.includes(pid),
      drawer,
      isDrawer,
      choices: g.stage === 'choose' && isDrawer ? g.choices : null,
      word: knowsWord ? g.word : null,
      mask,
      letters: g.word ? g.word.length : 0,
      guessed: g.guessed ?? {},
      chat: g.chat,
      inkVersion: g.inkVersion,
      deltas: g.stage === 'reveal' ? g.deltas : null,
      last: g.turn + 1 >= g.drawers.length,
      marks,
    };
  },

  // Everything drawn so far this turn, for players who (re)connect mid-drawing.
  inkSnapshot(g) {
    return { v: g.inkVersion, strokes: g.ink };
  },
};

function pushChat(g, entry) {
  g.chat.push(entry);
  if (g.chat.length > CHAT_SIZE) g.chat.shift();
}

function nextTurn(g, ctx) {
  g.turn += 1;
  if (g.turn >= g.drawers.length) {
    g.over = true;
    clearTimer(g);
    return;
  }
  // Skip artists who have left.
  if (!ctx.online(g.drawers[g.turn]) && g.turn + 1 < g.drawers.length) return nextTurn(g, ctx);
  const fresh = SKETCH_WORDS.filter((w) => !g.used.includes(w));
  g.choices = shuffleWith(fresh.length >= 3 ? fresh : SKETCH_WORDS, ctx.rand).slice(0, 3);
  g.stage = 'choose';
  g.word = null;
  g.guessed = {};
  g.order = [];
  g.deltas = null;
  g.chat = [];
  g.ink = [];
  g.inkPoints = 0;
  g.inkVersion += 1;
  setTimer(g, ctx.online(g.drawers[g.turn]) ? CHOOSE_SECONDS : 2, ctx);
}

function startDrawing(g, word, ctx) {
  g.word = word;
  g.used.push(word);
  g.hintOrder = shuffleWith([...word].map((c, i) => (c === ' ' ? -1 : i)).filter((i) => i >= 0), ctx.rand);
  g.stage = 'draw';
  g.choices = null;
  setTimer(g, ctx.settings.seconds, ctx);
}

function reveal(g, ctx) {
  const drawer = g.drawers[g.turn];
  const deltas = { ...g.guessed };
  const n = Object.keys(g.guessed).length;
  const guessers = g.ids.filter((id) => id !== drawer).length;
  deltas[drawer] = (deltas[drawer] ?? 0) + n * ARTIST_POINTS + (n && n === guessers ? 50 : 0);
  addPoints(g, deltas);
  g.deltas = deltas;
  g.stage = 'reveal';
  setTimer(g, REVEAL_SECONDS, ctx);
}

