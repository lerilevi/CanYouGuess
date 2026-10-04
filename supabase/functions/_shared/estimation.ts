// Versioned before play; the submitted guess never influences the reference.
export const RUBRIC_VERSION = 'relative-v1';
export function scoreFromDeviation(d: number): number {
  if (!Number.isFinite(d) || d < 0) throw new Error('Invalid deviation');
  if (d <= 1) return Math.round(100-d);
  if (d <= 5) return Math.round(99-(d-1)*2.25);
  if (d <= 20) return Math.round(90-(d-5)*20/15);
  if (d <= 50) return Math.round(70-(d-20));
  if (d <= 100) return Math.round(40-(d-50)*0.4);
  return Math.max(0,Math.round(20-Math.min(d-100,100)*0.2));
}
export function evaluateFrozen(reference: number, answer: number) {
  // Initial numeric contract intentionally excludes zero/negative references.
  if (!Number.isFinite(reference) || reference <= 0 || !Number.isFinite(answer)) throw new Error('Invalid numeric answer');
  const deviationPercent = Math.abs(answer-reference)/reference*100;
  return {deviationPercent,score:scoreFromDeviation(deviationPercent),rubricVersion:RUBRIC_VERSION};
}
