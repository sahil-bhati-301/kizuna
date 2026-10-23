// Small, deterministic statistics helpers.
import { logit, sigmoid } from '../baseline';

/** Standard normal CDF (Abramowitz & Stegun 7.1.26, |error| < 1.5e-7). */
export function normCdf(z: number): number {
  const x = Math.abs(z) / Math.SQRT2;
  const t = 1 / (1 + 0.3275911 * x);
  const y = 1 - ((((1.061405429 * t - 1.453152027) * t + 1.421413741) * t - 0.284496736) * t + 0.254829592) * t * Math.exp(-x * x);
  return z >= 0 ? 0.5 * (1 + y) : 0.5 * (1 - y);
}

function lnGamma(z: number): number {
  const g = 7;
  const c = [
    0.99999999999980993, 676.5203681218851, -1259.1392167224028, 771.32342877765313, -176.61502916214059,
    12.507343278686905, -0.13857109526572012, 9.9843695780195716e-6, 1.5056327351493116e-7,
  ];
  if (z < 0.5) return Math.log(Math.PI / Math.sin(Math.PI * z)) - lnGamma(1 - z);
  const zz = z - 1;
  let x = c[0];
  for (let i = 1; i < g + 2; i++) x += c[i] / (zz + i);
  const t = zz + g + 0.5;
  return 0.5 * Math.log(2 * Math.PI) + (zz + 0.5) * Math.log(t) - t + Math.log(x);
}

function betacf(a: number, b: number, x: number): number {
  const MAXIT = 200;
  const EPS = 3e-12;
  const FPMIN = 1e-300;
  const qab = a + b;
  const qap = a + 1;
  const qam = a - 1;
  let c = 1;
  let d = 1 - (qab * x) / qap;
  if (Math.abs(d) < FPMIN) d = FPMIN;
  d = 1 / d;
  let h = d;
  for (let m = 1; m <= MAXIT; m++) {
    const m2 = 2 * m;
    let aa = (m * (b - m) * x) / ((qam + m2) * (a + m2));
    d = 1 + aa * d;
    if (Math.abs(d) < FPMIN) d = FPMIN;
    c = 1 + aa / c;
    if (Math.abs(c) < FPMIN) c = FPMIN;
    d = 1 / d;
    h *= d * c;
    aa = (-(a + m) * (qab + m) * x) / ((a + m2) * (qap + m2));
    d = 1 + aa * d;
    if (Math.abs(d) < FPMIN) d = FPMIN;
    c = 1 + aa / c;
    if (Math.abs(c) < FPMIN) c = FPMIN;
    d = 1 / d;
    const del = d * c;
    h *= del;
    if (Math.abs(del - 1) < EPS) break;
  }
  return h;
}

/** Regularised incomplete beta I_x(a, b), i.e. the Beta(a, b) CDF at x. */
export function betaCdf(x: number, a: number, b: number): number {
  if (x <= 0) return 0;
  if (x >= 1) return 1;
  const lbt = lnGamma(a + b) - lnGamma(a) - lnGamma(b) + a * Math.log(x) + b * Math.log(1 - x);
  const bt = Math.exp(lbt);
  if (x < (a + 1) / (a + b + 2)) return (bt * betacf(a, b, x)) / a;
  return 1 - (bt * betacf(b, a, 1 - x)) / b;
}

export interface WeightedObs {
  y: number;
  p: number;
  w: number;
}

export interface GroupEffect {
  delta: number;
  sd: number;
  /** P(δ < −τ) under the Laplace (normal) posterior. */
  pBelow: number;
}

/**
 * Group effect δ in logit P(y=1) = logit(p_i) + δ, prior δ ~ N(0, σ²), weighted
 * observations, Laplace approximation after a few Newton steps (design §5.3).
 */
export function groupEffect(obs: readonly WeightedObs[], priorSd: number, tau: number, steps: number): GroupEffect {
  const s2 = priorSd * priorSd;
  let delta = 0;
  let h = 1 / s2;
  for (let i = 0; i < steps; i++) {
    let g = -delta / s2;
    h = 1 / s2;
    for (const o of obs) {
      const q = sigmoid(logit(o.p) + delta);
      g += o.w * (o.y - q);
      h += o.w * q * (1 - q);
    }
    delta += g / h;
  }
  // Curvature at the final estimate.
  h = 1 / s2;
  for (const o of obs) {
    const q = sigmoid(logit(o.p) + delta);
    h += o.w * q * (1 - q);
  }
  const sd = 1 / Math.sqrt(h);
  return { delta, sd, pBelow: normCdf((-tau - delta) / sd) };
}

export const round = (x: number, digits = 4): number => {
  const f = 10 ** digits;
  return Math.round(x * f) / f;
};

export const pct = (x: number): number => Math.round(x * 100);
