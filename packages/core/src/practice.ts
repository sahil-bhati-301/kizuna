// Targeted practice sets: one block per top pattern, warm-ups first, checks last.
// Every item carries a reason the UI shows as "Why this?".
import type { ContentSet, KanjiId } from '@kizuna/content';
import type {
  Analysis,
  DrillTemplate,
  LearnerModel,
  Pattern,
  PracticeBlock,
  PracticeItem,
  PracticeSet,
  QuestionType,
  ReasonCode,
} from './contracts';
import { type ContentIndex, componentGlyph, componentKeyword, getIndex, uniq } from './contentIndex';
import { type QuestionSpec, canAsk, usableWords } from './distractors';
import { buildQuestion } from './questions';
import { rngFor } from './rng';
import { FACET_LABEL, FACET_OF } from './tags';
import { listAnd, times } from './text';

export const PRACTICE_CONFIG = {
  size: 20,
  maxPatternBlocks: 3,
  warmups: 2,
  checks: 2,
  secondsPerItem: 8,
  minBlockItems: 3,
};

interface PlannedItem {
  spec: QuestionSpec;
  reason: PracticeItem['reason'];
}

interface PlannedBlock {
  title: string;
  description: string;
  template: DrillTemplate;
  patternId?: string;
  /** Candidate items in drill order; taken from the front, cycling if needed. */
  candidates: PlannedItem[];
  keepOrder: boolean;
}

const REASON = (code: ReasonCode, text: string, patternId?: string): PracticeItem['reason'] =>
  patternId ? { code, patternId, text } : { code, text };

function viable(ix: ContentIndex, s: QuestionSpec): boolean {
  if (s.type === 'word_reading') return !!s.wordId;
  return canAsk(ix, s.type, s.kanji);
}

function contrastBlock(ix: ContentIndex, p: Pattern): PlannedBlock {
  const pairs =
    p.visual.kind === 'confusion_pair'
      ? p.visual.pairs
      : [{ a: p.kanji[0], b: p.kanji[1] ?? p.kanji[0], aAsB: 0, bAsA: 0 }];
  const perPair = pairs.map((pr) => {
    const [x, y, c] = pr.aAsB >= pr.bAsA ? [pr.a, pr.b, pr.aAsB] : [pr.b, pr.a, pr.bAsA];
    const text =
      c > 0
        ? `You chose ${y} for ${x} ${times(c)}, so you'll practise them side by side.`
        : `${x} and ${y} are easy to mix up, so you'll practise them side by side.`;
    const types: QuestionType[] = ['recognition', 'recognition', 'meaning', 'meaning', 'reading_on', 'reading_on', 'reading_kun', 'reading_kun'];
    const items: PlannedItem[] = [];
    types.forEach((type, i) => {
      const [k, partner] = i % 2 === 0 ? [x, y] : [y, x];
      const spec: QuestionSpec = { type, kanji: k, partner };
      if (viable(ix, spec)) items.push({ spec, reason: REASON('FOCUS', text, p.id) });
    });
    return items;
  });
  // Interleave pairs of a cluster, two items (one A, one B) at a time.
  const candidates: PlannedItem[] = [];
  const max = Math.max(...perPair.map((x) => x.length));
  for (let i = 0; i < max; i += 2) for (const list of perPair) candidates.push(...list.slice(i, i + 2));
  return {
    title: p.title,
    description: p.recommendation.description,
    template: 'contrast_pair',
    patternId: p.id,
    candidates,
    keepOrder: true,
  };
}

function familyBlock(ix: ContentIndex, p: Pattern): PlannedBlock {
  const comp = p.groupKey.replace(/^(component|radical):/, '');
  const glyph = componentGlyph(ix, comp);
  const kw = componentKeyword(ix, comp);
  const members = uniq([...p.kanji, ...(ix.families.get(comp) ?? [])]).slice(0, 6);
  const cue = `Contains ${glyph} (${kw})`;
  const stat = `${p.evidence.n - Math.round(p.evidence.observed * p.evidence.n)} of ${p.evidence.n} missed`;
  const types: QuestionType[] = ['meaning', 'reading_on', 'reading_kun'];
  const candidates: PlannedItem[] = [];
  for (const type of types) {
    for (const k of members) {
      const spec: QuestionSpec = { type, kanji: k, cue };
      if (!viable(ix, spec)) continue;
      candidates.push({
        spec,
        reason: REASON('FOCUS', `${k} belongs to the ${glyph} (${kw}) family, where you had ${stat}. The cue helps you link them.`, p.id),
      });
    }
  }
  return {
    title: p.title,
    description: p.recommendation.description,
    template: 'family_drill',
    patternId: p.id,
    candidates,
    keepOrder: false,
  };
}

function readingBlock(ix: ContentIndex, p: Pattern): PlannedBlock {
  const kind = p.groupKey.endsWith(':kun') ? 'kun' : 'on';
  const label = kind === 'kun' ? "kun'yomi" : "on'yomi";
  const order: QuestionType[] = kind === 'kun' ? ['reading_kun', 'reading_on'] : ['reading_on', 'reading_kun'];
  const right = Math.round(p.evidence.observed * p.evidence.n);
  // The affected kanji first; other kanji with both readings only if that is too few to drill.
  const both = ix.ordered.map((k) => k.id).filter((k) => canAsk(ix, 'reading_on', k) && canAsk(ix, 'reading_kun', k));
  const affected = p.kanji.filter((k) => canAsk(ix, order[0], k));
  const kanji = affected.length >= 4 ? affected : uniq([...affected, ...both]).slice(0, 4);
  const candidates: PlannedItem[] = [];
  for (const k of kanji) {
    if (!canAsk(ix, order[0], k)) continue;
    for (const type of order) {
      const spec: QuestionSpec = { type, kanji: k };
      if (!viable(ix, spec)) continue;
      const text =
        type === order[0]
          ? `${label[0].toUpperCase()}${label.slice(1)} was your weak spot (${right} of ${p.evidence.n} right), so ${k} is asked that way first.`
          : `Now the other reading of ${k}, so you can feel the difference between on and kun.`;
      candidates.push({ spec, reason: REASON('FOCUS', text, p.id) });
    }
  }
  return {
    title: p.title,
    description: p.recommendation.description,
    template: 'reading_focus',
    patternId: p.id,
    candidates,
    keepOrder: true,
  };
}

function contextBlock(ix: ContentIndex, p: Pattern, testWords: Set<string>): PlannedBlock {
  const candidates: PlannedItem[] = [];
  const perKanji = p.kanji.map((k) => {
    const words = usableWords(ix, k);
    const fresh = words.filter((w) => !testWords.has(w));
    const used = words.filter((w) => testWords.has(w));
    return [...fresh, ...used].map((w) => ({ k, w, isNew: !testWords.has(w) }));
  });
  const max = Math.max(0, ...perKanji.map((x) => x.length));
  const seen = new Set<string>();
  for (let i = 0; i < max; i++) {
    for (const list of perKanji) {
      const e = list[i];
      if (!e || seen.has(e.w)) continue;
      seen.add(e.w);
      const text = e.isNew
        ? `You know ${e.k} on its own but misread it in words; ${e.w} is a new word with it.`
        : `You know ${e.k} on its own but misread it in words; here is ${e.w} again.`;
      candidates.push({ spec: { type: 'word_reading', kanji: e.k, wordId: e.w }, reason: REASON('FOCUS', text, p.id) });
    }
  }
  return {
    title: p.title,
    description: p.recommendation.description,
    template: 'context_words',
    patternId: p.id,
    candidates,
    keepOrder: false,
  };
}

function weakBlock(ix: ContentIndex, kanji: KanjiId[], why: Map<KanjiId, string>, title: string, patternId?: string, code: ReasonCode = 'WEAK'): PlannedBlock {
  const types: QuestionType[] = ['meaning', 'recognition', 'reading_on', 'reading_kun', 'word_reading'];
  const candidates: PlannedItem[] = [];
  for (const type of types) {
    for (const k of kanji) {
      const spec: QuestionSpec = { type, kanji: k };
      if (type === 'word_reading') {
        const w = usableWords(ix, k)[0];
        if (!w) continue;
        spec.wordId = w;
      }
      if (!viable(ix, spec)) continue;
      candidates.push({
        spec,
        reason: REASON(code, `${why.get(k) ?? `${k} needs work`}, so we go over every side of it: ${FACET_LABEL[FACET_OF[type]].toLowerCase()} now.`, patternId),
      });
    }
  }
  return {
    title,
    description: `Every side of ${listAnd(kanji)}: meaning, recognition, readings and a word.`,
    template: 'weak_kanji_review',
    patternId,
    candidates,
    keepOrder: false,
  };
}

/** Reorder so the same kanji never appears twice in a row (where possible). */
function spread(items: PlannedItem[], prev: KanjiId | null): PlannedItem[] {
  const rest = items.slice();
  const out: PlannedItem[] = [];
  let last = prev;
  while (rest.length) {
    let i = rest.findIndex((x) => x.spec.kanji !== last);
    if (i < 0) i = 0;
    const [x] = rest.splice(i, 1);
    out.push(x);
    last = x.spec.kanji;
  }
  return out;
}

function take(block: PlannedBlock, n: number): PlannedItem[] {
  if (block.candidates.length === 0 || n <= 0) return [];
  const out: PlannedItem[] = [];
  for (let i = 0; out.length < n && i < n * 3; i++) out.push(block.candidates[i % block.candidates.length]);
  return out;
}

export function createPracticeSet(
  analysis: Analysis,
  model: LearnerModel,
  content: ContentSet,
  opts?: { seed?: number; size?: number; now?: number },
): PracticeSet {
  const cfg = PRACTICE_CONFIG;
  const ix = getIndex(content);
  const seed = opts?.seed ?? 1;
  const size = Math.max(3, Math.round(opts?.size ?? cfg.size));
  const now = opts?.now ?? analysis.generatedAt;
  const testWords = new Set(model.answers.filter((a) => a.question.wordId).map((a) => a.question.wordId as string));

  const top = analysis.patterns.slice(0, cfg.maxPatternBlocks);
  const blocks: PlannedBlock[] = [];
  for (const p of top) {
    if (p.type === 'visual_confusion' || p.type === 'semantic_confusion') blocks.push(contrastBlock(ix, p));
    else if (p.type === 'component_family') blocks.push(familyBlock(ix, p));
    else if (p.type === 'reading_kind') blocks.push(readingBlock(ix, p));
    else if (p.type === 'context_gap') blocks.push(contextBlock(ix, p, testWords));
    else blocks.push(weakBlock(ix, p.kanji, new Map([[p.kanji[0], p.reason.split('.')[0]]]), p.title, p.id, 'FOCUS'));
  }
  const inBlocks = new Set(top.flatMap((p) => p.kanji));
  const weakLeft = analysis.weakKanji.filter((w) => !inBlocks.has(w.kanji)).slice(0, 3);
  if (blocks.length < cfg.maxPatternBlocks && weakLeft.length) {
    const why = new Map(weakLeft.map((w) => [w.kanji, w.reasons[0]?.replace(/\.$/, '') ?? `${w.kanji} is weak`]));
    blocks.push(weakBlock(ix, weakLeft.map((w) => w.kanji), why, `Weak kanji: ${listAnd(weakLeft.map((w) => w.kanji))}`));
  }
  if (blocks.length === 0) {
    // General review of the lowest-mastery kanji.
    const tested = analysis.kanjiMap.filter((m) => m.overall.n > 0).sort((a, b) => a.overall.mean - b.overall.mean);
    const pool = (tested.length ? tested : analysis.kanjiMap).slice(0, 4).map((m) => m.kanji);
    const fallback = pool.length ? pool : ix.ordered.slice(0, 4).map((k) => k.id);
    const why = new Map(fallback.map((k) => [k, `${k} is among your least certain kanji`]));
    blocks.push(weakBlock(ix, fallback, why, 'General review'));
  }

  const focusKanji = new Set(blocks.flatMap((b) => b.candidates.map((c) => c.spec.kanji)));
  const known = analysis.kanjiMap
    .filter((m) => m.overall.n > 0 && !focusKanji.has(m.kanji) && (m.stage === 'solid' || m.stage === 'learning'))
    .sort((a, b) => b.overall.mean - a.overall.mean || b.overall.n - a.overall.n);
  const warmKanji = (known.length ? known.map((m) => m.kanji) : ix.ordered.map((k) => k.id).filter((k) => !focusKanji.has(k))).slice(0, cfg.warmups);
  const warmups: PlannedItem[] = warmKanji.map((k) => ({
    spec: { type: 'meaning', kanji: k },
    reason: REASON('WARMUP', `A quick warm-up with ${k}, which you already know well.`),
  }));

  const checks: PlannedItem[] = [];
  const checkKanji = new Set<KanjiId>();
  for (const p of top.slice(0, cfg.checks)) {
    const k = p.kanji.find((x) => !checkKanji.has(x));
    if (!k) continue;
    checkKanji.add(k);
    const partner = p.kanji.find((x) => x !== k);
    const type: QuestionType =
      p.type === 'reading_kind'
        ? p.groupKey.endsWith(':kun') ? 'reading_kun' : 'reading_on'
        : p.type === 'context_gap'
          ? 'word_reading'
          : 'recognition';
    const spec: QuestionSpec = { type, kanji: k };
    if (type === 'recognition' && partner && (p.type === 'visual_confusion' || p.type === 'semantic_confusion')) spec.partner = partner;
    if (type === 'word_reading') {
      const w = usableWords(ix, k).find((x) => !testWords.has(x)) ?? usableWords(ix, k)[0];
      if (!w) continue;
      spec.wordId = w;
    }
    if (!viable(ix, spec)) continue;
    checks.push({ spec, reason: REASON('CHECK', `A final check on ${k}: did the practice on "${p.title}" stick?`, p.id) });
  }

  // Budget per block.
  const budget = Math.max(blocks.length * 1, size - warmups.length - checks.length);
  const share = blocks.map(() => Math.floor(budget / blocks.length));
  for (let i = 0; i < budget - share.reduce((a, b) => a + b, 0); i++) share[i % share.length]++;
  const chosen = blocks.map((b, i) => take(b, share[i]));
  // Give unused budget (blocks that ran dry) to the first blocks that still have candidates.
  let spare = budget - chosen.reduce((a, c) => a + c.length, 0);
  for (let i = 0; spare > 0 && i < blocks.length; i++) {
    const extra = take(blocks[i], chosen[i].length + spare).slice(chosen[i].length);
    chosen[i].push(...extra);
    spare -= extra.length;
  }

  // Sequence: warm-ups, blocks, checks; no kanji twice in a row outside contrast blocks.
  const sequence: Array<{ item: PlannedItem; block: number | null }> = [];
  let last: KanjiId | null = null;
  const pushAll = (items: PlannedItem[], block: number | null, keepOrder: boolean) => {
    const ordered = keepOrder ? rotateAway(items, last) : spread(items, last);
    for (const item of ordered) sequence.push({ item, block });
    if (ordered.length) last = ordered[ordered.length - 1].spec.kanji;
  };
  pushAll(warmups, null, false);
  chosen.forEach((items, i) => pushAll(items, i, blocks[i].keepOrder));
  pushAll(checks, null, false);

  repairAdjacency(sequence, (b) => b !== null && blocks[b].template === 'contrast_pair');

  const items: PracticeItem[] = [];
  const blockIds: string[][] = blocks.map(() => []);
  sequence.forEach(({ item, block }, i) => {
    const id = `p-${seed}-${i}`;
    const q = buildQuestion(ix, item.spec, id, rngFor(seed, 'p', i, item.spec.type, item.spec.kanji));
    if (!q) return;
    items.push({ question: q, reason: item.reason });
    if (block !== null) blockIds[block].push(id);
  });

  const practiceBlocks: PracticeBlock[] = blocks
    .map((b, i) => {
      const out: PracticeBlock = { id: `p-${seed}-block-${i}`, title: b.title, description: b.description, template: b.template, itemIds: blockIds[i] };
      if (b.patternId) out.patternId = b.patternId;
      return out;
    })
    .filter((b) => b.itemIds.length > 0);

  return {
    id: `p-${seed}-${analysis.generatedAt}`,
    createdAt: now,
    title: top.length ? `Practice: ${top[0].title}${top.length > 1 ? ' and more' : ''}` : 'General review',
    blocks: practiceBlocks,
    items,
    estimatedMinutes: Math.round(((items.length * cfg.secondsPerItem) / 60) * 10) / 10,
  };
}

type Slot = { item: PlannedItem; block: number | null };

/**
 * Remove remaining "same kanji twice in a row" spots (outside contrast blocks) by swapping
 * items within the same segment (same block, or the same warm-up / check group).
 */
function repairAdjacency(seq: Slot[], isContrast: (b: number | null) => boolean): void {
  const seg = (s: Slot) => `${s.block}|${s.item.reason.code}`;
  const k = (i: number) => (i >= 0 && i < seq.length ? seq[i].item.spec.kanji : null);
  const bad = (i: number) =>
    i > 0 && i < seq.length && k(i) === k(i - 1) && !(isContrast(seq[i].block) && isContrast(seq[i - 1].block));
  const conflicts = () => seq.reduce((a, _s, i) => a + (bad(i) ? 1 : 0), 0);
  for (let i = 1; i < seq.length; i++) {
    if (!bad(i)) continue;
    let fixed = false;
    for (const pos of [i, i - 1]) {
      if (isContrast(seq[pos].block)) continue;
      for (let j = 0; j < seq.length && !fixed; j++) {
        if (j === pos || seg(seq[j]) !== seg(seq[pos])) continue;
        const before = conflicts();
        [seq[pos], seq[j]] = [seq[j], seq[pos]];
        if (conflicts() < before) fixed = true;
        else [seq[pos], seq[j]] = [seq[j], seq[pos]];
      }
      if (fixed) break;
    }
  }
}

/** For ordered blocks: if the first item repeats the previous kanji, start from the next one. */
function rotateAway(items: PlannedItem[], prev: KanjiId | null): PlannedItem[] {
  if (!items.length || items[0].spec.kanji !== prev) return items;
  const i = items.findIndex((x) => x.spec.kanji !== prev);
  return i <= 0 ? items : [...items.slice(i), ...items.slice(0, i)];
}
