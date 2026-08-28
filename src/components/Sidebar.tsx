"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  Anchor,
  BookOpen,
  Briefcase,
  CalendarDays,
  ClipboardList,
  FlaskConical,
  GraduationCap,
  LayoutDashboard,
  ListChecks,
  MessageSquare,
  PenTool,
  Radar,
  Rocket,
  Settings,
  Sparkles,
  Target,
  Users,
} from "lucide-react";
import clsx from "clsx";

interface NavItem {
  href: string;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  disabled?: boolean;
  phase?: string;
}

const SECTIONS: { title: string; items: NavItem[] }[] = [
  {
    title: "Command",
    items: [
      { href: "/", label: "Today", icon: LayoutDashboard },
      { href: "/week", label: "This Week", icon: ListChecks },
      { href: "/upcoming", label: "Upcoming", icon: Radar },
      { href: "/long-term", label: "Long-Term", icon: Target },
      { href: "/calendar", label: "Calendar", icon: CalendarDays },
      { href: "/chat", label: "Ask College OS", icon: MessageSquare },
    ],
  },
  {
    title: "Academics",
    items: [
      { href: "/courses", label: "Courses", icon: GraduationCap },
      { href: "/assignments", label: "Assignments", icon: ClipboardList },
      { href: "/exams", label: "Exams & Quizzes", icon: BookOpen },
      { href: "/planner", label: "Study Planner", icon: PenTool },
      { href: "/syllabus", label: "Syllabus Intake", icon: Sparkles },
    ],
  },
  {
    title: "Vanderbilt",
    items: [{ href: "/clubs", label: "Clubs", icon: Users }],
  },
  {
    title: "Expansion",
    items: [
      { href: "#", label: "Career", icon: Briefcase, disabled: true, phase: "Phase 3" },
      { href: "#", label: "Research", icon: FlaskConical, disabled: true, phase: "Phase 4" },
      { href: "#", label: "Startup", icon: Rocket, disabled: true, phase: "Phase 5" },
    ],
  },
];

export default function Sidebar() {
  const pathname = usePathname();

  return (
    <aside className="flex h-screen w-60 shrink-0 flex-col border-r border-[var(--border)] bg-[var(--black)] text-white">
      <div className="flex items-center gap-2.5 px-5 py-5">
        <Anchor className="h-6 w-6 text-[var(--gold)]" />
        <div>
          <div className="text-sm font-bold tracking-wide">College OS</div>
          <div className="text-[11px] text-white/50">Vanderbilt Command Center</div>
        </div>
      </div>

      <nav className="thin-scroll flex-1 overflow-y-auto px-3 pb-4">
        {SECTIONS.map((section) => (
          <div key={section.title} className="mb-4">
            <div className="px-2 pb-1.5 pt-2 text-[10px] font-semibold uppercase tracking-widest text-white/40">
              {section.title}
            </div>
            {section.items.map((item) => {
              const active =
                item.href === "/"
                  ? pathname === "/"
                  : !item.disabled && pathname.startsWith(item.href);
              const Icon = item.icon;
              if (item.disabled) {
                return (
                  <div
                    key={item.label}
                    className="flex cursor-not-allowed items-center gap-2.5 rounded-md px-2 py-1.5 text-[13px] text-white/35"
                    title={`${item.label} arrives in ${item.phase} — schema and architecture are already in place.`}
                  >
                    <Icon className="h-4 w-4" />
                    <span className="flex-1">{item.label}</span>
                    <span className="rounded bg-white/10 px-1.5 py-0.5 text-[9px] font-medium">
                      {item.phase}
                    </span>
                  </div>
                );
              }
              return (
                <Link
                  key={item.label}
                  href={item.href}
                  className={clsx(
                    "flex items-center gap-2.5 rounded-md px-2 py-1.5 text-[13px] transition-colors",
                    active
                      ? "bg-[var(--gold)] font-semibold text-[var(--black)]"
                      : "text-white/75 hover:bg-white/10 hover:text-white",
                  )}
                >
                  <Icon className="h-4 w-4" />
                  {item.label}
                </Link>
              );
            })}
          </div>
        ))}
      </nav>

      <div className="border-t border-white/10 px-3 py-3">
        <Link
          href="/settings"
          className={clsx(
            "flex items-center gap-2.5 rounded-md px-2 py-1.5 text-[13px]",
            pathname.startsWith("/settings")
              ? "bg-[var(--gold)] font-semibold text-[var(--black)]"
              : "text-white/75 hover:bg-white/10 hover:text-white",
          )}
        >
          <Settings className="h-4 w-4" />
          Profile & Settings
        </Link>
      </div>
    </aside>
  );
}
