// Deep Cut and Hive Mind share a round structure: a prompt, a timed free-text
// answer, then a reveal. They differ in how matching answers are scored, and
// Deep Cut judges answers instantly: anything not on the list is bounced back
// straight away so the player can try again before time runs out.
import { PROMPTS } from '../content/prompts.js';
import { classify, clusterUnknowns, compilePrompt } from '../match.js';
import { addPoints, clearTimer, deal, everyoneIn, marksFor, setTimer, tooLate, zeroScores } from './kit.js';

const MAX_ANSWER = 40;
const compiled = new Map(PROMPTS.map((p) => [p.id, compilePrompt(p)]));
export const compiledPrompt = (id) => compiled.get(id);

export function promptGame({ meta, instant, score }) {
  return {
    meta,

    init(ctx) {
      const ids = ctx.ids;
      return {
        ids,
        deck: deal(PROMPTS, ctx.settings.rounds, ctx.seen, ctx.rand).map((p) => p.id),
        round: -1,
        scores: zeroScores(ids),
        ...startRound({ round: -1 }, ctx),
      };
    },

    action(g, pid, msg, ctx) {
      const inGame = g.ids.includes(pid);
      if (msg.type === 'answer') {
        if (!inGame) return 'You joined mid-game — you can play the next one.';
        if (g.stage !== 'answer') return 'Answers are closed.';
        if (tooLate(g, ctx)) return 'Too late — time is up.';
        if (pid in g.answers) return 'You already locked in an answer.';
        const text = String(msg.text ?? '').slice(0, MAX_ANSWER);
        if (instant) {
          const c = classify(compiled.get(g.deck[g.round]), text);
          if (c.kind === 'blank') return 'Type an answer first!';
          if (c.kind !== 'match') return `“${c.label}” isn't on our list. Try another!`;
        }
        g.answers[pid] = text;
        if (everyoneIn(g.ids, g.answers, ctx)) closeAnswers(g, ctx);
        return;
      }
      if (!ctx.isHost(pid)) return 'Only the host can do that.';
      if (msg.type === 'next' && g.stage === 'reveal') {
        if (g.round + 1 >= g.deck.length) { g.over = true; return; }
        Object.assign(g, startRound(g, ctx));
        return;
      }
      return 'Not right now.';
    },

    timeout(g, ctx) {
      if (g.stage === 'answer') closeAnswers(g, ctx);
    },

    view(g, pid, ctx) {
      const prompt = compiled.get(g.deck[g.round]);
      const base = {
        stage: g.stage,
        title: prompt.text,
        round: g.round,
        total: g.deck.length,
        deadline: g.deadline,
        duration: g.duration,
      };
      if (g.stage === 'answer') {
        const mine = g.answers[pid] ?? null;
        return {
          ...base,
          instant: Boolean(instant),
          myAnswer: mine,
          // Deep Cut shows the answer it recognised, e.g. "orechiete" -> "Orecchiette".
          myLabel: instant && mine !== null ? classify(prompt, mine).label : mine,
          canPlay: g.ids.includes(pid),
          marks: marksFor(g.ids, g.answers),
        };
      }
      return { ...base, result: g.result, last: g.round + 1 >= g.deck.length };
    },
  };

  function startRound(g, ctx) {
    const out = { round: g.round + 1, stage: 'answer', answers: {}, classified: {}, result: null };
    setTimer(out, ctx.settings.seconds, ctx);
    return out;
  }

  function closeAnswers(g, ctx) {
    const prompt = compiled.get(g.deck[g.round]);
    for (const id of g.ids) g.classified[id] = classify(prompt, g.answers[id] ?? '');
    clusterUnknowns(g.classified);
    clearTimer(g);
    reveal(g, ctx);
  }

  function reveal(g, ctx) {
    const prompt = compiled.get(g.deck[g.round]);
    const { groups, misses, deltas, extra } = score(g.classified, prompt, ctx);
    addPoints(g, deltas);
    g.result = {
      groups: groups.map((x) => ({ ...x, players: x.players.map(ctx.name) })),
      misses: misses.map((m) => ({ ...m, players: m.players.map(ctx.name) })),
      deltas,
      ...extra,
    };
    g.stage = 'reveal';
    clearTimer(g);
  }
}

// Bucket classified answers into groups of "the same answer". Matched answers
// group by canonical answer; unknown answers group by cluster key and only
// count when `countUnknown(key)` says so.
export function groupAnswers(classified, countUnknown) {
  const groups = new Map();
  const misses = new Map();
  for (const [playerId, c] of Object.entries(classified)) {
    if (c.kind === 'match' || (c.kind === 'unknown' && countUnknown(c.key))) {
      const k = c.kind === 'match' ? `m${c.answerId}` : `u${c.key}`;
      if (!groups.has(k)) groups.set(k, { label: c.label, tier: c.kind === 'match' ? c.tier : null, offList: c.kind === 'unknown', players: [] });
      groups.get(k).players.push(playerId);
    } else {
      const k = c.kind === 'blank' ? '' : c.key;
      if (!misses.has(k)) misses.set(k, { label: c.kind === 'blank' ? '—' : c.label, reason: c.kind === 'blank' ? 'No answer' : 'Not accepted', players: [] });
      misses.get(k).players.push(playerId);
    }
  }
  return { groups: [...groups.values()], misses: [...misses.values()] };
}
