import type { KanjiId } from '@kizuna/content';
import type { KanjiMastery, KanjiStage } from '@kizuna/core';
import { STAGE_HINTS, STAGES, pct, stageLabel } from '../app/format';
import { Ja } from './Ja';

export function StageLegend({ counts }: { counts?: Partial<Record<KanjiStage, number>> }) {
  return (
    <ul className="stage-legend" aria-label="Legend">
      {STAGES.map((s) => (
        <li key={s} className={`stage--${s}`}>
          <i className="stage-swatch" aria-hidden="true" />
          <span className="stage-legend-name">{stageLabel(s)}</span>
          {counts && <span className="muted"> {counts[s] ?? 0}</span>}
          <span className="stage-legend-hint muted">{STAGE_HINTS[s]}</span>
        </li>
      ))}
    </ul>
  );
}

export function KanjiMap({ map, onOpen }: { map: KanjiMastery[]; onOpen: (k: KanjiId, el: HTMLElement) => void }) {
  const counts: Partial<Record<KanjiStage, number>> = {};
  for (const m of map) counts[m.stage] = (counts[m.stage] ?? 0) + 1;
  return (
    <div className="kmap">
      <StageLegend counts={counts} />
      <ul className="kmap-grid">
        {map.map((m) => (
          <li key={m.kanji}>
            <button
              type="button"
              className={`kmap-cell stage--${m.stage}`}
              onClick={(e) => onOpen(m.kanji, e.currentTarget)}
              aria-label={`${m.kanji}: ${stageLabel(m.stage)}${m.overall.n ? `, about ${pct(m.overall.mean)}` : ''}. Open details`}
            >
              <Ja serif className="kmap-kanji">
                {m.kanji}
              </Ja>
              <span className="kmap-tip" aria-hidden="true">
                {stageLabel(m.stage)}
                {m.overall.n > 0 && ` · ${pct(m.overall.mean)}`}
              </span>
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}
