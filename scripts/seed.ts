// Seed: a realistic Vanderbilt first-year fall for a finance/CS/startup-minded
// student. Dates are RELATIVE TO NOW so the dashboard always has a live demo:
// work due tomorrow, a biology midterm next week with a generated study plan,
// a quiz with NO plan (drives the "no study plan" alert), a big essay whose
// size outranks small near-term work, plus club/career/startup events, goals,
// and one seeded source conflict.

import { PrismaClient } from "@prisma/client";
import { buildStudyPlan } from "../src/lib/engine/studyplan";
import { planWorkSessions } from "../src/lib/engine/scheduler";

const db = new PrismaClient();

const now = new Date();
function day(offset: number, hour = 0, minute = 0): Date {
  const d = new Date(now);
  d.setDate(d.getDate() + offset);
  d.setHours(hour, minute, 0, 0);
  return d;
}

async function main() {
  // Wipe in FK-safe order.
  await db.workSession.deleteMany();
  await db.syllabusUpload.deleteMany();
  await db.topic.deleteMany();
  await db.assignment.deleteMany();
  await db.exam.deleteMany();
  await db.courseMeeting.deleteMany();
  await db.calendarEvent.deleteMany();
  await db.course.deleteMany();
  await db.semester.deleteMany();
  await db.conflict.deleteMany();
  await db.dismissedAlert.deleteMany();
  await db.task.deleteMany();
  await db.goal.deleteMany();
  await db.timeEstimateRecord.deleteMany();
  await db.profile.deleteMany();

  await db.profile.create({
    data: {
      name: "Vittesh Maganti",
      email: "vittesh.ram.maganti@gmail.com",
      school: "Vanderbilt University",
      gradYear: 2030,
      majorsJson: JSON.stringify(["Computer Science", "Economics"]),
      interestsJson: JSON.stringify([
        "finance",
        "investment",
        "consulting",
        "AI",
        "startups",
        "venture capital",
        "product",
      ]),
      tiersJson: JSON.stringify({
        tier1: ["ACADEMIC", "STARTUP", "CAREER"],
        tier2: ["RESEARCH", "CLUB"],
        tier3: ["PERSONAL"],
      }),
      weeklyHours: 45,
    },
  });

  const year = now.getFullYear();
  const semester = await db.semester.create({
    data: {
      name: now.getMonth() >= 6 ? `Fall ${year}` : `Spring ${year}`,
      startDate: day(-14),
      endDate: day(100),
      isCurrent: true,
    },
  });

  // ---- Courses (colors follow the validated categorical order) ----------
  const cs = await db.course.create({
    data: {
      semesterId: semester.id,
      code: "CS 1101",
      title: "Programming and Problem Solving",
      professor: "Dr. Graham Hemingway",
      location: "Featheringill 134",
      credits: 3,
      color: "#2a78d6",
      difficulty: 3,
      targetGrade: "A",
      gradeWeightsJson: JSON.stringify([
        { category: "Programming Projects", weight: 35 },
        { category: "Exams", weight: 40 },
        { category: "Quizzes", weight: 15 },
        { category: "Participation", weight: 10 },
      ]),
      linksJson: JSON.stringify([
        { label: "Brightspace", url: "https://brightspace.vanderbilt.edu", kind: "LMS", authRequired: true },
        { label: "Course GitHub", url: "https://github.com", kind: "GITHUB", authRequired: false },
      ]),
      officeHoursJson: JSON.stringify([
        { day: "Tue", start: "14:00", end: "15:30", location: "FGH 226" },
      ]),
      meetings: {
        create: [
          { dayOfWeek: 1, startTime: "10:10", endTime: "11:00", kind: "LECTURE" },
          { dayOfWeek: 3, startTime: "10:10", endTime: "11:00", kind: "LECTURE" },
          { dayOfWeek: 5, startTime: "10:10", endTime: "11:00", kind: "LECTURE" },
        ],
      },
    },
  });

  const math = await db.course.create({
    data: {
      semesterId: semester.id,
      code: "MATH 1301",
      title: "Accelerated Single-Variable Calculus I",
      professor: "Dr. Marcelo Disconzi",
      location: "Stevenson 1310",
      credits: 4,
      color: "#eb6834",
      difficulty: 4,
      targetGrade: "A",
      gradeWeightsJson: JSON.stringify([
        { category: "Midterms", weight: 40 },
        { category: "Final", weight: 30 },
        { category: "WebAssign Homework", weight: 15 },
        { category: "Quizzes", weight: 15 },
      ]),
      officeHoursJson: JSON.stringify([
        { day: "Wed", start: "13:00", end: "14:30", location: "SC 1425" },
      ]),
      meetings: {
        create: [
          { dayOfWeek: 2, startTime: "09:30", endTime: "10:45", kind: "LECTURE" },
          { dayOfWeek: 4, startTime: "09:30", endTime: "10:45", kind: "LECTURE" },
        ],
      },
    },
  });

  const econ = await db.course.create({
    data: {
      semesterId: semester.id,
      code: "ECON 1010",
      title: "Principles of Macroeconomics",
      professor: "Dr. Mario Crucini",
      location: "Wilson 103",
      credits: 3,
      color: "#1baf7a",
      difficulty: 3,
      targetGrade: "A",
      gradeWeightsJson: JSON.stringify([
        { category: "Midterm 1", weight: 20 },
        { category: "Midterm 2", weight: 20 },
        { category: "Final", weight: 35 },
        { category: "Problem Sets", weight: 15 },
        { category: "Participation", weight: 10 },
      ]),
      meetings: {
        create: [
          { dayOfWeek: 1, startTime: "13:25", endTime: "14:15", kind: "LECTURE" },
          { dayOfWeek: 3, startTime: "13:25", endTime: "14:15", kind: "LECTURE" },
          { dayOfWeek: 5, startTime: "13:25", endTime: "14:15", kind: "LECTURE" },
        ],
      },
    },
  });

  const bsci = await db.course.create({
    data: {
      semesterId: semester.id,
      code: "BSCI 1510",
      title: "Introduction to Biological Sciences",
      professor: "Dr. Katherine Friedman",
      location: "Stevenson 4309",
      credits: 4,
      color: "#eda100",
      difficulty: 4,
      gradeWeightsJson: JSON.stringify([
        { category: "Exams", weight: 55 },
        { category: "Lab", weight: 25 },
        { category: "Pre-class Quizzes", weight: 10 },
        { category: "Participation", weight: 10 },
      ]),
      meetings: {
        create: [
          { dayOfWeek: 2, startTime: "13:15", endTime: "14:30", kind: "LECTURE" },
          { dayOfWeek: 4, startTime: "13:15", endTime: "14:30", kind: "LECTURE" },
          { dayOfWeek: 3, startTime: "14:20", endTime: "17:00", kind: "LAB" },
        ],
      },
    },
  });

  const engl = await db.course.create({
    data: {
      semesterId: semester.id,
      code: "ENGL 1250W",
      title: "First-Year Writing Seminar: Technology & Society",
      professor: "Dr. Sarah Passino",
      location: "Benson 200",
      credits: 3,
      color: "#e87ba4",
      difficulty: 2,
      gradeWeightsJson: JSON.stringify([
        { category: "Essays", weight: 60 },
        { category: "Participation", weight: 20 },
        { category: "Presentations", weight: 20 },
      ]),
      meetings: {
        create: [
          { dayOfWeek: 2, startTime: "11:00", endTime: "12:15", kind: "SEMINAR" },
          { dayOfWeek: 4, startTime: "11:00", endTime: "12:15", kind: "SEMINAR" },
        ],
      },
    },
  });

  // ---- Assignments -------------------------------------------------------
  const mk = (data: Parameters<typeof db.assignment.create>[0]["data"]) =>
    db.assignment.create({ data });

  await mk({
    courseId: cs.id, title: "Read: Zybooks Ch. 5 (Loops)", kind: "READING",
    dueAt: day(1, 10, 10), source: "SYLLABUS", estMinutes: 45, importance: 3, difficulty: 2,
  });
  const csPs2 = await mk({
    courseId: cs.id, title: "Problem Set 2 — Control Flow", kind: "PROBLEM_SET",
    dueAt: day(2, 23, 59), source: "BRIGHTSPACE", estMinutes: 120, estMinutesMax: 180,
    importance: 4, difficulty: 3, gradeWeight: 4, status: "IN_PROGRESS",
  });
  await mk({
    courseId: cs.id, title: "Project 1 Milestone — Game of Life design doc", kind: "PROJECT",
    dueAt: day(12, 23, 59), source: "BRIGHTSPACE", estMinutes: 300, estMinutesMax: 420,
    importance: 5, difficulty: 4, gradeWeight: 10, recommendedStartAt: day(5),
  });
  await mk({
    courseId: math.id, title: "WebAssign HW 3 — Limits & Continuity", kind: "HOMEWORK",
    dueAt: day(1, 22, 0), source: "EXTERNAL",
    sourceUrl: "https://webassign.net", estMinutes: 90, importance: 4, difficulty: 4, gradeWeight: 2,
  });
  await mk({
    courseId: econ.id, title: "Read Ch. 4 — Elasticity (pp. 82–101)", kind: "READING",
    dueAt: day(3, 13, 25), source: "SYLLABUS", estMinutes: 60, importance: 3, difficulty: 2,
  });
  await mk({
    courseId: econ.id, title: "Problem Set 2 — Supply & Demand", kind: "PROBLEM_SET",
    dueAt: day(6, 23, 59), source: "SYLLABUS", estMinutes: 135, importance: 4, difficulty: 3, gradeWeight: 3,
  });
  await mk({
    courseId: bsci.id, title: "Pre-lab: Microscopy & cell imaging", kind: "LAB",
    dueAt: day(2, 14, 20), source: "BRIGHTSPACE", estMinutes: 45, importance: 3, difficulty: 2,
  });
  await mk({
    courseId: bsci.id, title: "Read: Campbell Ch. 6 — A Tour of the Cell", kind: "READING",
    dueAt: day(1, 13, 15), source: "SYLLABUS", estMinutes: 75, importance: 3, difficulty: 3,
  });
  const essay = await mk({
    courseId: engl.id, title: "Essay 1 draft — 'Algorithmic feeds and attention'", kind: "ESSAY",
    dueAt: day(8, 11, 0), source: "SYLLABUS", estMinutes: 240, estMinutesMax: 330,
    importance: 4, difficulty: 3, gradeWeight: 15, recommendedStartAt: day(2),
  });

  // ---- Exams -------------------------------------------------------------
  const bsciMidterm = await db.exam.create({
    data: {
      courseId: bsci.id, title: "Midterm 1", kind: "MIDTERM",
      startAt: day(9, 14, 0), location: "Stevenson 4309", weight: 25,
      topicsJson: JSON.stringify([
        "Macromolecules", "Cell structure", "Membranes & transport",
        "Energy & enzymes", "Cellular respiration",
      ]),
      source: "SYLLABUS",
    },
  });
  await db.exam.create({
    data: {
      courseId: math.id, title: "Quiz 2 — Limits", kind: "QUIZ",
      startAt: day(4, 9, 30), weight: 4, source: "SYLLABUS",
      topicsJson: JSON.stringify(["Limit laws", "Continuity", "Squeeze theorem"]),
    },
  });
  await db.exam.create({
    data: {
      courseId: econ.id, title: "Midterm 1", kind: "MIDTERM",
      startAt: day(16, 13, 25), weight: 20, source: "SYLLABUS",
      topicsJson: JSON.stringify([
        "Supply & demand", "Elasticity", "GDP accounting", "Inflation & CPI",
      ]),
    },
  });

  // ---- Topics (knowledge retention) -------------------------------------
  const topicRows: {
    courseId: string; name: string; mastery: string; confusions?: string[];
  }[] = [
    { courseId: bsci.id, name: "Macromolecules", mastery: "NEEDS_REVIEW", confusions: ["Difference between dehydration synthesis and hydrolysis directions"] },
    { courseId: bsci.id, name: "Cell structure", mastery: "REVIEWED" },
    { courseId: bsci.id, name: "Membranes & transport", mastery: "INTRODUCED" },
    { courseId: math.id, name: "Limit laws", mastery: "PRACTICED" },
    { courseId: math.id, name: "Continuity", mastery: "NEEDS_REVIEW", confusions: ["When to use one-sided limits for piecewise continuity"] },
    { courseId: cs.id, name: "Loops & iteration", mastery: "PRACTICED" },
    { courseId: cs.id, name: "Functions & scope", mastery: "REVIEWED" },
    { courseId: econ.id, name: "Supply & demand", mastery: "PRACTICED" },
    { courseId: econ.id, name: "Elasticity", mastery: "INTRODUCED" },
  ];
  for (const t of topicRows) {
    await db.topic.create({
      data: {
        courseId: t.courseId,
        name: t.name,
        mastery: t.mastery,
        confusionsJson: JSON.stringify(t.confusions ?? []),
      },
    });
  }

  // ---- Study plan for the biology midterm (the exemplar) -----------------
  const plan = buildStudyPlan({
    examId: bsciMidterm.id,
    examTitle: "Midterm 1",
    courseCode: "BSCI 1510",
    kind: "MIDTERM",
    startAt: bsciMidterm.startAt,
    weight: 25,
    courseDifficulty: 4,
    topics: ["Macromolecules", "Cell structure", "Membranes & transport", "Energy & enzymes", "Cellular respiration"],
    weakTopics: ["Macromolecules"],
    now,
  });
  for (const s of plan.sessions) {
    await db.workSession.create({
      data: {
        date: s.date, minutes: s.minutes, kind: "EXAM_STUDY",
        focus: s.focus, rationale: s.rationale,
        examId: bsciMidterm.id, courseId: bsci.id,
      },
    });
  }
  await db.exam.update({
    where: { id: bsciMidterm.id },
    data: { planGeneratedAt: now, planRationale: plan.rationale },
  });

  // ---- Work sessions for the big essay (start early) ---------------------
  const essayBlocks = planWorkSessions({
    assignmentId: essay.id, title: "Essay 1 draft",
    estMinutes: 240, dueAt: essay.dueAt as Date, difficulty: 3, now,
  });
  for (const b of essayBlocks) {
    await db.workSession.create({
      data: {
        date: b.date, minutes: b.minutes, kind: "ASSIGNMENT_WORK",
        focus: b.focus, rationale: b.rationale,
        assignmentId: essay.id, courseId: engl.id,
      },
    });
  }

  // A session for today regardless of scheduling: CS problem set push.
  await db.workSession.create({
    data: {
      date: day(0), minutes: 60, kind: "ASSIGNMENT_WORK",
      focus: "Work on CS 1101 Problem Set 2 — finish loop exercises",
      rationale: "Due in 2 days; already in progress.",
      assignmentId: csPs2.id, courseId: cs.id,
    },
  });

  // ---- Calendar events (clubs / career / startup) ------------------------
  const events: Parameters<typeof db.calendarEvent.create>[0]["data"][] = [
    {
      title: "Vanderbilt Investment Club — Fall interest meeting", category: "CLUB",
      startAt: day(1, 19, 0), endAt: day(1, 20, 0), location: "Alumni Hall 201",
      source: "MANUAL", description: "First meeting; applications open this week.",
    },
    {
      title: "Wond'ry Innovation Open House", category: "STARTUP",
      startAt: day(3, 17, 0), endAt: day(3, 19, 0), location: "The Wond'ry",
      source: "MANUAL", description: "Meet mentors; learn about founder programs.",
    },
    {
      title: "Consulting club application deadline", category: "CLUB",
      startAt: day(5, 23, 59), source: "MANUAL",
      description: "Submit resume + short answers.",
    },
    {
      title: "Engineering & STEM Career Fair", category: "CAREER",
      startAt: day(10, 11, 0), endAt: day(10, 15, 0), location: "Student Life Center",
      source: "MANUAL",
    },
    {
      title: "HackVU info session", category: "CLUB",
      startAt: day(5, 18, 0), location: "FGH 134", source: "MANUAL",
    },
  ];
  for (const e of events) await db.calendarEvent.create({ data: e });

  // ---- Tasks (non-course work the Top-5 engine still ranks) --------------
  await db.task.create({
    data: {
      title: "Email Prof. Bodenheimer about VU research openings", category: "RESEARCH",
      dueAt: day(5, 17, 0), estMinutes: 30, importance: 4,
    },
  });
  await db.task.create({
    data: {
      title: "Polish resume for career fair", category: "CAREER",
      dueAt: day(9, 20, 0), estMinutes: 90, importance: 4,
    },
  });
  await db.task.create({
    data: {
      title: "Startup: run 3 customer discovery calls", category: "STARTUP",
      dueAt: day(7, 20, 0), estMinutes: 120, importance: 5, status: "IN_PROGRESS",
    },
  });
  await db.task.create({
    data: {
      title: "Draft consulting club application answers", category: "CLUB",
      dueAt: day(5, 12, 0), estMinutes: 60, importance: 3,
    },
  });

  // ---- Goals -------------------------------------------------------------
  const goals: Parameters<typeof db.goal.create>[0]["data"][] = [
    {
      category: "ACADEMIC", title: "3.8+ GPA this semester", tier: 1, progress: 30,
      milestonesJson: JSON.stringify([
        { title: "No missed assignments in September", done: false },
        { title: "A- or better on all midterms", done: false },
      ]),
    },
    {
      category: "STARTUP", title: "Reach 10 discovery interviews & a validated problem statement", tier: 1, progress: 40,
      targetDate: day(45),
      milestonesJson: JSON.stringify([
        { title: "5 interviews done", done: true },
        { title: "Problem statement v2", done: false },
        { title: "Apply to a Wond'ry program", done: false },
      ]),
    },
    {
      category: "CAREER", title: "Land a finance/tech internship pipeline for sophomore summer", tier: 1, progress: 15,
      milestonesJson: JSON.stringify([
        { title: "Resume reviewed", done: false },
        { title: "10 coffee chats", done: false },
      ]),
    },
    {
      category: "CLUB", title: "Join one investment club and one build-focused org", tier: 2, progress: 20,
    },
    {
      category: "RESEARCH", title: "Find a research lab for spring semester", tier: 2, progress: 10,
    },
  ];
  for (const g of goals) await db.goal.create({ data: g });

  // ---- A seeded conflict (syllabus vs LMS) — never silently resolved -----
  await db.conflict.create({
    data: {
      entityType: "EXAM",
      field: "startAt",
      description: "ECON 1010 Midterm 1 date differs between sources",
      sourceA: "Syllabus (uploaded)",
      valueA: day(16).toISOString().slice(0, 10),
      sourceB: "Brightspace calendar",
      valueB: day(18).toISOString().slice(0, 10),
      suggestion: "Verify with professor before planning study sessions.",
    },
  });

  // ---- Estimate calibration history --------------------------------------
  const records = [
    { courseId: math.id, kind: "HOMEWORK", estimated: 60, actual: 85 },
    { courseId: math.id, kind: "HOMEWORK", estimated: 90, actual: 120 },
    { courseId: math.id, kind: "HOMEWORK", estimated: 75, actual: 100 },
    { courseId: cs.id, kind: "PROBLEM_SET", estimated: 120, actual: 110 },
    { courseId: cs.id, kind: "PROBLEM_SET", estimated: 100, actual: 95 },
  ];
  for (const r of records) {
    await db.timeEstimateRecord.create({
      data: { entityType: "ASSIGNMENT", entityId: "seed", ...r },
    });
  }

  console.log("Seeded: 5 courses, assignments, 3 exams, study plan, events, goals.");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => db.$disconnect());
