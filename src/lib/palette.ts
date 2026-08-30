// Course identity colors: the validated categorical order (see globals.css).
// Colors are assigned by slot at course-creation time and stored on the row,
// so identity is stable — a course never changes color when others are added
// or removed.

export const COURSE_COLORS = [
  "#2a78d6",
  "#eb6834",
  "#1baf7a",
  "#eda100",
  "#e87ba4",
  "#008300",
  "#4a3aa7",
  "#e34948",
] as const;

export function nextCourseColor(usedColors: string[]): string {
  for (const c of COURSE_COLORS) {
    if (!usedColors.includes(c)) return c;
  }
  // 9th+ course folds back deterministically rather than generating a hue.
  return COURSE_COLORS[usedColors.length % COURSE_COLORS.length];
}

// Ordinal workload ramp — always rendered WITH the level text label.
export const LOAD_COLORS: Record<string, string> = {
  LIGHT: "#86b6ef",
  NORMAL: "#5598e7",
  HIGH: "#2a78d6",
  VERY_HIGH: "#1c5cab",
  EXTREME: "#104281",
};

export const LOAD_LABELS: Record<string, string> = {
  LIGHT: "Light",
  NORMAL: "Normal",
  HIGH: "High",
  VERY_HIGH: "Very high",
  EXTREME: "Extreme",
};
