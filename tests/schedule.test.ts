// YES / VSTAR schedule-paste parser. The three fixtures below are the three
// shapes a copy-paste out of YES actually produces: the schedule table, the
// printable class-detail list, and enrollment-cart cards.

import { describe, expect, it } from "vitest";
import {
  countCourseCodes,
  parseDayTokens,
  parseMeetingLine,
  parseScheduleText,
  parseTimeRange,
} from "@/lib/parsers/schedule";

describe("parseDayTokens", () => {
  it("reads Vanderbilt's compact form (R is Thursday)", () => {
    expect(parseDayTokens("MWF")).toEqual([1, 3, 5]);
    expect(parseDayTokens("TR")).toEqual([2, 4]);
    expect(parseDayTokens("MTWRF")).toEqual([1, 2, 3, 4, 5]);
  });

  it("reads two-letter and full-name forms", () => {
    expect(parseDayTokens("TuTh")).toEqual([2, 4]);
    expect(parseDayTokens("Mo We Fr")).toEqual([1, 3, 5]);
    expect(parseDayTokens("Monday, Wednesday")).toEqual([1, 3]);
    expect(parseDayTokens("Th")).toEqual([4]);
  });

  it("returns null for text that is not days", () => {
    expect(parseDayTokens("Hall")).toBeNull();
    expect(parseDayTokens("")).toBeNull();
    expect(parseDayTokens("Buttrick")).toBeNull();
  });
});

describe("parseTimeRange", () => {
  it("parses meridiems, inherits a missing one, and reports 24h times", () => {
    expect(parseTimeRange("10:10AM - 11:00AM")).toMatchObject({
      startTime: "10:10",
      endTime: "11:00",
      inferredMeridiem: false,
    });
    expect(parseTimeRange("1:25 p.m. - 2:15 p.m.")).toMatchObject({
      startTime: "13:25",
      endTime: "14:15",
    });
    expect(parseTimeRange("2:20 - 5:00PM")).toMatchObject({
      startTime: "14:20",
      endTime: "17:00",
      inferredMeridiem: true,
    });
  });

  it("does not let an end meridiem push the start past the end", () => {
    // 11:00 must stay morning even though the pm belongs to 1:15.
    expect(parseTimeRange("11:00 - 1:15 pm")).toMatchObject({
      startTime: "11:00",
      endTime: "13:15",
    });
  });

  it("infers am/pm from the class-day window when neither is given", () => {
    expect(parseTimeRange("9:30-10:45")).toMatchObject({
      startTime: "09:30",
      endTime: "10:45",
      inferredMeridiem: true,
    });
    expect(parseTimeRange("3:10-4:00")).toMatchObject({
      startTime: "15:10",
      endTime: "16:00",
    });
  });

  it("rejects digit pairs that only look like times", () => {
    expect(parseTimeRange("CS 1101-01")).toBeNull();
    expect(parseTimeRange("Academic year 2026-2027")).toBeNull();
    expect(parseTimeRange("Featheringill Hall 134")).toBeNull();
  });
});

describe("parseMeetingLine", () => {
  it("expands a day cluster into one meeting per day and keeps the room", () => {
    const r = parseMeetingLine("MWF 10:10AM - 11:00AM  Featheringill Hall 134");
    expect(r!.meetings).toHaveLength(3);
    expect(r!.meetings.map((m) => m.dayOfWeek)).toEqual([1, 3, 5]);
    expect(r!.meetings[0].location).toBe("Featheringill Hall 134");
    expect(r!.meetings[0].kind).toBe("LECTURE");
  });

  it("does not read a trailing letter of an ordinary word as a day", () => {
    // "Room" ends in M; the day cluster must not steal it.
    expect(parseMeetingLine("Room 10:10AM - 11:00AM")).toBeNull();
  });

  it("labels labs and discussions from the line itself", () => {
    const lab = parseMeetingLine("Laboratory W 2:20PM - 5:00PM  Stevenson 4309");
    expect(lab!.meetings[0].kind).toBe("LAB");
    const disc = parseMeetingLine("Discussion F 9:10AM - 10:00AM");
    expect(disc!.meetings[0].kind).toBe("DISCUSSION");
  });

  it("returns trailing cells but never the course title ahead of the days", () => {
    const r = parseMeetingLine(
      "CS 1101-01\tProgramming and Problem Solving\tMWF\t10:10AM - 11:00AM\tFGH 134\tJ. Doe\t3.00",
    );
    expect(r!.meetings[0].location).toBe("FGH 134");
    expect(r!.leftovers).toContain("J. Doe");
    expect(r!.leftovers).not.toContain("Programming and Problem Solving");
  });
});

describe("parseScheduleText — YES schedule table", () => {
  const TABLE = [
    "Fall 2026 | Undergraduate | Vanderbilt University",
    "Class\tDescription\tDays & Times\tRoom\tInstructor\tUnits",
    "CS 1101-01\tProgramming and Problem Solving\tMWF\t10:10AM - 11:00AM\tFeatheringill Hall 134\tA. Rivera\t3.00",
    "MATH 1301-03\tAccelerated Single-Variable Calculus I\tTR\t9:30AM - 10:45AM\tStevenson 1206\tK. Osei\t4.00",
    "BSCI 1510-02\tIntroduction to Biological Sciences\tTR\t1:15PM - 2:30PM\tStevenson 4327\tM. Chen\t4.00",
    "BSCI 1510L-04\tIntroduction to Biological Sciences Laboratory\tW\t2:20PM - 5:00PM\tStevenson 4309\tStaff\t1.00",
  ].join("\n");

  it("parses every course with days, times, rooms, instructors, and units", () => {
    const r = parseScheduleText(TABLE);
    expect(r.term).toBe("Fall 2026");
    expect(r.courses.map((c) => c.code)).toEqual([
      "CS 1101",
      "MATH 1301",
      "BSCI 1510",
      "BSCI 1510L",
    ]);

    const cs = r.courses[0];
    expect(cs.title).toBe("Programming and Problem Solving");
    expect(cs.section).toBe("01");
    expect(cs.credits).toBe(3);
    expect(cs.professor).toBe("A. Rivera");
    expect(cs.meetings).toHaveLength(3);
    expect(cs.meetings[0]).toMatchObject({
      dayOfWeek: 1,
      startTime: "10:10",
      endTime: "11:00",
      location: "Featheringill Hall 134",
    });
    expect(cs.confidence).toBe("VERIFIED");

    const lab = r.courses[3];
    expect(lab.meetings[0].kind).toBe("LAB");
    expect(lab.meetings[0].startTime).toBe("14:20");
    // "Staff" is not a person to record.
    expect(lab.professor).toBeNull();
  });

  it("keeps a room's building abbreviation from becoming a course", () => {
    const r = parseScheduleText(TABLE);
    expect(r.courses.some((c) => c.code.startsWith("FGH"))).toBe(false);
    expect(r.courses).toHaveLength(4);
  });
});

describe("parseScheduleText — printable class detail", () => {
  const DETAIL = [
    "My Class Schedule — Fall 2026",
    "ECON 1010 - 05  Principles of Macroeconomics",
    "Class Nbr: 8213",
    "Status: Enrolled",
    "Units: 3.00",
    "Instructor: Priya Raghunathan",
    "Days and Times: Monday, Wednesday, Friday 1:25PM - 2:15PM",
    "Room: Calhoun Hall 102",
    "ENGL 1250W - 12  First-Year Writing Seminar: Technology and Society",
    "Class Nbr: 8890",
    "Units: 3.00",
    "Instructor: Staff",
    "Days and Times: TuTh 11:00AM - 12:15PM",
    "Room: Buttrick 206",
  ].join("\n");

  it("reads labelled fields and merges them onto the right course", () => {
    const r = parseScheduleText(DETAIL);
    expect(r.courses).toHaveLength(2);

    const econ = r.courses[0];
    expect(econ.title).toBe("Principles of Macroeconomics");
    expect(econ.section).toBe("05");
    expect(econ.credits).toBe(3);
    expect(econ.professor).toBe("Priya Raghunathan");
    expect(econ.meetings.map((m) => m.dayOfWeek)).toEqual([1, 3, 5]);
    expect(econ.meetings[0].startTime).toBe("13:25");

    const engl = r.courses[1];
    expect(engl.title).toBe("First-Year Writing Seminar: Technology and Society");
    expect(engl.meetings.map((m) => m.dayOfWeek)).toEqual([2, 4]);
    expect(engl.professor).toBeNull();
  });

  it("does not treat a labelled room line as a new course", () => {
    const r = parseScheduleText(DETAIL);
    expect(r.courses.map((c) => c.code)).toEqual(["ECON 1010", "ENGL 1250W"]);
  });
});

describe("parseScheduleText — enrollment cart cards and edge cases", () => {
  it("parses cards where the title sits on its own line", () => {
    const r = parseScheduleText(
      [
        "HOD 1000",
        "Understanding Organizations",
        "TR 2:35PM - 3:50PM",
        "Payne Hall 101",
        "3 credit hours",
      ].join("\n"),
    );
    expect(r.courses).toHaveLength(1);
    expect(r.courses[0].title).toBe("Understanding Organizations");
    expect(r.courses[0].credits).toBe(3);
    expect(r.courses[0].meetings).toHaveLength(2);
  });

  it("merges repeated rows for one course instead of duplicating it", () => {
    const r = parseScheduleText(
      [
        "PHYS 1601  General Physics I",
        "PHYS 1601  MWF 9:10AM - 10:00AM  Stevenson 4327",
        "PHYS 1601  Laboratory R 1:00PM - 3:50PM  Stevenson 6323",
      ].join("\n"),
    );
    expect(r.courses).toHaveLength(1);
    expect(r.courses[0].meetings).toHaveLength(4);
    expect(r.courses[0].meetings.filter((m) => m.kind === "LAB")).toHaveLength(1);
  });

  it("flags a course with no meeting information instead of inventing one", () => {
    const r = parseScheduleText("MUSL 1600  Applied Piano\nUnits: 1.00");
    expect(r.courses[0].meetings).toHaveLength(0);
    expect(r.courses[0].confidence).toBe("UNVERIFIED");
    expect(r.courses[0].warnings.join(" ")).toMatch(/no meeting days/i);
  });

  it("warns when am/pm had to be guessed rather than silently committing it", () => {
    const r = parseScheduleText("CS 2201  Program Design\nMWF 2:10-3:00");
    expect(r.courses[0].meetings[0].startTime).toBe("14:10");
    expect(r.courses[0].confidence).toBe("LIKELY");
    expect(r.courses[0].warnings.join(" ")).toMatch(/AM\/PM was inferred/i);
  });

  it("warns about overlapping meetings across two courses", () => {
    const r = parseScheduleText(
      [
        "CS 1101  Programming",
        "MWF 10:10AM - 11:00AM",
        "MATH 1301  Calculus",
        "MWF 10:10AM - 11:00AM",
      ].join("\n"),
    );
    expect(r.warnings.join(" ")).toMatch(/overlaps/i);
  });

  it("says so plainly when the paste has no course codes at all", () => {
    const r = parseScheduleText("Welcome to YES. Please sign in to continue.");
    expect(r.courses).toHaveLength(0);
    expect(r.warnings.join(" ")).toMatch(/No course codes found/i);
  });

  it("handles empty input without throwing", () => {
    expect(parseScheduleText("").courses).toHaveLength(0);
    expect(parseScheduleText("   \n  ").courses).toHaveLength(0);
  });

  it("countCourseCodes counts distinct codes", () => {
    expect(countCourseCodes("CS 1101, CS 1101, MATH 1301")).toBe(2);
  });
});
