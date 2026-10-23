// Before / after comparison of two analyses, matched on Pattern.id.
import type { Analysis, AnalysisComparison } from '../contracts';

/** deltaPp must move by at least this many points to count as improved or worse. */
export const COMPARE_MIN_CHANGE_PP = 5;

export function compareAnalyses(before: Analysis, after: Analysis): AnalysisComparison {
  const afterById = new Map(after.patterns.map((p) => [p.id, p]));
  const beforeIds = new Set(before.patterns.map((p) => p.id));
  const patterns: AnalysisComparison['patterns'] = [];
  for (const b of before.patterns) {
    const a = afterById.get(b.id);
    let status: AnalysisComparison['patterns'][number]['status'];
    if (!a) status = 'resolved';
    else if (a.evidence.deltaPp - b.evidence.deltaPp >= COMPARE_MIN_CHANGE_PP) status = 'improved';
    else if (b.evidence.deltaPp - a.evidence.deltaPp >= COMPARE_MIN_CHANGE_PP) status = 'worse';
    else status = 'unchanged';
    patterns.push({ patternId: b.id, title: b.title, before: b.evidence, after: a ? a.evidence : null, status });
  }
  for (const a of after.patterns) {
    if (beforeIds.has(a.id)) continue;
    patterns.push({ patternId: a.id, title: a.title, before: null, after: a.evidence, status: 'new' });
  }
  return { accuracyBefore: before.accuracy, accuracyAfter: after.accuracy, patterns };
}
