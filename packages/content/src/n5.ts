// N5 dataset. Owned by the content role. Hand-authored for the demo; see ../README.md.
// The data lives in ./n5/ (kanji, components, words, relations).
import type { ContentSet } from './types';
import { components } from './n5/components';
import { kanji } from './n5/kanji';
import { relations } from './n5/relations';
import { words } from './n5/words';

export const n5: ContentSet = {
  version: '0.1.0',
  level: 'N5',
  kanji,
  components,
  words,
  relations,
};
