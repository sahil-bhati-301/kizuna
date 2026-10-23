// Simulated learners for the demo and for tests. Knowledge is a deterministic function of
// (profile, item), so practice answers stay consistent with test answers; practice items
// (IDs starting "p-") get a learning boost so improvement shows up.
import type { ContentSet } from '@kizuna/content';
import type { Answer, Option, Question, SimProfile, SimProfileId } from './contracts';
import { type ContentIndex, getIndex } from './contentIndex';
import { type Rng, between, hash01, rngFor } from './rng';
import { FACET_OF } from './tags';

export const simProfiles: SimProfile[] = [
  {
    id: 'visual_confuser',
    label: 'Lookalike confuser',
    description: 'Knows about 80% of items, but when a lookalike kanji is on the card picks it about 70% of the time unless the item is well known.',
  },
  {
    id: 'kun_struggler',
    label: "Kun'yomi struggler",
    description: "Rarely gets kun'yomi right (about 1 in 5, counting lucky guesses) and usually picks the on'yomi instead; about 80% on everything else.",
  },
  {
    id: 'context_gap',
    label: 'Words gap',
    description: 'Knows kanji on their own (about 85%) but reads them inside words right only about 1 time in 4.',
  },
  {
    id: 'component_gap',
    label: 'Component family gap',
    description: "Weak (about 1 in 5 right) on kanji containing the content's largest component family; about 85% on the rest.",
  },
  {
    id: 'strong_beginner',
    label: 'Strong beginner',
    description: 'Knows about 92% of items everywhere, with an occasional random slip.',
  },
];

export const SIM_CONFIG = {
  practiceBoost: 0.6,
  confuseRate: 0.7,
  practiceConfuseRate: 0.3,
  /** "Knows strongly" = knowledge draw below this fraction of pKnow. */
  strongFraction: 0.35,
  dontKnowRate: 0.2,
  swapWhenWrong: 0.8,
  slip: 0.03,
  strongBeginnerSlip: 0.04,
};

/** The component family the component_gap learner is weak on (deterministic). */
export function simTargetFamily(content: ContentSet): string | undefined {
  return getIndex(content).rankedFamilies[0]?.component;
}

function baseKnowledge(ix: ContentIndex, profile: SimProfileId, q: Question, family: string | undefined): number {
  const facet = FACET_OF[q.type];
  switch (profile) {
    case 'visual_confuser':
      return 0.8;
    // Injected weaknesses are strong enough that a single 60-question test shows them reliably.
    case 'kun_struggler':
      return facet === 'reading_kun' ? 0.12 : 0.8;
    case 'context_gap':
      return facet === 'context' ? 0.15 : 0.85;
    case 'component_gap':
      return family && (ix.componentsOf.get(q.kanji) ?? []).includes(family) ? 0.12 : 0.85;
    case 'strong_beginner':
      return 0.95;
  }
}

function randomWrong(q: Question, rng: Rng): Option | undefined {
  const wrong = q.options.filter((o) => !o.correct);
  return wrong[Math.floor(rng() * wrong.length)];
}

export function simulateAnswers(
  questions: Question[],
  profile: SimProfileId,
  content: ContentSet,
  opts?: { seed?: number; startAt?: number },
): Answer[] {
  const ix = getIndex(content);
  const seed = opts?.seed ?? 1;
  let t = opts?.startAt ?? 0;
  const family = simTargetFamily(content);
  const cfg = SIM_CONFIG;
  return questions.map((q) => {
    const rng = rngFor(seed, 'sim', profile, q.id);
    const practice = q.id.startsWith('p-');
    const itemKey = q.type === 'word_reading' ? `word:${q.wordId}` : `kanji:${q.kanji}:${FACET_OF[q.type]}`;
    const draw = hash01('sim-knowledge', profile, itemKey);
    let pKnow = baseKnowledge(ix, profile, q, family);
    if (practice) pKnow += (1 - pKnow) * cfg.practiceBoost;
    const known = draw < pKnow;
    const strong = draw < pKnow * cfg.strongFraction;
    const correct = q.options.find((o) => o.correct) as Option;

    let chosen: Option | null;
    let latency: number;
    const visualOpt = q.options.find((o) => o.source === 'visual');
    if (profile === 'visual_confuser' && visualOpt && !strong && rng() < (practice ? cfg.practiceConfuseRate : cfg.confuseRate)) {
      chosen = visualOpt;
      latency = between(rng, 2000, 5000);
    } else if (known) {
      const slip = profile === 'strong_beginner' ? cfg.strongBeginnerSlip : cfg.slip;
      chosen = rng() < slip ? (randomWrong(q, rng) ?? correct) : correct;
      latency = between(rng, 1500, 4000);
    } else {
      const swap = q.options.find((o) => o.source === 'other_reading_kind');
      if (profile === 'kun_struggler' && q.type === 'reading_kun' && swap && rng() < cfg.swapWhenWrong) {
        chosen = swap;
      } else if (rng() < cfg.dontKnowRate) {
        chosen = null;
      } else {
        chosen = q.options[Math.floor(rng() * q.options.length)];
      }
      latency = between(rng, 3000, 7000);
    }
    latency = Math.round(latency);
    t += latency + Math.round(between(rng, 400, 1200));
    return { questionId: q.id, optionId: chosen ? chosen.id : null, latencyMs: latency, answeredAt: t };
  });
}
