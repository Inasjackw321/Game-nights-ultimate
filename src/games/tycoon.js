// Reef Tycoon: an original roll-and-move property game. Swim round a ring of
// reef plots, claim them with pearls, charge tolls to anyone who lands on
// them, and grow coral to make tolls bigger. Owning neighbouring plots links
// them into a reef network worth more. Richest diver after the last round wins.
import { clearTimer, setTimer, shuffleWith, tooLate, zeroScores } from './kit.js';

export const START_PEARLS = 1500;
export const PASS_HOME = 150;
export const GROW_MULT = [1, 2.5, 5, 9]; // toll multiplier per coral level
export const MAX_LEVEL = 3;
export const NETWORK_BONUS = 1.5; // toll bonus if the owner also owns a neighbouring plot
const ROLL_SECONDS = 20;
const DECIDE_SECONDS = 15;
const AWAY_SECONDS = 2;
const LOG_SIZE = 10;

export const BOARD = [
  { kind: 'home', name: 'Home Reef' },
  { kind: 'plot', name: 'Kelp Alley', price: 60, toll: 8 },
  { kind: 'plot', name: 'Sandy Patch', price: 70, toll: 9 },
  { kind: 'chest', name: 'Sunken Chest' },
  { kind: 'plot', name: 'Anemone Row', price: 100, toll: 12 },
  { kind: 'current', name: 'Fast Current', move: 3 },
  { kind: 'plot', name: 'Clam Court', price: 120, toll: 14 },
  { kind: 'plot', name: 'Starfish Square', price: 140, toll: 16 },
  { kind: 'shark', name: 'Shark Bait' },
  { kind: 'plot', name: 'Turtle Cove', price: 160, toll: 18 },
  { kind: 'plot', name: 'Coral Gardens', price: 180, toll: 20 },
  { kind: 'chest', name: 'Sunken Chest' },
  { kind: 'plot', name: 'Lantern Trench', price: 200, toll: 22 },
  { kind: 'plot', name: 'Bubble Vents', price: 220, toll: 24 },
  { kind: 'current', name: 'Rip Tide', move: -2 },
  { kind: 'plot', name: 'Pearl Lagoon', price: 240, toll: 26 },
  { kind: 'plot', name: 'Whale Way', price: 260, toll: 28 },
  { kind: 'chest', name: 'Sunken Chest' },
  { kind: 'plot', name: 'Sunlit Shallows', price: 300, toll: 32 },
  { kind: 'plot', name: 'Abyss Heights', price: 350, toll: 40 },
];

export const growCost = (tile) => Math.round(tile.price * 0.6);

export const CHEST_EVENTS = [
  { text: 'found a giant pearl!', pearls: 120 },
  { text: 'got pinched by a grumpy crab.', pearls: -60 },
  { text: 'won the seahorse races!', pearls: 80 },
  { text: 'paid the pufferfish dentist.', pearls: -90 },
  { text: 'threw a reef party: everyone chips in 25!', fromEach: 25 },
  { text: 'bought a round of plankton smoothies for everyone.', toEach: 20 },
  { text: 'rode a dolphin back to Home Reef!', goHome: true },
  { text: 'got a free coral growth!', freeGrow: true },
];

export function tollFor(g, i) {
  const tile = BOARD[i];
  const owner = g.owner[i];
  if (!owner || tile.kind !== 'plot') return 0;
  const n = BOARD.length;
  const linked = [i - 1, i + 1].some((j) => g.owner[(j + n) % n] === owner);
  return Math.round(tile.toll * GROW_MULT[g.level[i] ?? 0] * (linked ? NETWORK_BONUS : 1));
}

export function netWorth(g, pid) {
  let worth = g.pearls[pid] ?? 0;
  for (const [i, owner] of Object.entries(g.owner)) {
    if (owner !== pid) continue;
    worth += BOARD[i].price + (g.level[i] ?? 0) * growCost(BOARD[i]);
  }
  return worth;
}

export default {
  meta: {
    id: 'tycoon',
    name: 'Reef Tycoon',
    tagline: 'Roll, claim reef plots, charge tolls and grow coral. Richest diver wins.',
    category: 'Board',
    minPlayers: 2,
    options: [
      { key: 'rounds', label: 'Rounds', values: [5, 8, 12], default: 8 },
    ],
  },

  init(ctx) {
    const g = {
      ids: ctx.ids,
      order: shuffleWith(ctx.ids, ctx.rand),
      scores: zeroScores(ctx.ids, START_PEARLS),
      pearls: zeroScores(ctx.ids, START_PEARLS),
      pos: zeroScores(ctx.ids, 0),
      owner: {},
      level: {},
      turn: 0,
      turnsTaken: 0,
      maxTurns: ctx.settings.rounds * ctx.ids.length,
      move: null,
      moveId: 0,
      offer: null,
      log: [],
    };
    startTurn(g, ctx);
    return g;
  },

  action(g, pid, msg, ctx) {
    if (!g.ids.includes(pid)) return 'You joined mid-game — you can play the next one.';
    if (pid !== active(g)) return "It's not your turn.";
    if (tooLate(g, ctx)) return 'Too late — time is up.';
    if (msg.type === 'roll') {
      if (g.stage !== 'roll') return 'You already rolled.';
      return roll(g, ctx);
    }
    if (msg.type === 'buy' || msg.type === 'pass') {
      if (g.stage !== 'decide' || !g.offer) return 'Nothing to decide.';
      if (msg.type === 'buy') accept(g, ctx);
      else pushLog(g, `${ctx.name(pid)} passed on ${BOARD[g.offer.tile].name}.`);
      return endTurn(g, ctx);
    }
    return 'Not right now.';
  },

  timeout(g, ctx) {
    if (g.stage === 'roll') return roll(g, ctx);
    if (g.stage === 'decide') {
      // Away players are bots: they buy when it leaves a cushion.
      if (!ctx.online(active(g)) && g.pearls[active(g)] - g.offer.cost >= 300) accept(g, ctx);
      return endTurn(g, ctx);
    }
  },

  view(g, pid, ctx) {
    const me = active(g);
    const marks = me && !g.over ? { [me]: 'turn' } : {};
    const tags = {};
    for (const id of g.ids) tags[id] = `◆${g.pearls[id]}`;
    const round = Math.min(Math.floor(g.turnsTaken / g.ids.length), g.maxTurns / g.ids.length - 1);
    const title = g.over ? 'The tide is out! Counting pearls…'
      : g.stage === 'decide' ? `${ctx.name(me)} landed on ${BOARD[g.offer.tile].name}`
      : `${ctx.name(me)}'s turn to roll`;
    return {
      stage: g.over ? 'done' : g.stage,
      title,
      round,
      total: g.maxTurns / g.ids.length,
      deadline: g.deadline,
      duration: g.duration,
      canPlay: g.ids.includes(pid),
      active: me,
      board: BOARD.map((t, i) => ({
        ...t,
        owner: g.owner[i] ?? null,
        level: g.level[i] ?? 0,
        tollNow: tollFor(g, i),
        grow: t.kind === 'plot' ? growCost(t) : null,
      })),
      pos: g.pos,
      pearls: g.pearls,
      worth: g.scores,
      offer: g.offer,
      move: g.move,
      log: g.log,
      tags,
      marks,
      money: true,
    };
  },
};

function active(g) {
  return g.order[g.turn];
}

function startTurn(g, ctx) {
  g.stage = 'roll';
  g.offer = null;
  setTimer(g, ctx.online(active(g)) ? ROLL_SECONDS : AWAY_SECONDS, ctx);
}

function endTurn(g, ctx) {
  g.offer = null;
  g.turnsTaken += 1;
  refreshScores(g);
  if (g.turnsTaken >= g.maxTurns) {
    g.over = true;
    clearTimer(g);
    return;
  }
  g.turn = (g.turn + 1) % g.order.length;
  startTurn(g, ctx);
}

function refreshScores(g) {
  for (const id of g.ids) g.scores[id] = netWorth(g, id);
}

function roll(g, ctx) {
  const pid = active(g);
  const n = BOARD.length;
  const dice = 1 + Math.floor(ctx.rand() * 6);
  const from = g.pos[pid];
  let to = (from + dice) % n;
  const events = [];
  if (from + dice >= n) {
    g.pearls[pid] += PASS_HOME;
    events.push({ kind: 'home', text: `swam past Home Reef: +${PASS_HOME}` });
  }
  // Currents move you again (once).
  const tile = BOARD[to];
  if (tile.kind === 'current') {
    const next = (to + tile.move + n) % n;
    events.push({ kind: 'current', text: `got swept ${tile.move > 0 ? 'forward' : 'back'} by the ${tile.name}!` });
    if (tile.move > 0 && to + tile.move >= n) {
      g.pearls[pid] += PASS_HOME;
      events.push({ kind: 'home', text: `swam past Home Reef: +${PASS_HOME}` });
    }
    to = next;
  }
  g.pos[pid] = to;
  g.moveId += 1;
  g.move = { id: g.moveId, pid, dice, from, to, events };

  const name = ctx.name(pid);
  const land = BOARD[to];
  pushLog(g, `${name} rolled a ${dice} → ${land.name}.`);
  for (const e of events) pushLog(g, `${name} ${e.text}`);

  if (land.kind === 'plot') {
    const owner = g.owner[to];
    if (!owner) {
      g.offer = { tile: to, kind: 'buy', cost: land.price, afford: g.pearls[pid] >= land.price };
    } else if (owner === pid) {
      const lvl = g.level[to] ?? 0;
      if (lvl < MAX_LEVEL) g.offer = { tile: to, kind: 'grow', cost: growCost(land), afford: g.pearls[pid] >= growCost(land), level: lvl + 1 };
    } else {
      const toll = tollFor(g, to);
      const paid = charge(g, pid, toll, ctx);
      g.pearls[owner] += paid;
      g.move.toll = { to: owner, amount: paid };
      pushLog(g, `${name} paid ${ctx.name(owner)} a toll of ${paid}.`);
    }
  } else if (land.kind === 'shark') {
    const bite = Math.max(20, Math.round(g.pearls[pid] * 0.15));
    const paid = charge(g, pid, bite, ctx);
    g.move.shark = paid;
    pushLog(g, `${name} got chomped by a shark: -${paid}!`);
  } else if (land.kind === 'chest') {
    chest(g, pid, ctx);
  }

  if (g.offer?.afford) {
    g.stage = 'decide';
    setTimer(g, ctx.online(pid) ? DECIDE_SECONDS : AWAY_SECONDS, ctx);
    refreshScores(g);
    return;
  }
  if (g.offer && !g.offer.afford) pushLog(g, `${name} can't afford ${land.name}.`);
  return endTurn(g, ctx);
}

function accept(g, ctx) {
  const pid = active(g);
  const { tile, kind, cost } = g.offer;
  if (g.pearls[pid] < cost) return;
  g.pearls[pid] -= cost;
  if (kind === 'buy') {
    g.owner[tile] = pid;
    g.level[tile] = 0;
    pushLog(g, `${ctx.name(pid)} claimed ${BOARD[tile].name} for ${cost}!`);
  } else {
    g.level[tile] = (g.level[tile] ?? 0) + 1;
    pushLog(g, `${ctx.name(pid)} grew coral on ${BOARD[tile].name} (level ${g.level[tile]})!`);
  }
  g.move = { ...g.move, bought: { tile, kind } };
}

// Take pearls; if they run short, their cheapest plots go back to the reef
// (for half their price) until the debt is covered. Returns what was paid.
function charge(g, pid, amount, ctx) {
  while (g.pearls[pid] < amount) {
    const plots = Object.keys(g.owner).filter((i) => g.owner[i] === pid).map(Number)
      .sort((a, b) => BOARD[a].price - BOARD[b].price);
    if (!plots.length) break;
    const i = plots[0];
    g.pearls[pid] += Math.round((BOARD[i].price + (g.level[i] ?? 0) * growCost(BOARD[i])) / 2);
    delete g.owner[i];
    delete g.level[i];
    pushLog(g, `${ctx.name(pid)} had to sell ${BOARD[i].name}!`);
  }
  const paid = Math.min(amount, g.pearls[pid]);
  g.pearls[pid] -= paid;
  return paid;
}

function chest(g, pid, ctx) {
  const e = CHEST_EVENTS[Math.floor(ctx.rand() * CHEST_EVENTS.length)];
  const name = ctx.name(pid);
  g.move.chest = e.text;
  if (e.pearls > 0) g.pearls[pid] += e.pearls;
  if (e.pearls < 0) charge(g, pid, -e.pearls, ctx);
  if (e.fromEach) for (const id of g.ids) if (id !== pid) g.pearls[pid] += charge(g, id, e.fromEach, ctx);
  if (e.toEach) for (const id of g.ids) if (id !== pid) g.pearls[id] += charge(g, pid, e.toEach, ctx);
  if (e.goHome) { g.pos[pid] = 0; g.pearls[pid] += PASS_HOME; g.move.to = 0; }
  if (e.freeGrow) {
    const mine = Object.keys(g.owner).filter((i) => g.owner[i] === pid && (g.level[i] ?? 0) < MAX_LEVEL);
    if (mine.length) {
      const i = mine[Math.floor(ctx.rand() * mine.length)];
      g.level[i] = (g.level[i] ?? 0) + 1;
    } else {
      g.pearls[pid] += 50;
    }
  }
  pushLog(g, `${name} ${e.text}`);
}

function pushLog(g, text) {
  g.log.push(text);
  if (g.log.length > LOG_SIZE) g.log.shift();
}
