// Per-game panel renderers. Each returns an HTML string for the panel under
// the reef stage. Buttons use data-send='{json}' and forms data-form="type";
// app.js turns those into WebSocket messages.
import { spriteUrl } from './sprites.js';

const send = (msg) => `data-send='${JSON.stringify(msg)}'`;
const NEXT = (v, h, label = 'Next') => h.isHost
  ? `<button class="btn primary big" ${send({ type: 'next' })}>${v.last ? 'Final scores' : label}</button>`
  : '<p class="waiting">The host will move on</p>';
const STAGGER = 550;

function textForm(type, { placeholder, button = 'Lock in', name = 'text', max = 40 } = {}) {
  return `<form class="answer" data-form="${type}" autocomplete="off">
    <input name="${name}" maxlength="${max}" placeholder="${placeholder}" autofocus autocapitalize="off" autocorrect="off" spellcheck="false" enterkeyhint="send">
    <button class="btn primary">${button}</button>
  </form>`;
}

function locked(label, text, h) {
  return `<div class="locked"><span class="eyebrow">${label}</span>${h.esc(text)}</div>`;
}

function deltaBoard(deltas, h, { money = false } = {}) {
  const ids = Object.keys(deltas ?? {});
  const rows = h.players.filter((p) => p.inGame).sort((a, b) => (b.score ?? 0) - (a.score ?? 0));
  return `<ol class="board">${rows.map((p) => {
    const d = deltas?.[p.id] ?? 0;
    return `<li class="${p.id === h.me ? 'me' : ''}"><img class="mini" src="${spriteUrl(p.look)}" alt=""><span class="name">${h.esc(p.name)}</span>
      ${ids.length ? `<span class="delta ${d > 0 ? '' : d < 0 ? 'neg' : 'zero'}">${d >= 0 ? '+' : ''}${d}</span>` : ''}
      <span class="score">${money ? '◆ ' : ''}${p.score ?? 0}</span></li>`;
  }).join('')}</ol>`;
}

function pop(h, i) {
  return h.fresh ? ` pop" style="animation-delay:${i * STAGGER}ms` : '';
}

// ---- Deep Cut & Hive Mind ------------------------------------------------------

function promptPanel(v, h, { review }) {
  if (v.stage === 'answer') {
    if (!v.canPlay) return '<p class="waiting">Everyone is answering</p>';
    return v.myAnswer === null ? textForm('answer', { placeholder: 'Your answer' }) : locked('Locked in', v.myAnswer, h);
  }
  if (v.stage === 'review') {
    if (!v.items) return `<p class="waiting">The host is checking ${v.pending} answer${v.pending === 1 ? '' : 's'} that ${v.pending === 1 ? "isn't" : "aren't"} on the list</p>`;
    return `<p class="note">These answers aren't on the list. Accept the real ones (they score as <b>Rare</b>).</p>
      <ul class="list">${v.items.map((u) => `<li class="item ${u.accepted ? 't3' : ''}"><span class="label">${h.esc(u.label)}${u.count > 1 ? ` <span class="muted">×${u.count}</span>` : ''}</span>
        <span class="row"><button class="btn small ${u.accepted ? 'go' : ''}" ${send({ type: 'review', key: u.key, accept: true })}>Accept</button>
        <button class="btn small ${u.accepted ? '' : 'danger'}" ${send({ type: 'review', key: u.key, accept: false })}>Reject</button></span></li>`).join('')}</ul>
      <button class="btn primary big" ${send({ type: 'reveal' })}>Reveal answers</button>`;
  }
  const r = v.result;
  return `<ul class="list">${r.groups.length ? r.groups.map((g, i) => `
      <li class="item ${g.tier ? `t${g.tier}` : g.count > 1 ? 't3' : 't1'} ${g.count === 1 && review ? 'solo' : ''}${pop(h, i)}">
        <span class="label">${h.esc(g.label)}</span><span class="pts">+${g.points}</span>
        <span class="meta">${h.esc(g.tierName)} · ${g.count === 1 ? 'only one' : `${g.count} said it`}</span>
        <span class="who">${g.players.map(h.esc).join(', ')}</span></li>`).join('') : '<li class="muted">No accepted answers this round.</li>'}</ul>
    ${r.misses.length ? `<p class="note">${r.misses.map((m) => `${m.reason === 'No answer' ? 'No answer' : `<s>${h.esc(m.label)}</s> not accepted`}: ${m.players.map(h.esc).join(', ')}`).join('<br>')}</p>` : ''}
    ${r.missed?.length ? `<p class="note">Deep cuts nobody said: ${r.missed.map((x) => `<b>${h.esc(x)}</b>`).join(', ')}</p>` : ''}
    ${deltaBoard(r.deltas, h)}${NEXT(v, h, 'Next prompt')}`;
}

// ---- Fib Factory ------------------------------------------------------------------

function fibPanel(v, h) {
  if (v.stage === 'write') {
    if (!v.canPlay) return '<p class="waiting">Everyone is writing lies</p>';
    return v.myAnswer === null
      ? `<p class="note">Write a <b>fake</b> answer that sounds true. You score when other players pick it.</p>${textForm('answer', { placeholder: 'A convincing lie', button: 'Submit lie', max: 50 })}`
      : locked('Your lie', v.myAnswer, h);
  }
  if (v.stage === 'vote') {
    if (!v.canPlay) return '<p class="waiting">Everyone is voting</p>';
    return `<p class="note">Which one is the <b>truth</b>?</p><div class="options">${v.options.map((o) => `
      <button class="btn ${v.myVote === o.id ? 'primary' : ''}" ${o.mine || v.myVote !== null ? 'disabled' : ''} ${send({ type: 'vote', option: o.id })}>${h.esc(o.text)}${o.mine ? ' <span class="muted">(your lie)</span>' : ''}</button>`).join('')}</div>`;
  }
  const r = v.result;
  return `<ul class="list">${r.options.map((o, i) => `
    <li class="item ${o.kind}${pop(h, i)}"><span class="label">${h.esc(o.text)}</span>
      <span class="pts">${o.kind === 'truth' ? 'TRUTH' : o.kind === 'house' ? 'HOUSE LIE' : 'LIE'}</span>
      <span class="meta">${o.kind === 'lie' ? `by ${o.authors.map(h.esc).join(', ')}` : o.kind === 'house' ? 'one of ours' : ''}</span>
      <span class="who">${o.voters.length ? `${o.kind === 'truth' ? 'Found it' : 'Fooled'}: ${o.voters.map(h.esc).join(', ')}` : '<span class="muted">Nobody picked this</span>'}</span></li>`).join('')}</ul>
    ${deltaBoard(r.deltas, h)}${NEXT(v, h, 'Next fact')}`;
}

// ---- Blitz -----------------------------------------------------------------------

function blitzPanel(v, h) {
  const reveal = v.stage === 'reveal';
  const buttons = v.choices.map((c, i) => {
    const cls = reveal ? (i === v.result.correct ? 'right' : 'wrong') : v.myChoice === i ? 'on' : '';
    const count = reveal ? `<span class="count">${v.result.counts[i]}</span>` : '';
    const disabled = reveal || v.myChoice !== null || !v.canPlay ? 'disabled' : '';
    return `<button class="btn choice-${i} ${cls}" ${disabled} ${send({ type: 'answer', choice: i })}>${count}${h.esc(c)}</button>`;
  }).join('');
  if (!reveal) return `<div class="choices">${buttons}</div>${v.myChoice !== null ? '<p class="waiting">Locked in</p>' : ''}`;
  const mine = v.result.deltas[h.me];
  return `<div class="choices">${buttons}</div>
    <p class="note">${v.myChoice === null ? 'You didn\'t answer.' : mine ? `Correct! <b>+${mine}</b>` : 'Not this time.'}${v.result.fastest ? ` Fastest: <b>${h.esc(v.result.fastest)}</b>` : ''}</p>
    ${deltaBoard(v.result.deltas, h)}${NEXT(v, h)}`;
}

// ---- Most Likely To ----------------------------------------------------------------

function likelyPanel(v, h) {
  if (v.stage === 'vote') {
    if (!v.canPlay) return '<p class="waiting">Everyone is voting</p>';
    return `<div class="people">${v.candidates.filter((id) => id !== h.me).map((id) => `
      <button class="btn ${v.myVote === id ? 'primary' : ''}" ${v.myVote ? 'disabled' : ''} ${send({ type: 'vote', target: id })}>
        <img src="${spriteUrl(h.look(id))}" alt="">${h.esc(h.name(id))}</button>`).join('')}</div>
      ${v.myVote ? '<p class="waiting">Vote cast</p>' : ''}`;
  }
  const r = v.result;
  const counts = Object.entries(r.counts).sort((a, b) => b[1] - a[1]);
  return `${r.winners.length ? `<div class="big-name">${r.winners.map(h.esc).join(' & ')}</div>` : '<p class="note center">Nobody voted!</p>'}
    <ul class="list">${counts.map(([id, n], i) => `<li class="item ${r.winnerIds.includes(id) ? 't4' : 't1'}${pop(h, i)}"><span class="label">${h.esc(h.name(id))}</span><span class="pts">${n} vote${n === 1 ? '' : 's'}</span>
      <span class="who">${r.votes.filter((x) => x.target === h.name(id)).map((x) => h.esc(x.voter)).join(', ')}</span></li>`).join('')}</ul>
    <p class="note">Everyone who voted with the room gets <b>+200</b>.</p>
    ${deltaBoard(r.deltas, h)}${NEXT(v, h, 'Next prompt')}`;
}

// ---- Who Am I? -----------------------------------------------------------------------

function whoamiPanel(v, h) {
  let body = '';
  if (v.stage === 'pick') {
    if (!v.canPlay) body = '<p class="waiting">Everyone is choosing characters</p>';
    else body = v.myPick
      ? `${locked(`You picked for ${h.esc(v.target.name)}`, v.myPick, h)}<p class="waiting">Waiting for the others</p>`
      : `<p class="note">Pick a famous person or character for <b>${h.esc(v.target.name)}</b>. Everyone except them will see it. Make it gettable!</p>
         ${textForm('pick', { placeholder: 'e.g. Sherlock Holmes', button: 'Choose' })}`;
  } else if (v.stage === 'turn') {
    if (v.active === h.me) {
      body = `<p class="note">Your turn! You have <b>${v.turnsLeft[h.me]}</b> turn${v.turnsLeft[h.me] === 1 ? '' : 's'} left. Ask a yes/no question, or guess who you are.</p>
        <form data-form="ask" data-clear autocomplete="off">
          <div class="answer"><input name="text" maxlength="80" placeholder="Am I a real person?" autofocus enterkeyhint="send"></div>
          <div class="btn-row"><button class="btn primary" name="kind" value="question">Ask (yes/no)</button>
          <button class="btn pink" name="kind" value="guess">Guess who I am</button></div>
        </form>`;
    } else {
      body = `<p class="waiting">${h.esc(h.name(v.active))} is thinking</p>`;
    }
  } else if (v.stage === 'respond') {
    const guess = v.ask.kind === 'guess';
    if (v.active === h.me) body = '<p class="waiting">The room is answering</p>';
    else if (!v.canPlay) body = '<p class="waiting">The players are answering</p>';
    else if (v.myResponse) body = `<p class="waiting">You said ${v.myResponse === 'yes' ? (guess ? 'correct' : 'yes') : (guess ? 'wrong' : 'no')}</p>`;
    else body = `<p class="note">${h.esc(h.name(v.active))} is <b>${h.esc(v.tags?.[v.active] ?? '?')}</b>.</p>
      <div class="btn-row"><button class="btn go" ${send({ type: 'respond', answer: 'yes' })}>${guess ? 'Correct!' : 'Yes'}</button>
      <button class="btn danger" ${send({ type: 'respond', answer: 'no' })}>${guess ? 'Wrong' : 'No'}</button></div>`;
  }
  return body + whoLog(v, h);
}

function whoLog(v, h) {
  if (!v.log?.length) return '';
  return `<ul class="log">${[...v.log].reverse().map((e) => {
    if (e.kind === 'solved') return `<li><b>${h.esc(e.who)}</b> worked out they're <b>${h.esc(e.text)}</b><span class="ans solved">SOLVED</span></li>`;
    if (e.kind === 'skip') return `<li><b>${h.esc(e.who)}</b> ${h.esc(e.text)}</li>`;
    return `<li><b>${h.esc(e.who)}</b> ${e.kind === 'guess' ? 'guessed' : 'asked'} “${h.esc(e.text)}”<span class="ans ${h.esc(e.answer)}">${h.esc(e.answer)}</span></li>`;
  }).join('')}</ul>`;
}

function whoamiSummary(v, h) {
  if (!v?.tags) return '';
  return `<div class="section"><h3>WHO WAS WHO</h3><ul class="log">${Object.entries(v.tags).map(([id, c]) =>
    `<li><b>${h.esc(h.name(id))}</b> was <b>${h.esc(c)}</b>${v.marks?.[id] === 'solved' ? '<span class="ans solved">SOLVED</span>' : ''}</li>`).join('')}</ul></div>`;
}

// ---- Blackjack -------------------------------------------------------------------------

function card(c, small = false) {
  if (c === '??') return '<span class="pcard back"></span>';
  const red = /[♥♦]/.test(c);
  return `<span class="pcard ${red ? 'red' : ''}">${c.slice(0, -1)}<br>${c.slice(-1)}</span>`;
}

function chipButtons(chips, min, extra = '') {
  const amounts = [...new Set([min, 50, 100, 250, 500].filter((a) => a <= chips))];
  return `<div class="bets">${amounts.map((a) => `<button class="btn" name="amount" value="${a}">${a}</button>`).join('')}
    ${chips >= min ? `<button class="btn pink" name="amount" value="${chips}">All in (${chips})</button>` : ''}${extra}</div>`;
}

function blackjackPanel(v, h) {
  const dealer = `<div class="eyebrow">Dealer${v.dealerTotal !== null ? ` · ${v.dealerTotal}` : ''}</div><div class="hand">${v.dealer.map((c) => card(c)).join('')}</div>`;
  if (v.stage === 'bet') {
    if (!v.canPlay) return '<p class="waiting">Bets are going down</p>';
    if (v.chips < v.minBet) return "<p class=\"note\">You're out of chips. Watch the others ride their luck!</p>";
    return `<p>You have <span class="chips">◆ ${v.chips}</span></p>
      ${v.myBet ? locked('Your bet', `◆ ${v.myBet}`, h) : `<form data-form="bet">${chipButtons(v.chips, v.minBet)}</form>`}`;
  }
  const others = Object.entries(v.hands).filter(([id]) => id !== h.me).map(([id, hand]) => `
    <div><b>${h.esc(h.name(id))}</b> <span class="muted">◆ ${hand.bet}</span>
      <div class="hand">${hand.cards.map((c) => card(c, true)).join('')}<span class="total res-${hand.result ?? ''}">${hand.result ? hand.result.toUpperCase() : hand.total}</span></div></div>`).join('');
  const mine = v.mine;
  let myArea = '<p class="note">You sat this hand out.</p>';
  if (mine) {
    const actions = v.stage === 'play' && !mine.done
      ? `<div class="btn-row"><button class="btn go" ${send({ type: 'hit' })}>Hit</button><button class="btn" ${send({ type: 'stand' })}>Stand</button>
         <button class="btn primary" ${mine.cards.length !== 2 || v.chips < mine.bet ? 'disabled' : ''} ${send({ type: 'double' })}>Double</button></div>`
      : v.stage === 'play' ? '<p class="waiting">Waiting for the table</p>' : '';
    const result = mine.result ? `<p class="big-name res-${mine.result}">${mine.result.toUpperCase()}${mine.back ? ` +${mine.back}` : ''}</p>` : '';
    myArea = `<div class="eyebrow">Your hand · bet ◆ ${mine.bet}</div><div class="hand">${mine.cards.map((c) => card(c)).join('')}<span class="total">${mine.total}</span></div>${result}${actions}`;
  }
  return `${dealer}${myArea}${others ? `<div class="seat-hands">${others}</div>` : ''}
    ${v.stage === 'settle' ? `${deltaBoard(null, h, { money: true })}${NEXT(v, h, 'Next hand')}` : ''}`;
}

// ---- Liar's Dice -----------------------------------------------------------------------

const PIPS = { 1: [4], 2: [0, 8], 3: [0, 4, 8], 4: [0, 2, 6, 8], 5: [0, 2, 4, 6, 8], 6: [0, 2, 3, 5, 6, 8] };
function die(n, cls = '') {
  return `<span class="die ${cls}">${Array.from({ length: 9 }, (_, i) => `<i style="${PIPS[n].includes(i) ? '' : 'visibility:hidden'}"></i>`).join('')}</span>`;
}

function dicePanel(v, h) {
  const myDice = v.myDice.length ? `<div class="eyebrow">Your dice (ones are wild)</div><div class="dice">${v.myDice.map((d) => die(d, d === 1 ? 'wild' : '')).join('')}</div>` : '';
  if (v.stage === 'reveal' && v.last) {
    const face = v.last.bid.face;
    return `<div class="reveal-dice">${Object.entries(v.last.dice).map(([id, ds]) => `
      <div><span class="name">${h.esc(h.name(id))}</span><span class="dice">${ds.map((d) => die(d, `small ${d === face ? 'hit' : d === 1 ? 'wild' : ''}`)).join('')}</span></div>`).join('')}</div>
      <p class="note">Bid: <b>${v.last.bid.qty} × ${face}s</b>. On the table: <b>${v.last.total}</b>.</p>${NEXT(v, h, 'Next round')}`;
  }
  if (v.stage === 'done') return myDice;
  let controls = '';
  if (v.active === h.me) {
    const next = !v.bid ? { qty: 1, face: 2 } : v.bid.face < 6 ? { qty: v.bid.qty, face: v.bid.face + 1 } : { qty: v.bid.qty + 1, face: 2 };
    controls = `<form data-form="bid" class="bidder">
        <label class="field"><span>How many</span><input name="qty" type="number" min="1" max="${v.totalDice}" value="${next.qty}" style="width:90px"></label>
        <div class="field"><span>Of which face</span><div class="faces">${[2, 3, 4, 5, 6].map((f) => `<label><input type="radio" name="face" value="${f}" ${f === next.face ? 'checked' : ''} hidden>${die(f, 'small')}</label>`).join('')}</div></div>
        <button class="btn primary">Bid</button>
        ${v.bid ? `<button type="button" class="btn danger" ${send({ type: 'liar' })}>Liar!</button>` : ''}
      </form>`;
  } else {
    controls = `<p class="waiting">${h.esc(h.name(v.active))} is deciding</p>`;
  }
  return `${myDice}<p class="note">${v.totalDice} dice on the table.${v.bid ? ` Current bid: <b>${v.bid.qty} × ${v.bid.face}s</b>.` : ''}</p>${controls}`;
}

// ---- Reef Derby -------------------------------------------------------------------------

function derbyPanel(v, h) {
  if (v.stage === 'bet') {
    if (!v.canPlay) return '<p class="waiting">Bets are going down</p>';
    if (v.myBet) return `${locked('Your bet', `◆ ${v.myBet.amount} on ${v.odds[v.myBet.racer].name} (×${v.odds[v.myBet.racer].payout})`, h)}<p class="waiting">Waiting for the others</p>`;
    if (v.chips < v.minBet) return "<p class=\"note\">You're out of chips. Cheer from the reef!</p>";
    return `<p>You have <span class="chips">◆ ${v.chips}</span>. Pick a racer, then a bet.</p>
      <form data-form="bet"><div class="racers">${v.odds.map((r, i) => `
        <label class="btn racer"><input type="radio" name="racer" value="${i}" ${i === 0 ? 'checked' : ''} hidden>
          <img src="${spriteUrl(r.id)}" alt="">${h.esc(r.name)}<span class="odds">×${r.payout}</span></label>`).join('')}</div>
        ${chipButtons(v.chips, v.minBet)}</form>`;
  }
  const lanes = `<div class="lanes">${v.odds.map((r, i) => `<div class="lane ${v.stage === 'result' && v.winner === i ? 'won' : ''}" data-lane="${i}">
    <img src="${spriteUrl(r.id)}" alt=""><span class="lname">${h.esc(r.name)} ×${r.payout}</span></div>`).join('')}</div>`;
  if (v.stage === 'race') return lanes;
  const d = v.deltas?.[h.me];
  return `${lanes}<p class="note">${d === undefined ? 'You sat this race out.' : d > 0 ? `You won <b>◆ ${d}</b>!` : `You lost ◆ ${-d}.`}</p>
    ${deltaBoard(v.deltas, h, { money: true })}${NEXT(v, h, 'Next race')}`;
}

// Animate racers along their lanes from the server's precomputed track.
const RACE_MS = 8000;
function derbyFrame(v, panel, now) {
  if (!v.track) return;
  const t = v.stage === 'race' ? Math.max(0, Math.min(1, (now - v.raceStart) / RACE_MS)) : 1;
  for (const lane of panel.querySelectorAll('[data-lane]')) {
    const curve = v.track[Number(lane.dataset.lane)];
    const f = t * (curve.length - 1);
    const i = Math.floor(f);
    const p = curve[i] + (curve[Math.min(i + 1, curve.length - 1)] - curve[i]) * (f - i);
    const span = lane.clientWidth - 38 - 30;
    lane.querySelector('img').style.setProperty('--x', `${Math.round(p * span)}px`);
  }
}

export const RENDERERS = {
  deepcut: { panel: (v, h) => promptPanel(v, h, { review: true }) },
  hivemind: { panel: (v, h) => promptPanel(v, h, { review: false }) },
  fib: { panel: fibPanel },
  blitz: { panel: blitzPanel },
  likely: { panel: likelyPanel },
  whoami: { panel: whoamiPanel, summary: whoamiSummary },
  blackjack: { panel: blackjackPanel },
  dice: { panel: dicePanel },
  derby: { panel: derbyPanel },
};

export const FRAMES = { derby: derbyFrame };
