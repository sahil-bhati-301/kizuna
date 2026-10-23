# @kizuna/content

The N5 content set for the Kizuna demo: kanji, readings, visual components, words and kanji relations, typed by `src/types.ts`.

- **Hand-authored for the demo.** The data in `src/n5/` is made of linguistic facts (readings, stroke counts, radicals, word readings) written out by hand, plus our own keywords, component names and mnemonics. No commercial course material (Heisig/RTK, WaniKani, textbooks) was used.
- **The full product imports real sources.** Per `docs/architecture-design.md` §3, production content comes from EDRDG KANJIDIC2 and JMdict (CC BY-SA 4.0) and KanjiVG (CC BY-SA 3.0), with attribution and share-alike on the derived data.
- **JLPT levels are approximate and unofficial.** JLPT has published no official kanji or vocabulary lists since 2010; "N5" here follows common community lists.

## Layout

| File | Contents |
|---|---|
| `src/n5/kanji.ts` | Kanji in frequency order (rank = position). First `on` / `kun` entry is the primary reading. |
| `src/n5/components.ts` | Components used by `parts` and `radical`; `isKanji` is derived from the kanji set. |
| `src/n5/words.ts` | Words with per-kanji reading tokens: `on:がく` regular, `on:がく>がっ` sound change, `*きょ` special (jukujikun). |
| `src/n5/relations.ts` | Undirected visual and semantic kanji pairs. |
| `src/n5.test.ts` | Validation rules (IDs, reading format, alignment, families, relations). |

Run the checks from the repo root:

```sh
npx vitest run packages/content
npx tsc -p packages/content
```
