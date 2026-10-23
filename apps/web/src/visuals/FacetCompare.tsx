import type { VisualSpec } from '@kizuna/core';
import { IntervalBar } from '../components/bits';
import { Auto, Ja } from '../components/Ja';

type Spec = Extract<VisualSpec, { kind: 'facet_compare' }>;

export function FacetCompare({ spec }: { spec: Spec }) {
  return (
    <figure className="viz viz-facets">
      <figcaption className="viz-title">
        <Auto text={spec.title} />
      </figcaption>
      <div className="viz-facets-layout">
        <div className="viz-facets-kanji" aria-hidden="true">
          <Ja serif>{spec.kanji}</Ja>
        </div>
        <div className="viz-body">
          {spec.facets.map((f) => (
            <IntervalBar key={f.facet} label={<Auto text={f.label} />} estimate={f.estimate} highlight={f.highlight} />
          ))}
        </div>
      </div>
      <IntervalLegend />
    </figure>
  );
}

export function IntervalLegend() {
  return (
    <div className="meter-legend" aria-hidden="true">
      <span>
        <i className="lg-dot" /> Best estimate
      </span>
      <span>
        <i className="lg-band" /> Likely range (80%)
      </span>
    </div>
  );
}
