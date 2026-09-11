import { agreement } from '../match'
import type { MeasuredClaim } from './corpus'

const lnChoose = (n: number, k: number): number => {
  let total = 0
  for (let i = 1; i <= k; i++) total += Math.log(n - k + i) - Math.log(i)
  return total
}

/**
 * One-sided 95% Clopper-Pearson upper bound: the largest p for which observing this many events
 * or fewer still has five percent probability. Exact for the binomial, and at zero events it
 * becomes the rule of three, so zero needs no special case — which matters, because a bound
 * defined only for the outcome you expect is a bound you will publish as NaN.
 *
 * Bisection rather than an inverse beta: a dozen lines, no dependency, and the trial count here
 * is small enough that the result is exact well past any precision worth quoting.
 */
export const upperBound95 = (events: number, trials: number): number => {
  if (trials === 0) return 1
  const cdf = (p: number) => {
    let total = 0
    for (let i = 0; i <= events; i++) {
      total += Math.exp(lnChoose(trials, i) + i * Math.log(p) + (trials - i) * Math.log1p(-p))
    }
    return total
  }
  let lo = events / trials
  let hi = 1
  for (let step = 0; step < 80; step++) {
    const mid = (lo + hi) / 2
    if (cdf(mid) > 0.05) lo = mid
    else hi = mid
  }
  return hi
}

/**
 * Every unordered pair, counted once. A false match is two claims the ledger says are different
 * that the threshold says are the same.
 */
export const falseMatchRate = (corpus: readonly MeasuredClaim[], k: number) => {
  let observed = 0
  let pairs = 0
  const collisions: Array<{ a: string; b: string; agreed: number }> = []
  for (let i = 0; i < corpus.length; i++) {
    for (let j = i + 1; j < corpus.length; j++) {
      pairs++
      const agreed = agreement(corpus[i]!.components, corpus[j]!.components)
      if (agreed >= k) {
        observed++
        collisions.push({ a: corpus[i]!.invoiceNumber, b: corpus[j]!.invoiceNumber, agreed })
      }
    }
  }
  return {
    pairs,
    observed,
    rate: pairs === 0 ? 0 : observed / pairs,
    upperBound95: upperBound95(observed, pairs),
    collisions,
  }
}
