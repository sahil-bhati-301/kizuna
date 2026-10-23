import { Fragment, type ReactNode } from 'react';

// Kana, CJK ideographs (incl. extension A/B+), CJK radicals and strokes, Japanese punctuation, half-width katakana.
const JA_RUN =
  /[⺀-⿟　-〿぀-ヿ㇀-㇯ㇰ-ㇿ㐀-䶿一-鿿豈-﫿ｦ-ﾟ\u{20000}-\u{3134f}]+/gu;
const HAS_JA = /[⺀-⿟぀-ヿ㇀-ㇿ㐀-䶿一-鿿豈-﫿ｦ-ﾟ\u{20000}-\u{3134f}]/u;

export function hasJapanese(text: string | null | undefined): boolean {
  return !!text && HAS_JA.test(text);
}

/** Renders mixed English/Japanese text, wrapping every Japanese run in <span lang="ja">. */
export function Auto({ text }: { text: string | null | undefined }): ReactNode {
  if (!text) return null;
  if (!hasJapanese(text)) return text;
  const out: ReactNode[] = [];
  let last = 0;
  for (const m of text.matchAll(JA_RUN)) {
    const i = m.index ?? 0;
    if (i > last) out.push(<Fragment key={`t${last}`}>{text.slice(last, i)}</Fragment>);
    out.push(
      <span lang="ja" key={`j${i}`}>
        {m[0]}
      </span>,
    );
    last = i + m[0].length;
  }
  if (last < text.length) out.push(<Fragment key={`t${last}`}>{text.slice(last)}</Fragment>);
  return <>{out}</>;
}

/** A Japanese span (kanji, kana, words). */
export function Ja({ children, className, serif }: { children: ReactNode; className?: string; serif?: boolean }) {
  return (
    <span lang="ja" className={[serif ? 'ja-serif' : 'ja', className].filter(Boolean).join(' ')}>
      {children}
    </span>
  );
}
