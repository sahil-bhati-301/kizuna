/** Public API of the cross-checks (W02-5). */
export { CHECKS, canonical, checkDecomposition, checkStrokes } from './check.ts';
export type {
  Check,
  CrosscheckInput,
  KanjiInfo,
  ReviewItem,
  VgComponent,
  VgInfo,
} from './check.ts';
export { buildQueue, queueDocument, summaryLines } from './queue.ts';
export type { Decision, Queue, QueueSummary } from './queue.ts';
export { parseUnihanStrokes } from './unihan.ts';
