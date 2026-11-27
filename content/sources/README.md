# Committed source files

Compressed upstream files, pinned by checksum in `../sources.lock.yaml` and committed so that
cloud sessions and CI need no network. Fetch or verify with `pnpm --filter @kizuna/pipeline sources:fetch`.

## Attribution and licence

- `kanjidic2.xml.gz`: KANJIDIC2. `kradfile.gz`: KRADFILE. `JMdict.gz`: JMdict (all languages, file dated 2026-11-27).
- Copyright the Electronic Dictionary Research and Development Group (EDRDG), <https://www.edrdg.org/>.
- Licence: Creative Commons Attribution-ShareAlike 4.0, <https://creativecommons.org/licenses/by-sa/4.0/>.
  See <https://www.edrdg.org/edrdg/licence.html>. Derived data stays share-alike.
- EDRDG files are stored unmodified, as downloaded.
- `pin` writes `fetched` and `sha256` into the lock; `version` is set by hand.

## KanjiVG

- `kanjivg.xml.gz`: KanjiVG, Copyright (C) 2009-2013 Ulrich Apel, <http://kanjivg.tagaini.net>
  (repository <https://github.com/KanjiVG/kanjivg>).
- Licence: Creative Commons Attribution-ShareAlike 3.0, <https://creativecommons.org/licenses/by-sa/3.0/>.
  Derived data stays share-alike.
- Built from commit `9d7220dfca09107dca2e0b0e45f90f696185e3c3` (2026-11-18) with
  `pnpm --filter @kizuna/pipeline kanjivg:bundle <clone>`, because the release files cannot be
  downloaded from the session (W02 Q-G). Same content as the upstream release file `kanjivg.xml`:
  the 6,984 base files `kanji/XXXXX.svg` (variant files such as `-Kaisho` are left out), sliced as
  `kvg.py release()` does, unmodified. Only the generated-on date line of the header is replaced by
  the commit. Pinned under `bundled:` in the lock; `sources:fetch` does not download it.
