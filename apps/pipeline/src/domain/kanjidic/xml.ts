/**
 * A minimal incremental XML tokenizer, enough for KANJIDIC2 (W01-3 AC 1).
 * Text arrives in chunks split at any point; tokens are emitted only once complete, so the
 * token stream does not depend on chunk boundaries. Comments, processing instructions and the
 * DOCTYPE (with its internal DTD subset) are skipped. Pure: no I/O.
 */

export type XmlToken =
  | { type: 'open'; name: string; attrs: Readonly<Record<string, string>>; selfClosing: boolean }
  | { type: 'close'; name: string }
  | { type: 'text'; text: string };

export class XmlSyntaxError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'XmlSyntaxError';
  }
}

const ENTITIES: Readonly<Record<string, string>> = {
  amp: '&',
  lt: '<',
  gt: '>',
  quot: '"',
  apos: "'",
};

/** Decodes the predefined XML entities and numeric character references. */
export function decodeEntities(s: string): string {
  if (!s.includes('&')) return s;
  return s.replace(/&(#x[0-9a-fA-F]+|#[0-9]+|[a-zA-Z]+);/gu, (whole, ref: string) => {
    if (ref.startsWith('#x')) return String.fromCodePoint(Number.parseInt(ref.slice(2), 16));
    if (ref.startsWith('#')) return String.fromCodePoint(Number.parseInt(ref.slice(1), 10));
    const named = ENTITIES[ref];
    if (named === undefined) throw new XmlSyntaxError(`Unknown entity ${whole}`);
    return named;
  });
}

const ATTR = /([A-Za-z_][\w.:-]*)\s*=\s*(?:"([^"]*)"|'([^']*)')/gu;

function parseTag(body: string): XmlToken {
  if (body.startsWith('/')) return { type: 'close', name: body.slice(1).trim() };
  const selfClosing = body.endsWith('/');
  const inner = selfClosing ? body.slice(0, -1) : body;
  const nameMatch = /^[^\s/>]+/u.exec(inner);
  if (!nameMatch) throw new XmlSyntaxError(`Malformed tag <${body}>`);
  const attrs: Record<string, string> = {};
  for (const m of inner.slice(nameMatch[0].length).matchAll(ATTR)) {
    attrs[m[1] as string] = decodeEntities(m[2] ?? m[3] ?? '');
  }
  return { type: 'open', name: nameMatch[0], attrs, selfClosing };
}

/** Index just past the end of a DOCTYPE starting at `start`, or -1 if it is not complete yet. */
function doctypeEnd(buf: string, start: number): number {
  let depth = 0;
  let i = start + '<!DOCTYPE'.length;
  while (i < buf.length) {
    if (buf.startsWith('<!--', i)) {
      const end = buf.indexOf('-->', i + 4);
      if (end === -1) return -1;
      i = end + 3;
      continue;
    }
    const ch = buf[i];
    if (ch === '"' || ch === "'") {
      const end = buf.indexOf(ch, i + 1);
      if (end === -1) return -1;
      i = end + 1;
      continue;
    }
    if (ch === '[') depth++;
    else if (ch === ']') depth--;
    else if (ch === '>' && depth === 0) return i + 1;
    i++;
  }
  return -1;
}

/** Index just past the `>` closing a tag that starts at `start`, honouring quoted values. */
function tagEnd(buf: string, start: number): number {
  let quote: string | undefined;
  for (let i = start + 1; i < buf.length; i++) {
    const ch = buf[i];
    if (quote !== undefined) {
      if (ch === quote) quote = undefined;
    } else if (ch === '"' || ch === "'") quote = ch;
    else if (ch === '>') return i + 1;
  }
  return -1;
}

const LONGEST_PREFIX = '<![CDATA['.length;

/** Incremental tokenizer: push chunks, then call end(). */
export class XmlTokenizer {
  private buf = '';

  /** Adds a chunk and returns every token that is now complete. */
  push(chunk: string): XmlToken[] {
    this.buf += chunk;
    return this.drain(false);
  }

  /** Flushes the rest; throws if the input stops inside markup. */
  end(): XmlToken[] {
    const tokens = this.drain(true);
    if (this.buf.trim() !== '') throw new XmlSyntaxError('Unexpected end of XML input');
    return tokens;
  }

  private drain(final: boolean): XmlToken[] {
    const out: XmlToken[] = [];
    const buf = this.buf;
    let i = 0;
    while (i < buf.length) {
      if (buf[i] !== '<') {
        const lt = buf.indexOf('<', i);
        if (lt === -1 && !final) break;
        const stop = lt === -1 ? buf.length : lt;
        out.push({ type: 'text', text: decodeEntities(buf.slice(i, stop)) });
        i = stop;
        continue;
      }
      if (!final && buf.length - i < LONGEST_PREFIX) break;
      let next: number;
      if (buf.startsWith('<!--', i)) {
        const end = buf.indexOf('-->', i + 4);
        next = end === -1 ? -1 : end + 3;
      } else if (buf.startsWith('<![CDATA[', i)) {
        const end = buf.indexOf(']]>', i + 9);
        if (end !== -1) out.push({ type: 'text', text: buf.slice(i + 9, end) });
        next = end === -1 ? -1 : end + 3;
      } else if (buf.startsWith('<?', i)) {
        const end = buf.indexOf('?>', i + 2);
        next = end === -1 ? -1 : end + 2;
      } else if (buf.startsWith('<!DOCTYPE', i)) {
        next = doctypeEnd(buf, i);
      } else {
        next = tagEnd(buf, i);
        if (next !== -1) out.push(parseTag(buf.slice(i + 1, next - 1)));
      }
      if (next === -1) {
        if (final) throw new XmlSyntaxError('Unexpected end of XML input inside markup');
        break;
      }
      i = next;
    }
    this.buf = buf.slice(i);
    return out;
  }
}
