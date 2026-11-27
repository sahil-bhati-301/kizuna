/**
 * KanjiVG release bundle (W02-1, W02 Q-G answer a): the session cannot download GitHub release
 * files, so the bundle is built from a pinned clone. Same selection and slicing as upstream
 * `kvg.py release()`: only the base files `kanji/XXXXX.svg` (no `-Kaisho`, `-VtLst`, ... variants),
 * sorted by file name; per file, the content of <g id="kvg:StrokePaths_XXXXX"> wrapped in
 * <kanji id="kvg:kanji_XXXXX">; one licence header. The generated-on date is replaced by the commit,
 * and the gzip header has no name, mtime 0 and OS 255, so a rerun gives the same bytes
 * with the same zlib build (Node version); another zlib may compress the same XML differently.
 */
import { gzipSync } from 'node:zlib';

/** Upstream licence header (kanjivg.py `licenseString`), unchanged. */
export const KANJIVG_LICENCE = `Copyright (C) 2009-2013 Ulrich Apel.
This work is distributed under the conditions of the Creative Commons
Attribution-Share Alike 3.0 Licence. This means you are free:
* to Share - to copy, distribute and transmit the work
* to Remix - to adapt the work

Under the following conditions:
* Attribution. You must attribute the work by stating your use of KanjiVG in
  your own copyright header and linking to KanjiVG's website
  (http://kanjivg.tagaini.net)
* Share Alike. If you alter, transform, or build upon this work, you may
  distribute the resulting work only under the same or similar license to this
  one.

See http://creativecommons.org/licenses/by-sa/3.0/ for more details.`;

/** Base files only, as `kvg.py release()` selects them (`len(name) == 9`). */
export const KANJIVG_BASE_FILE = /^[0-9a-f]{5}\.svg$/u;

export class KanjivgBundleError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'KanjivgBundleError';
  }
}

const PATHS = '<g id="kvg:StrokePaths_';
const NUMBERS = '<g id="kvg:StrokeNumbers_';

/** One SVG → one `<kanji>` element, sliced exactly as `kvg.py release()` does. */
export function sliceKanjivgSvg(name: string, svg: string): string {
  let data = svg.replaceAll('\r\n', '\n');
  const svgAt = data.indexOf('<svg ');
  const pathsAt = data.indexOf(PATHS, svgAt);
  if (svgAt === -1 || pathsAt === -1) throw new KanjivgBundleError(`${name}: no StrokePaths group`);
  data = data.slice(pathsAt + PATHS.length);
  const id = data.slice(0, data.indexOf('"'));
  const from = data.indexOf('\n');
  const numbersAt = data.indexOf(NUMBERS);
  if (numbersAt === -1) throw new KanjivgBundleError(`${name}: no StrokeNumbers group`);
  if (data.slice(numbersAt - 5, numbersAt) !== '</g>\n')
    throw new KanjivgBundleError(
      `${name}: StrokePaths group does not end just before StrokeNumbers`,
    );
  return `<kanji id="kvg:kanji_${id}">${data.slice(from, numbersAt - 5)}</kanji>\n`;
}

export interface BundleMeta {
  readonly commit: string;
  /** Commit date, YYYY-MM-DD. */
  readonly date: string;
}

/** The release XML for base files given in any order (sorted here by file name). */
export function bundleKanjivg(
  files: readonly { readonly name: string; readonly svg: string }[],
  meta: BundleMeta,
): string {
  const base = files
    .filter((f) => KANJIVG_BASE_FILE.test(f.name))
    .sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0));
  const header =
    `<?xml version="1.0" encoding="UTF-8"?>\n<!--\n${KANJIVG_LICENCE}\n` +
    `This file was generated from KanjiVG commit ${meta.commit} (${meta.date}),\n` +
    `kanji/XXXXX.svg base files only (${base.length}), sliced as kvg.py release() does.\n-->\n` +
    `<kanjivg xmlns:kvg='http://kanjivg.tagaini.net'>\n`;
  return `${header}${base.map((f) => sliceKanjivgSvg(f.name, f.svg)).join('')}</kanjivg>\n`;
}

/** gzip with no file name, mtime 0 and OS byte 255 (unknown): the same bytes on every run. */
export function gzipReproducible(text: string): Uint8Array {
  const out = gzipSync(Buffer.from(text, 'utf8'), { level: 9 });
  out.writeUInt32LE(0, 4); // MTIME
  out[9] = 255; // OS: unknown, not the build platform
  return out;
}
