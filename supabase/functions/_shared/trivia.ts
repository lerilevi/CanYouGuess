export function normalizeAnswer(value: string): string {
  return value
    .normalize('NFKD')
    .replace(/\p{M}/gu, '')
    .toLocaleLowerCase('en')
    .replace(/&/g, ' and ')
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim()
    .replace(/\s+/g, ' ');
}

export function containsNormalizedPhrase(text: string, phrase: string): boolean {
  const normalizedText = normalizeAnswer(text);
  const normalizedPhrase = normalizeAnswer(phrase);
  return Boolean(normalizedPhrase)
    && ` ${normalizedText} `.includes(` ${normalizedPhrase} `);
}

function editDistance(left: string, right: string): number {
  if (left === right) return 0;
  const previous = Array.from({ length: right.length + 1 }, (_, index) => index);
  for (let i = 1; i <= left.length; i += 1) {
    const current = [i];
    for (let j = 1; j <= right.length; j += 1) {
      current[j] = Math.min(
        current[j - 1] + 1,
        previous[j] + 1,
        previous[j - 1] + (left[i - 1] === right[j - 1] ? 0 : 1),
      );
    }
    previous.splice(0, previous.length, ...current);
  }
  return previous[right.length];
}

export function matchesAcceptedAnswer(userAnswer: string, acceptedAnswers: string[]): boolean {
  const candidate = normalizeAnswer(userAnswer);
  return acceptedAnswers.some((answer) => {
    const expected = normalizeAnswer(answer);
    if (!candidate || !expected) return false;
    if (candidate === expected) return true;
    const tolerance = expected.length >= 12 ? 2 : expected.length >= 6 ? 1 : 0;
    return Math.abs(candidate.length - expected.length) <= tolerance
      && editDistance(candidate, expected) <= tolerance;
  });
}
