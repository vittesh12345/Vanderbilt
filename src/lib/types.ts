// Canonical value sets and shared shapes. The Prisma schema stores these as
// plain strings (SQLite has no enums); this module is the single source of
// truth for what those strings may be.

export const ASSIGNMENT_STATUSES = [
  "NOT_STARTED",
  "IN_PROGRESS",
  "BLOCKED",
  "SUBMITTED",
  "COMPLETED",
  "OVERDUE",
] as const;
export type AssignmentStatus = (typeof ASSIGNMENT_STATUSES)[number];

export const ASSIGNMENT_KINDS = [
  "HOMEWORK",
  "PROBLEM_SET",
  "ESSAY",
  "PROJECT",
  "READING",
  "LAB",
  "DISCUSSION",
  "PRESENTATION",
  "OTHER",
] as const;
export type AssignmentKind = (typeof ASSIGNMENT_KINDS)[number];

export const EXAM_KINDS = ["MIDTERM", "FINAL", "QUIZ", "TEST"] as const;
export type ExamKind = (typeof EXAM_KINDS)[number];

export const SESSION_KINDS = [
  "ASSIGNMENT_WORK",
  "EXAM_STUDY",
  "CLASS_PREP",
  "REVIEW",
] as const;
export type SessionKind = (typeof SESSION_KINDS)[number];

export const EVENT_CATEGORIES = [
  "ACADEMIC",
  "CLUB",
  "CAREER",
  "RESEARCH",
  "STARTUP",
  "PERSONAL",
] as const;
export type EventCategory = (typeof EVENT_CATEGORIES)[number];

export const TASK_STATUSES = [
  "NOT_STARTED",
  "IN_PROGRESS",
  "BLOCKED",
  "COMPLETED",
] as const;
export type TaskStatus = (typeof TASK_STATUSES)[number];

export const MASTERY_LEVELS = [
  "INTRODUCED",
  "REVIEWED",
  "PRACTICED",
  "MASTERED",
  "NEEDS_REVIEW",
] as const;
export type MasteryLevel = (typeof MASTERY_LEVELS)[number];

export const SOURCES = [
  "MANUAL",
  "SYLLABUS",
  "BRIGHTSPACE",
  "EXTERNAL",
  "AI",
] as const;
export type Source = (typeof SOURCES)[number];

// --------------------------------------------------------------------------
// JSON field shapes (stored serialized in *_Json columns)
// --------------------------------------------------------------------------

export interface GradeWeight {
  category: string; // "Exams", "Problem Sets", ...
  weight: number; // percent
}

export interface CourseLink {
  label: string;
  url: string;
  kind: "LMS" | "EXTERNAL" | "GITHUB" | "DOC" | "OTHER";
  authRequired?: boolean;
  notes?: string;
}

export interface OfficeHour {
  day: string; // "Tue"
  start: string; // "14:00"
  end: string; // "15:30"
  location?: string;
  note?: string;
}

export interface CourseMaterial {
  title: string;
  author?: string;
  required: boolean;
  notes?: string;
}

export interface GoalMilestone {
  title: string;
  done: boolean;
  date?: string; // ISO
}

export interface PriorityTiers {
  tier1: string[];
  tier2: string[];
  tier3: string[];
}

// --------------------------------------------------------------------------
// Syllabus extraction — output of src/lib/parsers/syllabus.ts (heuristic)
// optionally refined by src/lib/ai/claude.ts. Every extracted item carries a
// confidence so the review UI can highlight what to double-check.
// --------------------------------------------------------------------------

export type Confidence = "HIGH" | "MEDIUM" | "LOW";

export interface ExtractedDate {
  title: string;
  kind: "ASSIGNMENT" | "EXAM" | "QUIZ" | "READING" | "PROJECT_MILESTONE" | "OTHER";
  date: string; // ISO date (no time) or full ISO datetime
  time?: string; // "23:59" if known
  details?: string;
  confidence: Confidence;
  sourceLine?: string; // the syllabus line this came from, for verification
}

export interface SyllabusExtraction {
  courseInfo: {
    code?: string;
    title?: string;
    professor?: string;
    professorEmail?: string;
    location?: string;
    credits?: number;
    meetingTimes?: string;
  };
  gradeWeights: (GradeWeight & { confidence: Confidence })[];
  dates: ExtractedDate[];
  officeHours: (OfficeHour & { confidence: Confidence })[];
  materials: (CourseMaterial & { confidence: Confidence })[];
  policies: { topic: string; summary: string }[]; // late policy, attendance, ...
  objectives: string[];
  warnings: string[]; // parser notes: ambiguous years, unparsed lines, etc.
  aiUsed: boolean;
}

// --------------------------------------------------------------------------
// Engine outputs
// --------------------------------------------------------------------------

export interface RankedAction {
  id: string; // entity id
  entityType: "ASSIGNMENT" | "EXAM_STUDY" | "TASK" | "SESSION";
  title: string;
  courseCode?: string;
  dueAt?: Date | null;
  estMinutes?: number | null;
  score: number;
  priority: "CRITICAL" | "HIGH" | "MEDIUM" | "LOW";
  reason: string; // human-readable WHY this ranks where it does
}

export type LoadLevel = "LIGHT" | "NORMAL" | "HIGH" | "VERY_HIGH" | "EXTREME";

export interface DayLoad {
  date: Date;
  level: LoadLevel;
  minutes: number; // total planned + due work minutes
  classMinutes: number;
  dueCount: number;
  examCount: number;
  notes: string[]; // "Midterm: BSCI 1510", "PS4 due", ...
}

export interface HeavyWeek {
  start: Date;
  end: Date;
  assignments: number;
  quizzes: number;
  exams: number;
  applications: number;
  recommendations: string[]; // "Start Economics project 5 days early."
}

export interface AlertItem {
  key: string; // stable dedupe key: kind:entityId:dayBucket
  kind:
    | "DUE_TODAY"
    | "DEADLINE_1D"
    | "DEADLINE_3D"
    | "DEADLINE_7D"
    | "OVERDUE"
    | "EXAM_SOON"
    | "HEAVY_WEEK"
    | "CONFLICT"
    | "OVERCOMMITMENT"
    | "NEEDS_REVIEW"
    | "UNPLANNED_EXAM";
  severity: "INFO" | "WARNING" | "URGENT";
  title: string;
  body: string;
  href?: string; // where in the app to act on it
  at?: Date; // the deadline/event the alert refers to
}

export interface StudySessionPlan {
  daysBeforeExam: number; // 0 = exam day
  date: Date;
  minutes: number;
  focus: string;
  rationale: string;
}

export interface StudyPlan {
  examId: string;
  totalMinutes: number;
  rationale: string; // WHY this amount
  sessions: StudySessionPlan[];
}

export interface ClassPrepItem {
  label: string; // "Read Chapter 4, pages 82–101"
  estMinutes?: number;
  kind: "READING" | "REVIEW" | "ASSIGNMENT" | "PRACTICE" | "LOGISTICS";
  sourceId?: string; // assignment id when derived from one
}

export interface ClassPrep {
  courseId: string;
  courseCode: string;
  meetingStart: Date;
  items: ClassPrepItem[];
  totalMinutes: number;
  brief: string; // the 5-minute pre-class brief text
}
