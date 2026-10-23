import type { VisualSpec } from '@kizuna/core';
import { pct } from '../app/format';
import { MeterLegend, MeterRow } from '../components/bits';
import { Auto } from '../components/Ja';

type Spec = Extract<VisualSpec, { kind: 'group_bars' }>;

export function GroupBars({ spec }: { spec: Spec }) {
  const summary = spec.groups
    .map((g) => `${g.label}${g.highlight ? ' (this pattern)' : ''}: ${pct(g.observed)} correct versus ${pct(g.expected)} expected, ${g.n} answers`)
    .join('; ');
  return (
    <figure className="viz viz-group-bars">
      <figcaption className="viz-title">
        <Auto text={spec.title} />
      </figcaption>
      <p className="sr-only">{summary}.</p>
      <div className="viz-body" aria-hidden="true">
        {spec.groups.map((g) => (
          <MeterRow
            key={g.key}
            label={<Auto text={g.label} />}
            observed={g.observed}
            expected={g.expected}
            n={g.n}
            highlight={g.highlight}
            tone={g.highlight ? 'thread' : 'muted'}
          />
        ))}
      </div>
      <MeterLegend />
    </figure>
  );
}
