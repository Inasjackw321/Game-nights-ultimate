// Turns state changes into sound and spectacle. Compares the previous and
// next room state after each render and fires effects for what changed.
import * as fx from './fx.js';
import { sfx } from './sfx.js';

export const REVEAL_STAGGER = 550; // keep in sync with games.js
const later = (ms, fn) => setTimeout(fn, ms);

export function onState(prev, next) {
  if (!next?.joined) return;
  if (!prev || prev.code !== next.code || !prev.joined) {
    sfx.join();
    later(50, () => { fx.seatAnim(next.you, 'arrive'); pointBubbles(next.you); });
    return;
  }
  const byId = new Map(next.players.map((p) => [p.id, p]));
  const idOf = (name) => next.players.find((p) => p.name === name)?.id;

  // Arrivals, departures, reconnects.
  const before = new Map(prev.players.map((p) => [p.id, p]));
  for (const p of next.players) {
    const old = before.get(p.id);
    if (!old) { fx.seatAnim(p.id, 'arrive'); sfx.splash(); later(300, () => pointBubbles(p.id, 20)); }
    else if (!old.connected && p.connected) { fx.seatAnim(p.id, 'hop'); sfx.bubble(); }
    else if (old.connected && !p.connected) sfx.leave();
    else if (old.look !== p.look) { fx.seatAnim(p.id, 'spin'); sfx.pop(3); pointBubbles(p.id); }
  }

  // Game start / game over.
  if (prev.phase !== 'playing' && next.phase === 'playing') {
    const name = next.catalog.find((g) => g.id === next.gameId)?.name ?? '';
    fx.banner('DIVE IN!', { sub: name, big: true });
    sfx.start();
    fx.hostAnim('jump');
    later(200, () => next.players.forEach((p, i) => later(i * 60, () => fx.seatAnim(p.id, 'hop'))));
    return;
  }
  if (prev.phase === 'playing' && next.phase === 'final' && next.final) {
    const winners = next.final.ranking.filter((r) => r.place === 1);
    const iWon = winners.some((w) => w.id === next.you);
    sfx.drumroll(1);
    later(1000, () => {
      sfx.victory();
      fx.fireworks(4);
      fx.flash('#ffe066');
      fx.banner(iWon ? 'YOU WIN!' : `${winners.map((w) => w.name).join(' & ')} WIN${winners.length > 1 ? '' : 'S'}!`, { big: true, sub: winners.length > 1 ? 'A tie!' : '' });
      winners.forEach((w) => { fx.seatAnim(w.id, 'spin'); const pt = fx.seatPoint(w.id); if (pt) fx.burst(pt.x, pt.y, { count: 90, speed: 4 }); });
      fx.hostAnim('spin');
    });
    return;
  }
  if (next.phase !== 'playing' || prev.phase !== 'playing') return;

  const a = prev.game;
  const b = next.game;
  if (!a || !b) return;
  const me = next.you;
  const stageChanged = a.stage !== b.stage || a.round !== b.round;

  // Someone locked in: their creature hops.
  if (!stageChanged) {
    for (const [id, m] of Object.entries(b.marks ?? {})) {
      if (m === 'done' && a.marks?.[id] !== 'done') { fx.seatAnim(id, 'hop'); id === me ? sfx.lock() : sfx.hop(); }
    }
  }

  // It's your turn (Who Am I?, Liar's Dice).
  if (b.active === me && a.active !== me && b.stage !== 'done') {
    fx.banner('YOUR TURN!', { color: 'var(--green)' });
    sfx.alert();
    fx.seatAnim(me, 'hop');
  }

  const handler = HANDLERS[next.gameId];
  if (handler) handler({ a, b, me, next, byId, idOf, stageChanged });
}

// ---- per-game spectacle -----------------------------------------------------------

function newRound(b) {
  sfx.whoosh();
  fx.hostAnim('chomp');
  later(120, sfx.chomp);
  const host = document.getElementById('hostFish')?.getBoundingClientRect();
  if (host) fx.bubbles(host.left + host.width * 0.8, host.top + host.height * 0.6, 16);
}

function pointBubbles(id, n = 12) {
  const pt = fx.seatPoint(id);
  if (pt) fx.bubbles(pt.x, pt.y, n);
}

function popScore(id, text, color, delay = 0) {
  const pt = fx.seatPoint(id);
  if (pt) fx.floatText(pt.x, pt.y - 30, text, color, delay);
}

function promptReveal({ a, b, me, idOf, stageChanged }, { deep }) {
  if (!stageChanged) return;
  if (b.stage === 'answer') return newRound(b);
  if (b.stage !== 'reveal' || !b.result) return;
  const groups = b.result.groups;
  groups.forEach((g, i) => later(i * REVEAL_STAGGER, () => {
    sfx.pop(i);
    const ids = g.players.map(idOf).filter(Boolean);
    ids.forEach((id) => { fx.seatAnim(id, 'hop'); if (g.points) popScore(id, `+${g.points}`, g.points >= 300 ? 'var(--yellow)' : 'var(--green)'); });
    if (deep && g.count === 1 && g.tier === 4) {
      later(120, () => {
        sfx.deepcut();
        fx.banner('DEEP CUT!!', { big: true, sub: g.label });
        fx.shake(2);
        fx.flash('#ffe066');
        ids.forEach((id) => { fx.seatAnim(id, 'spin'); const pt = fx.seatPoint(id); if (pt) fx.burst(pt.x, pt.y, { count: 120, speed: 5 }); });
      });
    } else if (!deep && i === groups.length - 1 && g.count > 1 && g.tierName === 'Biggest school') {
      later(120, () => {
        sfx.fanfare();
        fx.banner('HIVE MIND!', { sub: `${g.count} of you said ${g.label}` });
        ids.forEach((id) => { fx.seatAnim(id, 'spin'); pointBubbles(id, 20); });
      });
    }
  }));
  const end = groups.length * REVEAL_STAGGER;
  if ((b.result.deltas?.[me] ?? 0) === 0) later(end, () => { sfx.wah(); fx.seatAnim(me, 'squash'); });
}

const HANDLERS = {
  deepcut: (c) => promptReveal(c, { deep: true }),
  hivemind: (c) => promptReveal(c, { deep: false }),

  fib({ a, b, me, idOf, stageChanged }) {
    if (!stageChanged) return;
    if (b.stage === 'write') return newRound(b);
    if (b.stage === 'vote') { sfx.whoosh(); fx.banner('VOTE!', { color: 'var(--pink)', sub: 'Which one is real?' }); return; }
    if (b.stage !== 'reveal') return;
    const opts = b.result.options;
    opts.forEach((o, i) => later(i * REVEAL_STAGGER, () => {
      if (o.kind === 'truth') {
        sfx.ding();
        fx.flash('#5ff0a8');
        fx.banner('THE TRUTH!', { color: 'var(--green)', sub: o.text });
        o.voters.map(idOf).filter(Boolean).forEach((id) => { fx.seatAnim(id, 'spin'); popScore(id, '+500', 'var(--yellow)'); });
      } else {
        sfx.pop(i);
        o.authors.map(idOf).filter(Boolean).forEach((id) => { if (o.voters.length) { fx.seatAnim(id, 'hop'); popScore(id, `+${250 * o.voters.length}`, 'var(--pink)'); } });
        o.voters.map(idOf).filter(Boolean).forEach((id) => fx.seatAnim(id, 'squash'));
        if (o.voters.length >= 2) later(100, () => { sfx.wah(); fx.shake(1); });
      }
    }));
  },

  blitz({ b, me, byId, stageChanged }) {
    if (!stageChanged) return;
    if (b.stage === 'question') return newRound(b);
    if (b.stage !== 'reveal') return;
    const mine = b.result.deltas[me] ?? 0;
    for (const [id, pts] of Object.entries(b.result.deltas)) if (pts) { popScore(id, `+${pts}`); fx.seatAnim(id, 'hop'); }
    if (mine) { sfx.ding(); fx.confetti(mine > 850 ? 1 : 0.4); if (mine > 850) fx.banner('LIGHTNING!', { sub: `+${mine}` }); }
    else if (b.myChoice !== null) { sfx.buzz(); fx.shake(1.2); fx.seatAnim(me, 'squash'); }
    else sfx.timeUp();
  },

  likely({ b, idOf, stageChanged }) {
    if (!stageChanged) return;
    if (b.stage === 'vote') return newRound(b);
    if (b.stage !== 'reveal') return;
    sfx.drumroll(1.1);
    fx.hostAnim('wobble');
    later(1100, () => {
      sfx.fanfare();
      fx.flash('#ff6fa5');
      for (const id of b.result.winnerIds) {
        fx.seatAnim(id, 'spin');
        const pt = fx.seatPoint(id);
        if (pt) fx.burst(pt.x, pt.y, { count: 80, colors: ['#ffe066', '#ff6fa5', '#ffffff'], speed: 4 });
      }
      if (b.result.winners.length) fx.banner(b.result.winners.join(' & ').toUpperCase(), { color: 'var(--pink)', sub: b.title.replace(/^Who's most likely to /, '…').replace(/\?$/, '!') });
    });
  },

  whoami({ a, b, me, idOf, stageChanged }) {
    const seen = new Set((a.log ?? []).map((e) => JSON.stringify(e)));
    const fresh = (b.log ?? []).filter((e) => !seen.has(JSON.stringify(e)));
    for (const e of fresh) {
      const id = idOf(e.who);
      if (e.kind === 'solved') {
        sfx.fanfare();
        fx.confetti(0.8);
        fx.banner(id === me ? 'YOU GOT IT!' : `${e.who} GOT IT!`, { sub: e.text });
        if (id) { fx.seatAnim(id, 'spin'); popScore(id, 'SOLVED', 'var(--yellow)'); }
      } else if (e.answer === 'Yes') { sfx.ding(); if (id) fx.seatAnim(id, 'hop'); }
      else if (e.answer === 'No' || e.answer === 'Nope') { sfx.buzz(); if (id) fx.seatAnim(id, 'squash'); if (e.kind === 'guess') fx.shake(1); }
      else if (e.kind === 'skip') sfx.timeUp();
    }
    if (stageChanged && b.stage === 'respond' && b.active !== me) { sfx.alert(); fx.hostAnim('wobble'); }
    if (stageChanged && b.stage === 'turn' && a.stage === 'pick') { fx.banner('LET\'S GUESS!', { sub: 'Everyone can see your character but you' }); sfx.start(); }
  },

  blackjack({ a, b, me, idOf, stageChanged }) {
    if (stageChanged && b.stage === 'bet') { newRound(b); return; }
    if (stageChanged && b.stage === 'play') {
      const cards = Object.values(b.hands).reduce((n, h) => n + h.cards.length, 2);
      for (let i = 0; i < Math.min(cards, 14); i++) sfx.card(i * 0.09);
      fx.hostAnim('chomp');
      return;
    }
    if (!stageChanged && b.stage === 'play' && a.mine && b.mine && b.mine.cards.length > a.mine.cards.length) {
      sfx.card();
      if (b.mine.total > 21) { sfx.buzz(); fx.shake(1.5); fx.seatAnim(me, 'squash'); fx.banner('BUST!', { color: 'var(--red)' }); }
    }
    if (stageChanged && b.stage === 'settle') {
      sfx.card();
      for (const [id, h] of Object.entries(b.hands)) {
        const net = (h.back ?? 0) - h.bet;
        if (net > 0) { popScore(id, `+${net}`, 'var(--yellow)'); fx.seatAnim(id, 'hop'); }
        else if (net < 0) popScore(id, `${net}`, 'var(--red)');
      }
      const mine = b.mine;
      if (!mine) return;
      if (mine.result === 'blackjack') { sfx.deepcut(); fx.banner('BLACKJACK!', { big: true }); fx.confetti(1); }
      else if (mine.result === 'win') { sfx.chips(); sfx.coin(0.2); fx.confetti(0.5); }
      else if (mine.result === 'push') sfx.click();
      else { sfx.wah(); fx.shake(1); }
      if (b.dealerTotal > 21) fx.hostAnim('wobble');
    }
  },

  dice({ a, b, me, next, stageChanged }) {
    if (!stageChanged && b.stage === 'bid' && b.bid && JSON.stringify(a.bid) !== JSON.stringify(b.bid)) {
      sfx.pop(Math.min(6, b.bid.qty));
      fx.seatAnim(b.bid.by, 'hop');
    }
    if (stageChanged && b.stage === 'reveal' && b.last) {
      sfx.boom();
      fx.banner('LIAR!', { color: 'var(--red)', big: true, sub: `${b.last.challenger} calls out ${b.last.bidder}` });
      fx.shake(2.5);
      fx.hostAnim('wobble');
      later(500, sfx.dice);
      later(1300, () => {
        const loser = b.last.loserId;
        if (b.last.eliminated) {
          sfx.boom();
          fx.shake(3);
          fx.flash('#ff5c6c');
          const pt = fx.seatPoint(loser);
          if (pt) fx.burst(pt.x, pt.y, { count: 140, colors: ['#ff5c6c', '#ffa24a', '#ffe066', '#2b3a52'], speed: 5, gravity: 0.12 });
          popScore(loser, 'OUT!', 'var(--red)');
        } else {
          sfx.buzz();
          popScore(loser, '-1 ♥', 'var(--pink)');
        }
        fx.seatAnim(loser, 'squash');
      });
      return;
    }
    if (stageChanged && b.stage === 'bid' && a.stage === 'reveal') { sfx.dice(); fx.hostAnim('chomp'); }
  },

  tycoon({ a, b, me, byId }) {
    if (b.move && b.move.id !== a.move?.id) {
      const m = b.move;
      const n = b.board.length;
      const die = document.querySelector('.roll-die');
      die?.classList.add('rolling');
      sfx.dice();
      // Hop along the path tile by tile, then land.
      const steps = [];
      for (let k = 1; k <= m.dice; k++) steps.push((m.from + k) % n);
      steps.forEach((t, k) => later(450 + k * 170, () => {
        sfx.hop();
        const el = document.querySelector(`[data-tile="${t}"]`);
        el?.classList.add('step');
        later(160, () => el?.classList.remove('step'));
      }));
      const landAt = 450 + steps.length * 170;
      later(landAt, () => {
        const el = document.querySelector(`[data-tile="${m.to}"]`);
        el?.classList.remove('land'); void el?.offsetWidth; el?.classList.add('land');
        document.querySelector(`[data-token="${CSS.escape(m.pid)}"]`)?.classList.add('arrive');
        fx.seatAnim(m.pid, 'hop');
        const r = el?.getBoundingClientRect();
        if (r) fx.bubbles(r.left + r.width / 2, r.top + r.height / 2, 10);
        for (const e of m.events) if (e.kind === 'current') { sfx.whoosh(); fx.banner('WHOOSH!', { color: 'var(--blue)', sub: e.text }); }
        if (m.events.some((e) => e.kind === 'home')) { sfx.coin(); popScore(m.pid, '+150', 'var(--yellow)'); }
        if (m.toll) {
          sfx.chips();
          popScore(m.pid, `-${m.toll.amount}`, 'var(--red)');
          popScore(m.toll.to, `+${m.toll.amount}`, 'var(--yellow)', 250);
          fx.seatAnim(m.toll.to, 'spin');
          if (m.toll.amount >= 150) { fx.banner('PAY UP!', { color: 'var(--red)', sub: `${m.toll.amount} pearls` }); fx.shake(1.5); sfx.wah(); }
        }
        if (m.shark !== undefined) { sfx.boom(); fx.banner('CHOMP!', { color: 'var(--red)', big: true, sub: `Shark bite: -${m.shark}` }); fx.shake(2.5); fx.flash('#ff5c6c'); fx.seatAnim(m.pid, 'squash'); }
        if (m.chest) { sfx.ding(); fx.banner('TREASURE!', { sub: m.chest }); if (r) fx.burst(r.left + r.width / 2, r.top + r.height / 2, { count: 60, colors: ['#ffe066', '#ffffff', '#ffa24a'] }); }
        if (m.pid === me && b.stage === 'decide') sfx.alert();
      });
    }
    if (b.move?.bought && !a.move?.bought && b.move.id === a.move?.id) {
      const el = document.querySelector(`[data-tile="${b.move.bought.tile}"]`);
      const r = el?.getBoundingClientRect();
      sfx.coin();
      sfx.fanfare();
      if (r) fx.burst(r.left + r.width / 2, r.top + r.height / 2, { count: 70, speed: 3.5 });
      fx.banner(b.move.bought.kind === 'buy' ? 'CLAIMED!' : 'CORAL GROWS!', { color: 'var(--green)', sub: b.board[b.move.bought.tile].name });
    }
  },

  derby({ b, me, stageChanged }) {
    if (!stageChanged) return;
    if (b.stage === 'bet') return newRound(b);
    if (b.stage === 'race') {
      sfx.horn();
      fx.banner("AND THEY'RE OFF!", { color: 'var(--green)' });
      for (let t = 0; t < 7; t += 0.5) later(t * 1000, () => sfx.bubble());
      return;
    }
    if (b.stage === 'result') {
      fx.flash('#ffe066');
      sfx.fanfare();
      const lane = document.querySelector(`[data-lane="${b.winner}"] img`);
      if (lane) { const r = lane.getBoundingClientRect(); fx.burst(r.left + r.width / 2, r.top + r.height / 2, { count: 100, speed: 4 }); }
      for (const [id, d] of Object.entries(b.deltas ?? {})) popScore(id, `${d >= 0 ? '+' : ''}${d}`, d > 0 ? 'var(--yellow)' : 'var(--red)');
      const mine = b.deltas?.[me];
      if (mine > 0) later(600, () => { sfx.chips(); fx.confetti(1); fx.banner('KA-CHING!', { sub: `+${mine} chips` }); });
      else if (mine < 0) later(600, () => sfx.wah());
    }
  },
};
