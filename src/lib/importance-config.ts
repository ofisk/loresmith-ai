export const HIGH_RANGE = { min: 80, max: 100 };
export const MEDIUM_RANGE = { min: 60, max: 79 };
export const LOW_RANGE = { min: 0, max: 59 };

export type ImportanceLevel = "high" | "medium" | "low";

export function mapScoreToLevel(score: number): ImportanceLevel {
  if (score >= HIGH_RANGE.min) {
    return "high";
  }
  if (score >= MEDIUM_RANGE.min) {
    return "medium";
  }
  return "low";
}

export function isScoreInCategory(
  score: number,
  category: ImportanceLevel
): boolean {
  switch (category) {
    case "high":
      return score >= HIGH_RANGE.min && score <= HIGH_RANGE.max;
    case "medium":
      return score >= MEDIUM_RANGE.min && score <= MEDIUM_RANGE.max;
    case "low":
      return score >= LOW_RANGE.min && score <= LOW_RANGE.max;
    default:
      return false;
  }
}

export function mapOverrideToScore(
  override: ImportanceLevel | null,
  currentScore: number
): number {
  if (override === null) {
    return currentScore;
  }

  if (isScoreInCategory(currentScore, override)) {
    return currentScore;
  }

  switch (override) {
    case "high":
      return 90;
    case "medium":
      return 60;
    case "low":
      return 10;
    default:
      return currentScore;
  }
}
