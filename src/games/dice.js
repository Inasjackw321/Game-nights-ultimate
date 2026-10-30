// Liar's Dice: everyone hides their dice. Take turns raising the bid on how many
// of a face are on the whole table (ones are wild), or call "Liar!". Whoever is
// wrong loses a die. Your dice are your hearts; last diver standing wins.
import { clearTimer, setTimer, shuffleWith, tooLate, zeroScores } from './kit.js';

const TURN_SECONDS = 30;
const REVEAL_SECONDS = 8;
export const OUTLAST_POINTS = 100;
export const WIN_POINTS = 300;

// Faces 2–6 can be bid; ones count toward every face.
export function countFace(allDice, face) {
  return allDice.filter((d) => d === face || d === 1).length;
}

export function isRaise(bid, next) {
  if (next.face < 2 || next.face > 6 || next.qty < 1) return false;
  if (!bid) return true;
  return next.qty > bid.qty || (next.qty === bid.qty && next.face > bid.face);
}

export function minRaise(bid) {
  if (!bid) return { qty: 1, face: 2 };
  return bid.face < 6 ? { qty: bid.qty, face: bid.face + 1 } : { qty: bid.qty + 1, face: 2 };
}

export default {
  meta: {
    id: 'dice',
    name: "Liar's Dice",
    tagline: 'Bluff about the dice under every cup. Get caught, lose a heart.',
    category: 'Casino',
    minPlayers: 2,
    options: [
      { key: 'dice', label: 'Dice each', values: [2, 3, 5], default: 3 },
    ],
  },

  init(ctx) {
    const g = {
      ids: ctx.ids,
      scores: zeroScores(ctx.ids),
      left: Object.fromEntries(ctx.ids.map((id) => [id, ctx.settings.dice])),
      start: ctx.settings.dice,
      order: shuffleWith(ctx.ids, ctx.rand),
      turn: 0,
      out: [],
      last: null,
    };
    roll(g, ctx);
    return g;
  },

  action(g, pid, msg, ctx) {
    if (!g.ids.includes(pid)) return 'You joined mid-game — you can play the next one.';
    if (tooLate(g, ctx)) return 'Too late — time is up.';
    if (msg.type === 'next' && g.stage === 'reveal') {
      if (!ctx.isHost(pid)) return 'Only the host can do that.';
      return afterReveal(g, ctx);
    }
    if (g.stage !== 'bid' || pid !== active(g)) return "It's not your turn.";
    if (msg.type === 'bid') {
      const next = { qty: Math.floor(Number(msg.qty)), face: Math.floor(Number(msg.face)) };
      if (next.qty > totalDice(g)) return `There are only ${totalDice(g)} dice on the table.`;
      if (!isRaise(g.bid, next)) return 'You have to raise: more dice, or the same number of a higher face.';
      g.bid = { ...next, by: pid };
      passTurn(g, ctx);
      return;
    }
    if (msg.type === 'liar') {
      if (!g.bid) return 'There is no bid to challenge yet.';
      challenge(g, pid, ctx);
      return;
    }
    return 'Not right now.';
  },

  // Out of time: make the smallest legal raise, or call if none is possible.
  timeout(g, ctx) {
    if (g.stage === 'reveal') return afterReveal(g, ctx);
    const pid = active(g);
    const raise = minRaise(g.bid);
    if (g.bid && raise.qty > totalDice(g)) return challenge(g, pid, ctx);
    if (g.bid && ctx.rand() < 0.35) return challenge(g, pid, ctx);
    g.bid = { ...raise, by: pid };
    passTurn(g, ctx);
  },

  view(g, pid, ctx) {
    const marks = {};
    const tags = {};
    for (const id of g.ids) if (!g.left[id]) marks[id] = 'out';
    if (g.stage === 'bid') {
      marks[active(g)] = 'turn';
      if (g.bid) tags[g.bid.by] = `${g.bid.qty} × ${g.bid.face}s`;
    }
    const title = g.stage === 'reveal' ? revealLine(g, ctx)
      : g.bid ? `${ctx.name(g.bid.by)} bids ${g.bid.qty} × ${g.bid.face}s`
      : `${ctx.name(active(g))} opens the bidding`;
    return {
      stage: g.over ? 'done' : g.stage,
      title,
      deadline: g.deadline,
      duration: g.duration,
      canPlay: g.ids.includes(pid),
      myDice: g.dice[pid] ?? [],
      hearts: { ...g.left },
      maxHearts: g.start,
      bid: g.bid,
      active: g.stage === 'bid' ? active(g) : null,
      totalDice: totalDice(g),
      last: g.stage === 'reveal' ? g.last : null,
      marks,
      tags,
    };
  },
};

function alive(g) {
  return g.order.filter((id) => g.left[id] > 0);
}

function active(g) {
  return g.order[g.turn];
}

function totalDice(g) {
  return alive(g).reduce((n, id) => n + g.left[id], 0);
}

function roll(g, ctx) {
  g.dice = {};
  for (const id of alive(g)) g.dice[id] = Array.from({ length: g.left[id] }, () => 1 + Math.floor(ctx.rand() * 6)).sort();
  g.bid = null;
  g.stage = 'bid';
  setTimer(g, ctx.online(active(g)) ? TURN_SECONDS : 3, ctx);
}

function passTurn(g, ctx) {
  const n = g.order.length;
  for (let step = 1; step <= n; step++) {
    const i = (g.turn + step) % n;
    if (g.left[g.order[i]] > 0) { g.turn = i; break; }
  }
  setTimer(g, ctx.online(active(g)) ? TURN_SECONDS : 3, ctx);
}

function challenge(g, challenger, ctx) {
  const all = Object.values(g.dice).flat();
  const total = countFace(all, g.bid.face);
  const loser = total >= g.bid.qty ? challenger : g.bid.by;
  g.left[loser] -= 1;
  g.last = {
    challenger: ctx.name(challenger),
    bidder: ctx.name(g.bid.by),
    bid: { qty: g.bid.qty, face: g.bid.face },
    total,
    loser: ctx.name(loser),
    loserId: loser,
    eliminated: g.left[loser] === 0,
    dice: Object.fromEntries(Object.entries(g.dice).map(([id, d]) => [id, d])),
  };
  if (g.left[loser] === 0) {
    g.out.push(loser);
    for (const id of alive(g)) g.scores[id] += OUTLAST_POINTS;
  }
  // The loser starts the next round (or the next player if they're out).
  g.turn = g.order.indexOf(loser);
  if (g.left[loser] === 0) passTurn(g, ctx);
  g.stage = 'reveal';
  setTimer(g, REVEAL_SECONDS, ctx);
}

function afterReveal(g, ctx) {
  const standing = alive(g);
  if (standing.length <= 1) {
    if (standing[0]) g.scores[standing[0]] += WIN_POINTS;
    g.over = true;
    clearTimer(g);
    return;
  }
  roll(g, ctx);
}

function revealLine(g, ctx) {
  const l = g.last;
  const caught = l.loser === l.bidder;
  return `${l.challenger} called liar! ${l.total} × ${l.bid.face}s on the table — ${caught ? `${l.bidder} was bluffing` : `${l.bidder} was right`}. ${l.loser} loses a heart${l.eliminated ? ' and is out' : ''}.`;
}
