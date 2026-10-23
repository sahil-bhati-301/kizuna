import type { VisualSpec } from '@kizuna/core';
import { Auto, Ja } from '../components/Ja';

type Spec = Extract<VisualSpec, { kind: 'confusion_pair' }>;
type Pair = Spec['pairs'][number];

export function ConfusionPair({ spec }: { spec: Spec }) {
  return (
    <figure className="viz viz-confusion">
      <figcaption className="viz-title">
        <Auto text={spec.title} />
      </figcaption>
      <div className="viz-body">
        {spec.pairs.map((p) => (
          <PairView key={`${p.a}/${p.b}`} pair={p} />
        ))}
      </div>
    </figure>
  );
}

function Arrow({ from, to, count, dir }: { from: string; to: string; count: number; dir: 'right' | 'left' }) {
  return (
    <div className={`cp-arrow cp-arrow--${dir} ${count === 0 ? 'is-zero' : ''}`}>
      <span className="cp-arrow-text">
        asked <Ja serif>{from}</Ja> → chose <Ja serif>{to}</Ja> <strong>×{count}</strong>
      </span>
      <span className="cp-line" aria-hidden="true" />
    </div>
  );
}

function Chips({ glyphs, kind, owner }: { glyphs: string[]; kind: 'shared' | 'diff'; owner?: string }) {
  if (!glyphs.length) return null;
  return (
    <>
      {glyphs.map((g) => (
        <span key={`${kind}-${owner ?? ''}-${g}`} className={`chip chip--${kind}`}>
          <Ja serif>{g}</Ja>
          {owner && (
            <span className="chip-owner">
              {' '}
              in <Ja>{owner}</Ja>
            </span>
          )}
        </span>
      ))}
    </>
  );
}

function PairView({ pair }: { pair: Pair }) {
  const hasDiff = pair.onlyA.length > 0 || pair.onlyB.length > 0;
  return (
    <div className="cp">
      <p className="sr-only">
        When asked {pair.a} you chose {pair.b} {pair.aAsB} times; when asked {pair.b} you chose {pair.a} {pair.bAsA} times, out of{' '}
        {pair.opportunities} chances.
      </p>
      <div className="cp-row">
        <div className="cp-tile" aria-hidden="true">
          <Ja serif>{pair.a}</Ja>
        </div>
        <div className="cp-arrows" aria-hidden="true">
          <Arrow from={pair.a} to={pair.b} count={pair.aAsB} dir="right" />
          <Arrow from={pair.b} to={pair.a} count={pair.bAsA} dir="left" />
        </div>
        <div className="cp-tile" aria-hidden="true">
          <Ja serif>{pair.b}</Ja>
        </div>
      </div>
      <p className="cp-opps muted">
        {pair.aAsB + pair.bAsA} mix-up{pair.aAsB + pair.bAsA === 1 ? '' : 's'} out of {pair.opportunities} chance
        {pair.opportunities === 1 ? '' : 's'}
      </p>
      {(pair.shared.length > 0 || hasDiff) && (
        <div className="cp-parts">
          {pair.shared.length > 0 && (
            <div className="cp-part-row">
              <span className="cp-part-label">Shared parts</span>
              <Chips glyphs={pair.shared} kind="shared" />
            </div>
          )}
          {hasDiff && (
            <div className="cp-part-row">
              <span className="cp-part-label cp-part-label--diff">The difference</span>
              <Chips glyphs={pair.onlyA} kind="diff" owner={pair.a} />
              <Chips glyphs={pair.onlyB} kind="diff" owner={pair.b} />
            </div>
          )}
        </div>
      )}
      {pair.note && (
        <p className="cp-note">
          <Auto text={pair.note} />
        </p>
      )}
    </div>
  );
}
