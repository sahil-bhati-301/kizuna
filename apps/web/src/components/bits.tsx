import type { ReactNode } from 'react';
import type { Estimate, KanjiStage } from '@kizuna/core';
import { clamp01, confidenceLabel, pct, stageLabel } from '../app/format';
import { Auto } from './Ja';

export function ProgressBar({ value, total, label }: { value: number; total: number; label: string }) {
  const ratio = total > 0 ? clamp01(value / total) : 0;
  return (
    <div className="progress">
      <div
        className="progress-track"
        role="progressbar"
        aria-label={label}
        aria-valuemin={0}
        aria-valuemax={total}
        aria-valuenow={value}
        aria-valuetext={`${value} of ${total}`}
      >
        <div className="progress-fill" style={{ width: `${ratio * 100}%` }} />
      </div>
      <span className="progress-count">
        {value}
        <span className="muted"> / {total}</span>
      </span>
    </div>
  );
}

/** A horizontal bar of observed accuracy with a tick for what was expected. */
export function MeterRow({
  label,
  observed,
  expected,
  n,
  highlight,
  tone,
}: {
  label: ReactNode;
  observed: number;
  expected?: number;
  n?: number;
  highlight?: boolean;
  tone?: 'thread' | 'indigo' | 'muted';
}) {
  const t = tone ?? (highlight ? 'thread' : 'indigo');
  const empty = n === 0;
  return (
    <div className={`meter ${highlight ? 'is-hl' : ''} meter--${t}`}>
      <div className="meter-label">{label}</div>
      <div className="meter-track" aria-hidden="true">
        {!empty && <div className="meter-fill" style={{ width: `${clamp01(observed) * 100}%` }} />}
        {expected !== undefined && !empty && (
          <div className="meter-expected" style={{ left: `${clamp01(expected) * 100}%` }} title={`Expected ${pct(expected)}`} />
        )}
      </div>
      <div className="meter-value">
        {empty ? <span className="muted">no data</span> : pct(observed)}
        {n !== undefined && !empty && <span className="meter-n">n={n}</span>}
      </div>
    </div>
  );
}

export function MeterLegend({ observedLabel = 'Your accuracy', expectedLabel = 'Expected for you' }) {
  return (
    <div className="meter-legend" aria-hidden="true">
      <span>
        <i className="lg-fill" /> {observedLabel}
      </span>
      <span>
        <i className="lg-tick" /> {expectedLabel}
      </span>
    </div>
  );
}

/** An 80% interval (low–high band), a mean dot, and n. */
export function IntervalBar({ label, estimate, highlight }: { label: ReactNode; estimate: Estimate; highlight?: boolean }) {
  const lo = clamp01(estimate.low);
  const hi = clamp01(estimate.high);
  const mean = clamp01(estimate.mean);
  const noData = estimate.n === 0;
  return (
    <div className={`interval ${highlight ? 'is-hl' : ''}`}>
      <div className="interval-label">{label}</div>
      <div className="interval-track" aria-hidden="true">
        {!noData && (
          <>
            <div className="interval-band" style={{ left: `${lo * 100}%`, width: `${Math.max(0.5, (hi - lo) * 100)}%` }} />
            <div className="interval-dot" style={{ left: `${mean * 100}%` }} />
          </>
        )}
      </div>
      <div className="interval-value">
        {noData ? (
          <span className="muted">untested</span>
        ) : (
          <>
            <strong>{pct(mean)}</strong>
            <span className="muted">
              {' '}
              {pct(lo)}–{pct(hi)} · n={estimate.n}
            </span>
          </>
        )}
      </div>
      <span className="sr-only">
        {noData
          ? 'no answers yet'
          : `estimate ${pct(mean)}, likely between ${pct(lo)} and ${pct(hi)}, from ${estimate.n} answers`}
      </span>
    </div>
  );
}

export function ConfidenceBadge({ confidence }: { confidence: number }) {
  const level = confidence >= 0.9 ? 'high' : confidence >= 0.75 ? 'mid' : 'low';
  return (
    <span className={`badge badge--conf-${level}`} title="How sure we are that this is a real pattern, not chance">
      {confidenceLabel(confidence)} · {pct(confidence)}
    </span>
  );
}

export function StageBadge({ stage }: { stage: KanjiStage }) {
  return (
    <span className={`badge stage-badge stage--${stage}`}>
      <i className="stage-swatch" aria-hidden="true" />
      {stageLabel(stage)}
    </span>
  );
}

export type ComparisonStatus = 'improved' | 'unchanged' | 'worse' | 'resolved' | 'new';

const STATUS_TEXT: Record<ComparisonStatus, { icon: string; label: string }> = {
  improved: { icon: '↑', label: 'Improved' },
  resolved: { icon: '✓', label: 'Untied' },
  unchanged: { icon: '→', label: 'Unchanged' },
  worse: { icon: '↓', label: 'Worse' },
  new: { icon: '＋', label: 'New' },
};

export function StatusPill({ status }: { status: ComparisonStatus }) {
  const s = STATUS_TEXT[status] ?? { icon: '•', label: status };
  return (
    <span className={`badge status status--${status}`}>
      <span aria-hidden="true">{s.icon}</span> {s.label}
    </span>
  );
}

export function Facts({ facts }: { facts: string[] }) {
  if (!facts.length) return null;
  return (
    <ul className="facts">
      {facts.map((f, i) => (
        <li key={i}>
          <Auto text={f} />
        </li>
      ))}
    </ul>
  );
}

export function Stat({ label, value, sub }: { label: string; value: ReactNode; sub?: ReactNode }) {
  return (
    <div className="stat">
      <div className="stat-value">{value}</div>
      <div className="stat-label">{label}</div>
      {sub && <div className="stat-sub">{sub}</div>}
    </div>
  );
}
