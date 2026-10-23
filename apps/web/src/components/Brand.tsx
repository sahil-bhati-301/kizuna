/** The Kizuna mark: 絆 on an indigo tile, tied with a vermilion thread. */
export function BrandMark({ size = 40 }: { size?: number }) {
  return (
    <svg className="brand-mark" viewBox="0 0 48 48" width={size} height={size} aria-hidden="true" focusable="false">
      <rect x="2" y="2" width="44" height="44" rx="12" fill="var(--indigo)" />
      <text
        x="24"
        y="32.5"
        textAnchor="middle"
        fontSize="24"
        fontFamily="'Noto Serif JP', serif"
        fontWeight="700"
        fill="var(--on-indigo)"
        lang="ja"
      >
        絆
      </text>
      <path
        d="M-2 38 C 10 34, 14 44, 24 40 C 32 37, 30 30, 36 32 C 42 34, 40 42, 50 40"
        fill="none"
        stroke="var(--thread)"
        strokeWidth="2.6"
        strokeLinecap="round"
      />
    </svg>
  );
}

export function Wordmark() {
  return (
    <span className="wordmark">
      <BrandMark size={34} />
      <span className="wordmark-text">
        Kizuna{' '}
        <span lang="ja" className="ja-serif wordmark-ja">
          絆
        </span>
      </span>
    </span>
  );
}

/** A red thread that loops into a loose knot. Decorative. */
export function ThreadKnot({ className }: { className?: string }) {
  return (
    <svg className={['thread-knot', className].filter(Boolean).join(' ')} viewBox="0 0 600 120" aria-hidden="true" focusable="false">
      <path
        className="thread-path"
        d="M0 78 C 90 70, 150 96, 230 74 C 290 58, 300 22, 268 20 C 236 18, 236 66, 286 76 C 340 88, 360 42, 330 40 C 300 38, 318 92, 400 84 C 470 78, 520 60, 600 66"
        fill="none"
        stroke="var(--thread)"
        strokeWidth="3"
        strokeLinecap="round"
        pathLength={1}
      />
    </svg>
  );
}
