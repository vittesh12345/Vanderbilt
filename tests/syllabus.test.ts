// Heuristic syllabus parser — one realistic multi-section fixture plus
// targeted warning/dedupe fixtures. Parsed with a fixed `now` so year
// inference is deterministic.

import { describe, expect, it } from "vitest";
import { parseSyllabus } from "@/lib/parsers/syllabus";

const NOW = new Date("2026-08-20T09:00:00"); // semester start, year 2026

const FIXTURE = [
  "ECON 2100: Intermediate Microeconomics",
  "Fall 2026 — 3 credit hours",
  "Instructor: Dana Whitfield",
  "Email: dana.whitfield@vanderbilt.edu",
  "Lectures: MWF 10:10–11:00, Wilson Hall 103",
  "Office Hours: Tuesdays 2:00–3:30 pm in Calhoun 211",
  "",
  "Grading",
  "Problem Sets – 30%",
  "Midterm Exams – 40%",
  "Final Exam – 20%",
  "Participation – 10%",
  "",
  "Course Schedule",
  "Midterm 1 — October 14",
  "Midterm 1 — October 14",
  "Quiz 2 — September 25 in class",
  "Problem Set 3 due 10/21 at 11:59 PM",
  "Read Chapter 5 (pages 88–112) — September 18",
  "Project proposal draft due November 4",
  "Final Exam — December 12, 2026, 9:00 am",
  "",
  "Course Policies",
  "Late work loses 10% per day and no submissions are accepted more than 72 hours after the deadline.",
].join("\n");

describe("parseSyllabus — course info", () => {
  const result = parseSyllabus(FIXTURE, { now: NOW });

  it("extracts code, title, professor, email, and credits", () => {
    expect(result.courseInfo.code).toBe("ECON 2100");
    expect(result.courseInfo.title).toBe("Intermediate Microeconomics");
    expect(result.courseInfo.professor).toBe("Dana Whitfield");
    expect(result.courseInfo.professorEmail).toBe("dana.whitfield@vanderbilt.edu");
    expect(result.courseInfo.credits).toBe(3);
  });

  it("captures the meeting-times line", () => {
    expect(result.courseInfo.meetingTimes).toContain("MWF");
  });
});

describe("parseSyllabus — grade weights", () => {
  const result = parseSyllabus(FIXTURE, { now: NOW });

  it("finds all 4 categories with HIGH confidence", () => {
    expect(result.gradeWeights).toHaveLength(4);
    const byCategory = Object.fromEntries(
      result.gradeWeights.map((g) => [g.category, g.weight]),
    );
    expect(byCategory["Problem Sets"]).toBe(30);
    expect(byCategory["Midterm Exams"]).toBe(40);
    expect(byCategory["Final Exam"]).toBe(20);
    expect(byCategory["Participation"]).toBe(10);
    expect(result.gradeWeights.every((g) => g.confidence === "HIGH")).toBe(true);
  });

  it("does not warn when weights sum to 100", () => {
    expect(result.warnings.some((w) => w.includes("sum to"))).toBe(false);
  });
});

describe("parseSyllabus — dated items", () => {
  const result = parseSyllabus(FIXTURE, { now: NOW });

  it("extracts the midterm as an EXAM on the right ISO date", () => {
    const midterm = result.dates.find(
      (d) => d.kind === "EXAM" && d.date === "2026-10-14",
    );
    expect(midterm).toBeDefined();
    expect(midterm!.title).toContain("Midterm 1");
  });

  it("extracts the quiz", () => {
    const quiz = result.dates.find((d) => d.kind === "QUIZ");
    expect(quiz).toBeDefined();
    expect(quiz!.date).toBe("2026-09-25");
  });

  it("extracts the problem set as an ASSIGNMENT with the 23:59 time", () => {
    const pset = result.dates.find(
      (d) => d.kind === "ASSIGNMENT" && d.date === "2026-10-21",
    );
    expect(pset).toBeDefined();
    expect(pset!.time).toBe("23:59");
    expect(pset!.title).toContain("Problem Set 3");
  });

  it("extracts the reading as READING", () => {
    const reading = result.dates.find((d) => d.kind === "READING");
    expect(reading).toBeDefined();
    expect(reading!.date).toBe("2026-09-18");
    expect(reading!.title).toContain("Chapter 5");
  });

  it("extracts the project milestone as PROJECT_MILESTONE", () => {
    const milestone = result.dates.find((d) => d.kind === "PROJECT_MILESTONE");
    expect(milestone).toBeDefined();
    expect(milestone!.date).toBe("2026-11-04");
  });

  it("honors the final exam's explicit year", () => {
    const final = result.dates.find(
      (d) => d.kind === "EXAM" && d.date === "2026-12-12",
    );
    expect(final).toBeDefined();
    expect(final!.time).toBe("09:00");
  });

  it("dedupes identical title+date lines", () => {
    const midterms = result.dates.filter(
      (d) => d.title === "Midterm 1" && d.date === "2026-10-14",
    );
    expect(midterms).toHaveLength(1);
  });
});

describe("parseSyllabus — office hours and policies", () => {
  const result = parseSyllabus(FIXTURE, { now: NOW });

  it("parses the office-hours line", () => {
    expect(result.officeHours.length).toBeGreaterThanOrEqual(1);
    expect(result.officeHours[0].day).toContain("Tue");
    expect(result.officeHours[0].start).toBe("2:00");
  });

  it("captures the late policy", () => {
    const late = result.policies.find((p) => p.topic === "Late policy");
    expect(late).toBeDefined();
    expect(late!.summary).toContain("Late work");
  });
});

describe("parseSyllabus — warnings", () => {
  it("warns when grade weights do not sum to ~100", () => {
    const short = [
      "Grading",
      "Problem Sets – 30%",
      "Midterm – 30%",
      "Final Exam – 20%",
    ].join("\n");
    const result = parseSyllabus(short, { now: NOW });
    expect(result.warnings.some((w) => w.includes("80%"))).toBe(true);
  });

  it("warns when no dated items are found", () => {
    const dateless = [
      "PHIL 1100: Introduction to Ethics",
      "Instructor: Sam Rivera",
      "The full schedule will be posted on Brightspace.",
    ].join("\n");
    const result = parseSyllabus(dateless, { now: NOW });
    expect(result.dates).toHaveLength(0);
    expect(result.warnings.some((w) => w.includes("No dated items"))).toBe(true);
  });
});
