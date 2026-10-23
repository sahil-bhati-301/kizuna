import type { VisualSpec } from '@kizuna/core';
import { ConfusionPair } from './ConfusionPair';
import { FacetCompare } from './FacetCompare';
import { GroupBars } from './GroupBars';
import { KanjiStrip } from './KanjiStrip';

/** Renders one VisualSpec. Unknown kinds render nothing rather than crash. */
export function Visual({ spec }: { spec: VisualSpec | undefined | null }) {
  if (!spec) return null;
  switch (spec.kind) {
    case 'group_bars':
      return <GroupBars spec={spec} />;
    case 'confusion_pair':
      return <ConfusionPair spec={spec} />;
    case 'facet_compare':
      return <FacetCompare spec={spec} />;
    case 'kanji_strip':
      return <KanjiStrip spec={spec} />;
    default:
      return null;
  }
}
