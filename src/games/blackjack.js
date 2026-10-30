// Blackjack against the house, played with play chips. Everyone acts at the
// same time so hands stay quick. Most chips after the last hand wins.
import { clearTimer, everyoneIn, setTimer, shuffleWith, tooLate, zeroScores } from './kit.js';

export const START_CHIPS = 1000;
export const MIN_BET = 10;
const BET_SECONDS = 20;
const PLAY_SECONDS = 30;
const SETTLE_SECONDS = 8;
const RANKS = ['A', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K'];
const SUITS = ['♠', '♥', '♦', '♣'];

export function newShoe(decks, rand) {
  const cards = [];
  for (let d = 0; d < decks; d++) for (const s of SUITS) for (const r of RANKS) cards.push(r + s);
  return shuffleWith(cards, rand);
}

export function handValue(cards) {
  let total = 0;
  let aces = 0;
  for (const c of cards) {
    const r = c.slice(0, -1);
    if (r === 'A') { aces += 1; total += 11; }
    else total += ['J', 'Q', 'K'].includes(r) ? 10 : Number(r);
  }
  while (total > 21 && aces) { total -= 10; aces -= 1; }
  return { total, soft: aces > 0 };
}

export const isBlackjack = (cards) => cards.length === 2 && handValue(cards).total === 21;

// Dealer draws to 17 and stands on soft 17.
export function playDealer(dealer, shoe) {
  while (handValue(dealer).total < 17) dealer.push(shoe.pop());
  return dealer;
}

// Chips returned to the player (their stake was already taken).
export function payout(hand, dealer) {
  const p = handValue(hand.cards).total;
  const d = handValue(dealer).total;
  const pBJ = isBlackjack(hand.cards);
  const dBJ = isBlackjack(dealer);
  if (pBJ && dBJ) return { result: 'push', back: hand.bet };
  if (pBJ) return { result: 'blackjack', back: Math.floor(hand.bet * 2.5) };
  if (p > 21) return { result: 'bust', back: 0 };
  if (dBJ) return { result: 'lose', back: 0 };
  if (d > 21 || p > d) return { result: 'win', back: hand.bet * 2 };
  if (p === d) return { result: 'push', back: hand.bet };
  return { result: 'lose', back: 0 };
}

export default {
  meta: {
    id: 'blackjack',
    name: 'Blackjack',
    tagline: 'Beat the house to 21 with play chips. Richest player wins.',
    category: 'Casino',
    minPlayers: 1,
    options: [
      { key: 'rounds', label: 'Hands', values: [5, 8, 12], default: 8 },
    ],
  },

  init(ctx) {
    const g = { ids: ctx.ids, scores: zeroScores(ctx.ids, START_CHIPS), hand: 0, maxHands: ctx.settings.rounds, dealer: [] };
    startBetting(g, ctx);
    return g;
  },

  action(g, pid, msg, ctx) {
    if (!g.ids.includes(pid)) return 'You joined mid-game — you can play the next one.';
    if (tooLate(g, ctx)) return 'Too late — time is up.';
    const chips = g.scores[pid];

    if (msg.type === 'bet') {
      if (g.stage !== 'bet') return 'Bets are closed.';
      const amount = Math.floor(Number(msg.amount));
      if (!(amount >= MIN_BET)) return `Minimum bet is ${MIN_BET}.`;
      if (amount > chips) return "You don't have that many chips.";
      g.bets[pid] = amount;
      if (everyoneIn(bettors(g), g.bets, ctx)) deal(g, ctx);
      return;
    }

    if (['hit', 'stand', 'double'].includes(msg.type)) {
      if (g.stage !== 'play') return 'Not your move right now.';
      const hand = g.hands[pid];
      if (!hand || hand.done) return 'Your hand is finished.';
      if (msg.type === 'hit') {
        hand.cards.push(g.shoe.pop());
        if (handValue(hand.cards).total >= 21) hand.done = true;
      } else if (msg.type === 'stand') {
        hand.done = true;
      } else {
        if (hand.cards.length !== 2) return 'You can only double on your first two cards.';
        if (chips < hand.bet) return "You don't have enough chips to double.";
        g.scores[pid] -= hand.bet;
        hand.bet *= 2;
        hand.doubled = true;
        hand.cards.push(g.shoe.pop());
        hand.done = true;
      }
      if (allDone(g, ctx)) settle(g, ctx);
      return;
    }

    if (msg.type === 'next' && g.stage === 'settle') {
      if (!ctx.isHost(pid)) return 'Only the host can do that.';
      advance(g, ctx);
      return;
    }
    return 'Not right now.';
  },

  timeout(g, ctx) {
    if (g.stage === 'bet') deal(g, ctx);
    else if (g.stage === 'play') settle(g, ctx); // anyone still thinking stands
    else if (g.stage === 'settle') advance(g, ctx);
  },

  view(g, pid) {
    const showHole = g.stage === 'settle';
    const dealer = showHole ? g.dealer : g.dealer.map((c, i) => (i === 1 ? '??' : c));
    const hands = {};
    for (const [id, h] of Object.entries(g.hands ?? {})) {
      hands[id] = { cards: h.cards, bet: h.bet, total: handValue(h.cards).total, done: h.done, result: h.result ?? null, back: h.back ?? null };
    }
    const tags = {};
    const marks = {};
    for (const id of g.ids) {
      if (g.stage === 'bet' && g.bets[id]) { tags[id] = `${g.bets[id]} bet`; marks[id] = 'done'; }
      if (hands[id]) {
        const h = hands[id];
        tags[id] = h.result ? labelFor(h.result) : h.total > 21 ? 'BUST' : isBlackjack(h.cards) ? 'BLACKJACK' : String(h.total);
        if (h.done && g.stage === 'play') marks[id] = 'done';
      }
    }
    return {
      stage: g.stage,
      title: g.stage === 'bet' ? 'Place your bets' : g.stage === 'play' ? 'Hit, stand or double?' : dealerLine(g),
      round: g.hand - 1,
      total: g.maxHands,
      deadline: g.deadline,
      duration: g.duration,
      canPlay: g.ids.includes(pid),
      chips: g.scores[pid] ?? 0,
      myBet: g.bets?.[pid] ?? null,
      minBet: MIN_BET,
      dealer,
      dealerTotal: showHole ? handValue(g.dealer).total : null,
      hands,
      mine: hands[pid] ?? null,
      tags,
      marks,
      last: g.hand >= g.maxHands,
      money: true,
    };
  },
};

function bettors(g) {
  return g.ids.filter((id) => g.scores[id] >= MIN_BET);
}

function startBetting(g, ctx) {
  g.hand += 1;
  g.stage = 'bet';
  g.bets = {};
  g.hands = {};
  g.dealer = [];
  setTimer(g, BET_SECONDS, ctx);
}

function deal(g, ctx) {
  g.shoe = newShoe(2, ctx.rand);
  g.hands = {};
  for (const [id, bet] of Object.entries(g.bets)) {
    g.scores[id] -= bet;
    g.hands[id] = { bet, cards: [g.shoe.pop(), g.shoe.pop()], done: false };
    if (isBlackjack(g.hands[id].cards)) g.hands[id].done = true;
  }
  g.dealer = [g.shoe.pop(), g.shoe.pop()];
  g.stage = 'play';
  setTimer(g, PLAY_SECONDS, ctx);
  if (isBlackjack(g.dealer) || allDone(g, ctx)) settle(g, ctx);
}

function allDone(g, ctx) {
  const open = Object.entries(g.hands).filter(([id, h]) => !h.done && ctx.online(id));
  return open.length === 0;
}

function settle(g, ctx) {
  const anyLive = Object.values(g.hands).some((h) => handValue(h.cards).total <= 21 && !isBlackjack(h.cards));
  if (anyLive && !isBlackjack(g.dealer)) playDealer(g.dealer, g.shoe);
  for (const [id, h] of Object.entries(g.hands)) {
    h.done = true;
    const { result, back } = payout(h, g.dealer);
    h.result = result;
    h.back = back;
    g.scores[id] += back;
  }
  g.stage = 'settle';
  setTimer(g, SETTLE_SECONDS, ctx);
}

function advance(g, ctx) {
  if (g.hand >= g.maxHands || bettors(g).length === 0) {
    g.over = true;
    clearTimer(g);
    return;
  }
  startBetting(g, ctx);
}

function labelFor(result) {
  return { win: 'WIN', lose: 'LOSE', push: 'PUSH', bust: 'BUST', blackjack: 'BLACKJACK' }[result];
}

function dealerLine(g) {
  const t = handValue(g.dealer).total;
  if (isBlackjack(g.dealer)) return 'Dealer has blackjack!';
  return t > 21 ? `Dealer busts with ${t}!` : `Dealer stands on ${t}`;
}
