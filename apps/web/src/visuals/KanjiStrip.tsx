import type { VisualSpec } from '@kizuna/core';
import { stageLabel } from '../app/format';
import { Auto, Ja } from '../components/Ja';

type Spec = Extract<VisualSpec, { kind: 'kanji_strip' }>;

const MAX_DOTS = 6;

function Dots({ count, kind }: { count: number; kind: 'ok' | 'bad' }) {
  const shown = Math.min(count, MAX_DOTS);
  return (
    <span className={`ks-dots ks-dots--${kind}`}>
      {Array.from({ length: shown }, (_, i) => (
        <i key={i} className="ks-dot" />
      ))}
      {count > MAX_DOTS && <span className="ks-more">+{count - MAX_DOTS}</span>}
    </span>
  );
}

export function KanjiStrip({ spec }: { spec: Spec }) {
  return (
    <figure className="viz viz-strip">
      <figcaption className="viz-title">
        <Auto text={spec.title} />
      </figcaption>
      <ul className="ks">
        {spec.cells.map((c) => (
          <li key={c.kanji} className={`ks-cell stage--${c.stage}`}>
            <Ja serif className="ks-kanji">
              {c.kanji}
            </Ja>
            <span className="ks-counts" aria-hidden="true">
              <Dots count={c.correct} kind="ok" />
              <Dots count={c.wrong} kind="bad" />
            </span>
            <span className="ks-stage">{stageLabel(c.stage)}</span>
            <span className="sr-only">
              : {c.correct} right, {c.wrong} wrong
            </span>
          </li>
        ))}
      </ul>
      <div className="meter-legend" aria-hidden="true">
        <span>
          <i className="lg-dot lg-dot--ok" /> Right
        </span>
        <span>
          <i className="lg-dot lg-dot--bad" /> Wrong
        </span>
      </div>
    </figure>
  );
}
