// The learner's own baseline: overall ability θ and the expected accuracy it implies.
import type { GradedAnswer } from './contracts';

export const BASELINE_CONFIG = {
  /** Prior on θ: N(0, priorSd²). */
  priorSd: 1.5,
  newtonSteps: 8,
};

export const sigmoid = (x: number): number => 1 / (1 + Math.exp(-x));
export const logit = (p: number): number => {
  const q = Math.min(1 - 1e-6, Math.max(1e-6, p));
  return Math.log(q / (1 - q));
};

/** Multiple-choice guess rate γ = 1 / number of options. */
export function guessRate(optionCount: number): number {
  return optionCount > 0 ? 1 / optionCount : 0;
}

/** Expected probability of a correct answer: γ + (1 − γ)·σ(θ − b). */
export function expectedP(theta: number, b: number, gamma: number): number {
  return gamma + (1 - gamma) * sigmoid(theta - b);
}

export function expectedFor(theta: number, g: GradedAnswer): number {
  return expectedP(theta, g.question.difficulty, guessRate(g.question.options.length));
}

/**
 * Fit θ by Fisher scoring on the guessing-corrected Rasch likelihood with a N(0, 1.5²) prior.
 * Deterministic: always starts at 0 and runs a fixed number of steps.
 */
export function fitAbility(answers: readonly GradedAnswer[]): number {
  const s2 = BASELINE_CONFIG.priorSd ** 2;
  let theta = 0;
  for (let step = 0; step < BASELINE_CONFIG.newtonSteps; step++) {
    let grad = -theta / s2;
    let info = 1 / s2;
    for (const a of answers) {
      const gamma = guessRate(a.question.options.length);
      const s = sigmoid(theta - a.question.difficulty);
      const p = Math.min(1 - 1e-9, Math.max(1e-9, gamma + (1 - gamma) * s));
      const dp = (1 - gamma) * s * (1 - s);
      const y = a.correct ? 1 : 0;
      grad += ((y - p) / (p * (1 - p))) * dp;
      info += (dp * dp) / (p * (1 - p));
    }
    const delta = grad / info;
    theta += Math.max(-1.5, Math.min(1.5, delta));
    if (Math.abs(delta) < 1e-6) break;
  }
  return Math.round(theta * 1e6) / 1e6;
}
