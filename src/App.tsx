import React, { useEffect, useMemo, useState } from "react";
import {
  ArrowLeft,
  ArrowRight,
  ArrowUp,
  ArrowDown,
  ArrowUpRight,
  ArrowDownRight,
  ArrowLeftRight,
  Settings,
  Info,

  Calendar,
  CalendarCheck,
  Check,
  CheckSquare,
  X,
  Ban,
  CigaretteOff,
  WineOff,
  MonitorOff,

  ChevronDown,
  ChevronRight,
  ChevronUp,
  Plus,
  SlidersHorizontal,
  Trash2,
  Pencil,

  Target,
  TrendingUp,

  // Fitness / Body
  Dumbbell,
  Activity,
  Flame,
  Heart,
  Bike,
  Footprints,
  Timer,
  Scale,
  Droplet,
  Gauge,

  // Mind / Balance
  Wind,
  Waves,
  Leaf,
  Sparkles,
  Smile,
  PawPrint,
  Brain,

  // Habits / Routine
  Repeat,
  AlarmClock,
  Moon,
  Sun,
  BedDouble,
  Coffee,
  Apple,
  Utensils,
  Vegan,
  Plane,
  Sunrise,

  // Work / Study
  Briefcase,
  ClipboardCheck,
  ListChecks,
  BookOpen,
  Book,
  GraduationCap,
  Code,

  // Money
  DollarSign,
  CreditCard,
  PiggyBank,
  Wallet,

  // Creativity / Fun
  Music,
  Headphones,
  Camera,
  PenTool,
  Palette,
  Trophy,
  Zap,
  Star,
  BarChart3,
  LineChart as LineChartIcon,
} from "lucide-react";

import {
  CartesianGrid,
  Line,
  LineChart,
  Bar,
  BarChart,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";


// -------------------------
// Helpers
// -------------------------

const LS_KEY = "goals-tracker:v2";
const SETTINGS_KEY = "goals-tracker:settings:v1";

function buildExportBundle(goals: any, settings?: any) {
  return {
    version: 1,
    exportedAt: new Date().toISOString(),
    goals,
    settings: settings ?? null,
  };
}

function sumNumericRecords(records: any[]) {
  return (records || [])
    .map((r) => Number(r?.value))
    .filter((v) => Number.isFinite(v))
    .reduce((a, b) => a + b, 0);
}

function goalHasUnit(goal: any) {
  return String(goal?.unit || "").trim().length > 0;
}

function goalHasTarget(goal: any) {
  return goal?.targetNumber != null && Number.isFinite(Number(goal.targetNumber));
}

function isCheckInGoal(goal: any) {
  const hasUnit = goalHasUnit(goal);
  const hasTarget = goalHasTarget(goal);
  const hasStart = goal?.startingNumber != null && Number.isFinite(Number(goal.startingNumber));
  // Only a check-in if the user provided NO numeric intent at all
  return !hasUnit && !hasTarget && !hasStart;
}

function uid() {
  return Math.random().toString(16).slice(2) + Date.now().toString(16);
}

function clamp01(x: number) {
  if (Number.isNaN(x)) return 0;
  return Math.max(0, Math.min(1, x));
}

function isoToday() {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d.toISOString();
}

function toISODateOnly(iso: string) {
  const d = new Date(iso);
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

function fromISODateOnly(dateOnly: string): string | null {
  const s = String(dateOnly || "").trim();

  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return null;

  const d = new Date(s + "T12:00:00.000Z");
  if (!Number.isFinite(d.getTime())) return null;

  return d.toISOString();
}

function addDaysDateOnly(dateOnly: string, deltaDays: number) {
  const iso = fromISODateOnly(dateOnly);
  if (!iso) return toISODateOnly(isoToday()); // or return dateOnly to be “no-op”
  const dt = new Date(iso);
  dt.setDate(dt.getDate() + deltaDays);
  return toISODateOnly(dt.toISOString());
}

function computeStreakDays(records: RecordItem[]) {
  if (!records || records.length === 0) return 0;

  // Track which days have at least one record
  const hasRecordThatDay = new Set<string>();
  for (const r of records) {
    hasRecordThatDay.add(toISODateOnly(r.date));
  }

  // Streak is consecutive days ending today where each day has 1+ records
  const today = toISODateOnly(isoToday());
  if (!hasRecordThatDay.has(today)) return 0;

  let streak = 0;
  let dayCursor = today;

  while (hasRecordThatDay.has(dayCursor)) {
    streak += 1;
    dayCursor = addDaysDateOnly(dayCursor, -1);
  }

  return streak;
}

function daysBetweenDateOnly(a: string, b: string) {
  const ia = fromISODateOnly(a);
  const ib = fromISODateOnly(b);
  if (!ia || !ib) return 0;
  const da = new Date(ia);
  const db = new Date(ib);
  return Math.round((db.getTime() - da.getTime()) / (24 * 60 * 60 * 1000));
}

function getRemainingToTarget(goal: Goal) {
  if (goal.targetNumber == null) return null;

  const stats = computeProgress(goal);
  if (stats.current == null || stats.target == null) return null;

  // For cumulative goals, "current" in computeProgress may not reflect total,
  // but your UI uses total = startingNumber + sumNumericRecords.
  // So use that when cumulative is on.
  const current = goal.cumulative
    ? (goal.startingNumber ?? 0) + sumNumericRecords(goal.records || [])
    : stats.current;

  const target = goal.targetNumber;

  const dir = inferDirection(goal);
  const remaining = dir === "increase" ? target - current : current - target;

  return Number.isFinite(remaining) ? remaining : null;
}

function formatDisplayDate(iso: string) {
  const d = new Date(iso);
  const month = d.toLocaleString("en-GB", { month: "short" });
  const day = d.getDate();
  const year = d.getFullYear();
  return `${month} ${day}, ${year}`;
}

function formatDayShort(iso: string) {
  return new Date(iso).toLocaleString("en-GB", { weekday: "short" });
}

type RecordItem = {
  id: string;
  date: string;        // ISO
  value?: number;      // only for numeric goals
  note?: string;       // for both, required for check-ins
};

type ChartMode = "line" | "bar";

type Goal = {
  id: string;
  iconKey: string;
  iconType?: string;
  name: string;
  note: string;
  targetDate: string | null;
  startDate: string;
  targetNumber: number | null;
  startingNumber: number | null;
  startingAuto?: boolean;
  unit: string;
  colour: string;
  records: RecordItem[];
  order: number;
  reachedAt: string | null;
  cumulative?: boolean;
  // User-selected chart style for this goal.
  // If missing, we will choose a default based on target and cumulative.
  chartMode?: ChartMode | null;
  // Calendar planning (used by Calendar screen)
  planEnabled?: boolean;        // if false, goal does not appear on calendar
  planPerWeek?: number;         // 1-7
  planDays?: number[];          // 0-6 (Mon-Sun)
  calendarName?: string;        // optional label shown in calendar (defaults to goal name)
  planInterval?: "weekly" | "fortnightly" | "monthly";
};



function sortByDateAsc(records: RecordItem[]) {
  return [...records].sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
}

function sortByDateDesc(records: RecordItem[]) {
  return [...records].sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
}

function firstLine(text: string) {
  if (!text) return "";
  const t = String(text).trim();
  const idx = t.indexOf("\n");
  return idx >= 0 ? t.slice(0, idx) : t;
}

function latestNumericValue(records: RecordItem[], fallback: number | null) {
  if (!records || records.length === 0) return fallback;

  const sorted = sortByDateDesc(records);
  for (const r of sorted) {
    const v = Number((r as any).value);
    if (Number.isFinite(v)) return v;
  }
  return fallback;
}

function firstNumericRecordedValue(records: RecordItem[]) {
  if (!records || records.length === 0) return null;

  const sorted = sortByDateAsc(records);
  for (const r of sorted) {
    const v = Number((r as any).value);
    if (Number.isFinite(v)) return v;
  }
  return null;
}

// If start (explicit or inferred first record) is higher than target, assume lower is better.
function inferDirection(goal: Pick<Goal, "targetNumber" | "startingNumber" | "records">) {
  const startCandidate = goal.startingNumber != null ? goal.startingNumber : firstNumericRecordedValue(goal.records || []);
  if (startCandidate == null) return "increase";
  return startCandidate > goal.targetNumber ? "decrease" : "increase";
}

function computeProgress(goal: Pick<Goal, "targetNumber" | "startingNumber" | "records">) {
  const records = goal.records || [];
  const recordCount = records.length;

  const hasTarget = goal.targetNumber != null && Number.isFinite(Number(goal.targetNumber));
  const hasStart = goal.startingNumber != null && Number.isFinite(Number(goal.startingNumber));

  const numericRecords = records.filter((r: any) => Number.isFinite(Number(r.value)));
  const hasNumericRecords = numericRecords.length > 0;

  const current =
    hasNumericRecords
      ? latestNumericValue(records, hasStart ? (goal.startingNumber as number) : null)
      : hasStart
        ? (goal.startingNumber as number)
        : null;

  // No target -> no progress calculation, just allow "current" display
  if (!hasTarget) {
    return {
      dir: "increase" as const,
      start: hasStart ? (goal.startingNumber as number) : null,
      current,
      target: null,
      progress01: 0,
      reached: false,
      recordCount,
    };
  }

  // Target exists but we still have nothing to compare against
  if (!hasStart && !hasNumericRecords) {
    return {
      dir: "increase" as const,
      start: null,
      current: null,
      target: Number(goal.targetNumber),
      progress01: 0,
      reached: false,
      recordCount,
    };
  }

  // We have a baseline (either explicit start, or first record)
  const start = hasStart ? Number(goal.startingNumber) : Number(firstNumericRecordedValue(records));
  const target = Number(goal.targetNumber);
  const dir = start > target ? ("decrease" as const) : ("increase" as const);

  let progress01 = 0;
  let reached = false;

  if (dir === "increase") {
    const denom = target - start;
    progress01 = denom === 0 ? 0 : ((current as number) - start) / denom;
    reached = (current as number) >= target;
  } else {
    const denom = start - target;
    progress01 = denom === 0 ? 0 : (start - (current as number)) / denom;
    reached = (current as number) <= target;
  }

  return {
    dir,
    start,
    current,
    target,
    progress01: clamp01(progress01),
    reached,
    recordCount,
  };
}

function updateStartingNumber(goal: Pick<Goal, "startingNumber" | "targetNumber" | "records">, value: number) {
  const dir = inferDirection(goal);
  if (goal.startingNumber == null) return value;
  if (dir === "increase") return value < goal.startingNumber ? value : goal.startingNumber;
  return value > goal.startingNumber ? value : goal.startingNumber;
}




// -------------------------
// Units + Colours
// -------------------------
const UNIT_GROUPS = [
  { title: "Weight", items: ["lbs", "kg"] },
  { title: "Distance", items: ["km", "miles"] },
  { title: "Height", items: ["ft", "inches", "cm"] },
  { title: "Volume", items: ["cups", "litres"] },
  { title: "Other", items: ["repetitions", "seconds", "minutes", "hours"] },
];

const ALL_UNITS = Array.from(
  new Set(UNIT_GROUPS.flatMap((g) => g.items))
);

const COLOURS = [
  { name: "Sky", value: "#0EA5E9" },
  { name: "Blue", value: "#2563EB" },
  { name: "Teal", value: "#14B8A6" },
  { name: "Emerald", value: "#10B981" },
  { name: "Indigo", value: "#6366F1" },
  { name: "Orange", value: "#F97316" },
  { name: "Rose", value: "#F43F5E" },
  { name: "Slate", value: "#64748B" },
];

const COLOUR_OPTIONS = [
  "#FF0000", "#FB7185", "#FFC0CB", "#FBCFE8", "#E9D5FF", "#C084FC", "#800080", "#A855F7",
  "#4F46E5", "#818CF8", "#C7D2FE", "#BFDBFE", "#BAE6FD", "#ADD8E6", "#00FFFF", "#99F6E4",
  "#7FFFD4", "#A7F3D0", "#BBF7D0", "#4ADE80", "#22C55E", "#00FF00", "#008000", "#808000",
  "#FDE68A", "#FACC15", "#FFFF00", "#FED7AA", "#FB923C", "#FFA500", "#A52A2A", "#800000",
  "#C0C0C0", "#CBD5E1", "#808080", "#57534E", "#1F2937", "#0F172A", "#000000", "#FFFFFF",
];

const GOAL_ICONS = [
  // Core
  { key: "Target", label: "Goal", Icon: Target },
  { key: "TrendingUp", label: "Progress", Icon: TrendingUp },
  { key: "CheckSquare", label: "Complete", Icon: CheckSquare },

  // Arrows / Direction
  { key: "ArrowUp", label: "Increase", Icon: ArrowUp },
  { key: "ArrowDown", label: "Decrease", Icon: ArrowDown },
  { key: "ArrowRight", label: "Forward", Icon: ArrowRight },
  { key: "ArrowUpRight", label: "Growth", Icon: ArrowUpRight },
  { key: "ArrowLeftRight", label: "Balance", Icon: ArrowLeftRight },

  // Quit / Stop / Reduce
  { key: "X", label: "Stop", Icon: X },
  { key: "Ban", label: "Quit", Icon: Ban },
  { key: "CigaretteOff", label: "Quit Smoking", Icon: CigaretteOff },
  { key: "WineOff", label: "Quit Drinking", Icon: WineOff },
  { key: "MonitorOff", label: "Quit TV", Icon: MonitorOff },

  // Fitness / Health
  { key: "Dumbbell", label: "Strength", Icon: Dumbbell },
  { key: "Activity", label: "Activity", Icon: Activity },
  { key: "Flame", label: "Streak", Icon: Flame },
  { key: "Heart", label: "Heart", Icon: Heart },
  { key: "Bike", label: "Cycling", Icon: Bike },
  { key: "Footprints", label: "Steps", Icon: Footprints },
  { key: "Timer", label: "Time", Icon: Timer },
  { key: "Scale", label: "Weight", Icon: Scale },
  { key: "Droplet", label: "Hydration", Icon: Droplet },
  { key: "Gauge", label: "Speed", Icon: Gauge },

  // Mind / Balance
  { key: "Wind", label: "Breathing", Icon: Wind },
  { key: "Waves", label: "Flow", Icon: Waves },
  { key: "Leaf", label: "Wellbeing", Icon: Leaf },
  { key: "Sparkles", label: "Mindfulness", Icon: Sparkles },
  { key: "Smile", label: "Positivity", Icon: Smile },
  { key: "PawPrint", label: "Animal", Icon: PawPrint },
  { key: "Brain", label: "Mind", Icon: Brain },

  // Habits / Routine
  { key: "Repeat", label: "Routine", Icon: Repeat },
  { key: "AlarmClock", label: "Wake up", Icon: AlarmClock },
  { key: "Moon", label: "Sleep", Icon: Moon },
  { key: "Sun", label: "Morning", Icon: Sun },
  { key: "BedDouble", label: "Rest", Icon: BedDouble },
  { key: "Coffee", label: "Coffee", Icon: Coffee },
  { key: "Apple", label: "Nutrition", Icon: Apple },
  { key: "Utensils", label: "Meals", Icon: Utensils },
  { key: "Vegan", label: "Plant Based", Icon: Vegan },
  { key: "Plane", label: "Travel", Icon: Plane },
  { key: "Sunrise", label: "Wake Early", Icon: Sunrise },

  // Work / Study
  { key: "Briefcase", label: "Work", Icon: Briefcase },
  { key: "ClipboardCheck", label: "Tasks", Icon: ClipboardCheck },
  { key: "ListChecks", label: "Checklist", Icon: ListChecks },
  { key: "BookOpen", label: "Study", Icon: BookOpen },
  { key: "Book", label: "Reading", Icon: Book },
  { key: "GraduationCap", label: "Learning", Icon: GraduationCap },
  { key: "Code", label: "Programming", Icon: Code },


  // Money
  { key: "DollarSign", label: "Money", Icon: DollarSign },
  { key: "CreditCard", label: "Spending", Icon: CreditCard },
  { key: "PiggyBank", label: "Saving", Icon: PiggyBank },
  { key: "Wallet", label: "Budget", Icon: Wallet },

  // Creativity / Fun
  { key: "Music", label: "Music", Icon: Music },
  { key: "Headphones", label: "Audio", Icon: Headphones },
  { key: "Camera", label: "Photo", Icon: Camera },
  { key: "PenTool", label: "Writing", Icon: PenTool },
  { key: "Palette", label: "Art", Icon: Palette },
  { key: "Trophy", label: "Achievement", Icon: Trophy },
  { key: "Zap", label: "Energy", Icon: Zap },
  { key: "Star", label: "Favourite", Icon: Star },
];



function getIconByKey(key) {
  return GOAL_ICONS.find((x) => x.key === key) || GOAL_ICONS[0];
}

function normaliseColour(c: string) {
  return c || COLOURS[0].value;
}

// -------------------------
// UI Primitives
// -------------------------

const Req = ({ children }: { children: React.ReactNode }) => (
  <span className="inline-flex items-center gap-1">
    <span>{children}</span>
    <span className="text-red-500 text-xs leading-none">*</span>
  </span>
);

function AppShell({
  title,
  left,
  right,
  children,
}: {
  title: string;
  left: React.ReactNode;
  right: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <div className="min-h-screen bg-slate-50 text-slate-900">
      <div className="mx-auto max-w-md">
        <div className="sticky top-0 z-20 bg-slate-50/90 backdrop-blur border-b border-slate-100">
          <div className="h-14 px-4 flex items-center justify-between">
            <div className="w-10 flex items-center justify-start">{left}</div>
            <div className="font-semibold">{title}</div>
            <div className="w-10 flex items-center justify-end">{right}</div>
          </div>
        </div>
        <div
          className="px-4 py-4"
          style={{ paddingBottom: "calc(6rem + env(safe-area-inset-bottom))" }}
        >
          {children}
        </div>
      </div>
    </div>
  );
}

function BottomTabs({
  tab,
  setTab,
}: {
  tab: "goals" | "progress" | "calendar";
  setTab: (t: "goals" | "progress" | "calendar") => void;
}) {
  const itemClass = (active: boolean) =>
    `flex flex-col items-center justify-center text-xs leading-tight ${
      active ? "text-sky-600" : "text-slate-400"
    }`;

  return (
    <div className="fixed bottom-0 left-0 right-0 z-30">
      <div
        className="mx-auto max-w-md bg-white border-t border-slate-200"
        style={{
          paddingBottom: "env(safe-area-inset-bottom)",
          minHeight: "calc(64px + env(safe-area-inset-bottom))",
        }}
      >
        <div className="h-16 flex items-center justify-around">
          <button className={itemClass(tab === "calendar")} onClick={() => setTab("calendar")}>
            <div className="w-9 h-8 rounded-xl flex items-center justify-center -mb-0.5">
              <Calendar className="w-5 h-5" />
            </div>
            <span>Calendar</span>
          </button>

          <button className={itemClass(tab === "goals")} onClick={() => setTab("goals")}>
            <div className="w-9 h-8 rounded-xl flex items-center justify-center -mb-0.5">
              <Target className="w-5 h-5 text-slate-500" />
            </div>
            <span>Goals</span>
          </button>

          <button className={itemClass(tab === "progress")} onClick={() => setTab("progress")}>
            <div className="w-9 h-8 rounded-xl flex items-center justify-center -mb-0.5">
              <TrendingUp className="w-5 h-5" />
            </div>
            <span>Progress</span>
          </button>
        </div>
      </div>
    </div>
  );
}

function PrimaryButton({
  children,
  onClick,
  disabled,
  iconLeft,
}: {
  children: React.ReactNode;
  onClick: () => void;
  disabled?: boolean;
  iconLeft?: React.ReactNode;
}) {
  return (
    <button
      disabled={disabled}
      onClick={onClick}
      className={`w-full h-12 rounded-xl font-semibold flex items-center justify-center gap-2 ${
        disabled ? "bg-slate-200 text-slate-400" : "bg-sky-500 text-white active:scale-[0.99]"
      }`}
    >
      {iconLeft ? <span className="opacity-90">{iconLeft}</span> : null}
      {children}
    </button>
  );
}

function Card({ children, onClick }: { children: React.ReactNode; onClick?: () => void }) {
  return (
    <div
      className={`bg-white border border-slate-100 rounded-2xl shadow-sm ${onClick ? "cursor-pointer active:scale-[0.995]" : ""}`}
      onClick={onClick}
    >
      {children}
    </div>
  );
}

function Modal({
  open,
  title,
  onClose,
  children,
  footer,
}: {
  open: boolean;
  title: string;
  onClose: () => void;
  children: React.ReactNode;
  footer?: React.ReactNode;
}) {
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-40">
      <div className="absolute inset-0 bg-black/30" onClick={onClose} />
      <div className="absolute inset-x-0 top-0 bottom-0 flex items-end justify-center">
        <div className="w-full max-w-md rounded-t-3xl bg-slate-50 border border-slate-200 shadow-xl">
          <div className="px-4 pt-4 pb-3 flex items-center justify-between">
            <div className="text-base font-semibold">{title}</div>
            <button className="text-sky-600 font-semibold" onClick={onClose} aria-label="Close">
              Done
            </button>
          </div>
          <div className="px-4 pb-4 max-h-[70vh] overflow-y-auto overflow-x-hidden touch-pan-y overscroll-contain">
            {children}
          </div>
          {footer ? <div className="px-4 pb-5">{footer}</div> : null}
        </div>
      </div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-2">
      <div className="text-sm text-slate-500">{label}</div>
      {children}
    </div>
  );
}

function Input({
  value,
  onChange,
  placeholder,
  type = "text",
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  type?: string;
}) {
  const isDate = type === "date";

  return (
    <input
      type={type}
      value={value}
      placeholder={placeholder}
      onChange={(e) => onChange(e.target.value)}
      className={[
        "w-full min-w-0 h-12 px-4 rounded-2xl bg-white border border-slate-200 outline-none focus:border-sky-400",
        isDate ? "appearance-none text-sm" : "",
      ].join(" ")}
    />
  );
}

function TextArea({
  value,
  onChange,
  placeholder,
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
}) {
  return (
    <textarea
      value={value}
      placeholder={placeholder}
      onChange={(e) => onChange(e.target.value)}
      className="w-full min-h-20 p-4 rounded-2xl bg-white border border-slate-200 outline-none focus:border-sky-400"
    />
  );
}

function SelectRow({ label, display, placeholder = "Select", onClick, muted, leftIcon }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="w-full h-12 px-4 rounded-2xl bg-white border border-slate-200 flex items-center justify-between"
    >
      <span className="flex items-center gap-2 min-w-0">
        {leftIcon ? <span className="text-slate-500">{leftIcon}</span> : null}

        {/* Left aligned selected value (or blank) */}
        <span className={`text-sm truncate ${display ? "text-slate-700" : "text-slate-400"}`}>
          {display || ""}
        </span>
      </span>

      {/* Right side keeps the constant label */}
      <span className="flex items-center gap-2">
        <span className={`text-sm ${muted ? "text-slate-400" : "text-slate-500"}`}>{label || placeholder}</span>
        <ChevronDown className="w-4 h-4 text-slate-400" />
      </span>
    </button>
  );
}


function ProgressBar({ value01, colour }: { value01: number; colour: string }) {
  return (
    <div className="w-full h-2 rounded-full bg-slate-100 overflow-hidden">
      <div className="h-full" style={{ width: `${Math.round(value01 * 100)}%`, backgroundColor: normaliseColour(colour) }} />
    </div>
  );
}

function IconBadge({ iconKey, colour }: { iconKey: string; colour?: string }) {
  const { Icon } = getIconByKey(iconKey);
  const c = normaliseColour(colour || "");
  return (
    <div className="w-10 h-10 rounded-2xl bg-slate-50 border border-slate-100 flex items-center justify-center">
      <Icon className="w-5 h-5" style={{ color: c }} />
    </div>
  );
}


function Kebab({ onClick }: { onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className="w-9 h-9 rounded-xl flex items-center justify-center text-slate-400 hover:text-slate-600"
      aria-label="More"
    >
      <span className="text-xl leading-none">⋯</span>
    </button>
  );
}

function ColourPickerRow({ value, onChange }) {
  const current = normaliseColour(value);
  const swatches = COLOURS.slice(0, 6);

  return (
    <div className="bg-white border border-slate-200 rounded-2xl p-3">
      <div className="flex items-center justify-between">
        <div className="text-sm text-slate-700">Progress colour</div>

        <label className="w-11 h-11 rounded-2xl border border-slate-200 bg-white flex items-center justify-center cursor-pointer">
          <input
            type="color"
            value={current}
            onChange={(e) => onChange(e.target.value)}
            className="opacity-0 w-0 h-0"
            aria-label="Pick colour"
          />
          <div className="w-6 h-6 rounded-full" style={{ backgroundColor: current }} />
        </label>
      </div>

      <div className="mt-3 grid grid-cols-6 gap-2">
        {swatches.map((c) => {
          const selected = current.toLowerCase() === c.value.toLowerCase();
          return (
            <button
              key={c.value}
              type="button"
              onClick={() => onChange(c.value)}
              className={`h-9 rounded-xl border ${selected ? "border-slate-900" : "border-slate-200"} bg-white flex items-center justify-center`}
              aria-label={c.name}
              title={c.name}
            >
              <div className="w-5 h-5 rounded-full" style={{ backgroundColor: c.value }} />
            </button>
          );
        })}
      </div>
    </div>
  );
}

// -------------------------
// Main App
// -------------------------

type Route = { name: "home" } | { name: "tracking"; goalId: string };
type Location = { tab: "goals" | "progress" | "calendar"; route: Route };

export default function App() {
  const [tab, setTab] = useState<"goals" | "progress" | "calendar">("goals");
  const [goals, setGoals] = useState<Goal[]>([]);
  const [route, setRoute] = useState<Route>({ name: "home" });
  const [goalFormError, setGoalFormError] = useState(""); // for date warning etc
  const [customUnits, setCustomUnits] = useState([]);
  const [cardMenu, setCardMenu] = useState({ open: false, goalId: null });
  const [settingsModal, setSettingsModal] = useState(false);
  const [cumulativeInfo, setCumulativeInfo] = useState(false);
  const [hideCompletedGoals, setHideCompletedGoals] = useState(false);
  const navStackRef = React.useRef<Location[]>([]);
  const editReturnRef = React.useRef<Location | null>(null);
  const [moreOptionsOpen, setMoreOptionsOpen] = useState(false);
  const [celebration, setCelebration] = useState<{
    open: boolean;
    title: string;
    message: string;
  }>({ open: false, title: "", message: "" });
  useEffect(() => {
    try {
      const raw = localStorage.getItem("goals-tracker:hide-completed");
      if (raw != null) setHideCompletedGoals(raw === "true");
    } catch {}
  }, []);

  useEffect(() => {
    try {
      localStorage.setItem("goals-tracker:hide-completed", String(hideCompletedGoals));
    } catch {}
  }, [hideCompletedGoals]);
  const fileInputRef = React.useRef<HTMLInputElement | null>(null);

  function exportData() {
    const rawGoals = goals; // or orderedGoals, but better to export the canonical state you save
    const rawSettings = (() => {
      try {
        const s = localStorage.getItem(SETTINGS_KEY);
        return s ? JSON.parse(s) : null;
      } catch {
        return null;
      }
    })();

    const bundle = buildExportBundle(rawGoals, rawSettings);

    const blob = new Blob([JSON.stringify(bundle, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);

    const a = document.createElement("a");
    a.href = url;
    a.download = `goals-tracker-export-${new Date().toISOString().slice(0, 10)}.json`;
    document.body.appendChild(a);
    a.click();
    a.remove();

    URL.revokeObjectURL(url);
  }

  function openImportPicker() {
    fileInputRef.current?.click();
  }

  function isValidBundle(data: any) {
    if (!data || typeof data !== "object") return false;
    if (!("goals" in data)) return false;
    if (!Array.isArray(data.goals)) return false;
    return true;
  }

  async function handleImportFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = ""; // allows re-importing the same file
    if (!file) return;

    const text = await file.text();
    let data: any;
    try {
      data = JSON.parse(text);
    } catch {
      alert("That file is not valid JSON.");
      return;
    }

    if (!isValidBundle(data)) {
      alert("That file does not look like a Goals Tracker export.");
      return;
    }

    // Replace everything (simplest + safest)
    setGoals(data.goals);

    // If you have settings persisted, restore them too
    if (data.settings != null) {
      try {
        localStorage.setItem(SETTINGS_KEY, JSON.stringify(data.settings));
        // If you also keep settings in React state, set it here too:
        // setSettings(data.settings);
      } catch {
        // ignore
      }
    }

    alert("Import complete.");
  }



  // Modals
  const [goalModal, setGoalModal] = useState<{ open: boolean; mode: "create" | "edit"; goalId: string | null }>(
    { open: false, mode: "create", goalId: null }
  );
  const [unitsModal, setUnitsModal] = useState<{ open: boolean; selected: string | null; custom: string }>(
    { open: false, selected: null, custom: "" }
  );
  const [recordModal, setRecordModal] = useState<{ open: boolean; goalId: string | null }>({ open: false, goalId: null });
  const [manageModal, setManageModal] = useState<{ open: boolean }>({ open: false });
  const [confirmDelete, setConfirmDelete] = useState<{ open: boolean; goalId: string | null }>({ open: false, goalId: null });
  const [calendarRemove, setCalendarRemove] = useState<{
    open: boolean;
    goalId: string | null;
    dateOnly: string;
  }>({ open: false, goalId: null, dateOnly: toISODateOnly(isoToday()) });
  const [confirmComplete, setConfirmComplete] = useState({ open: false, goalId: null as string | null });
  const [congrats, setCongrats] = useState<{ open: boolean; goalId: string | null }>({ open: false, goalId: null });
  const [draftGoal, setDraftGoal] = useState(() => emptyGoalDraft());
  const [draftRecord, setDraftRecord] = useState({
    value: "",
    note: "",
    dateOnly: toISODateOnly(isoToday()),
  });
  const [duplicateGoalModal, setDuplicateGoalModal] = useState<{
    open: boolean;
    sourceGoalId: string | null;
    name: string;
  }>({ open: false, sourceGoalId: null, name: "" });

  useEffect(() => {
    // Load goals
    try {
      const raw = localStorage.getItem(LS_KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed)) {
        setGoals(
          parsed.map((g: any) => ({
            ...g,
            iconKey: g.iconKey || g.iconValue || "Target",
            targetDate: g.targetDate ?? null,
          }))
        );
      }

      }
    } catch {}

    // Load custom units
    try {
      const rawUnits = localStorage.getItem("goals-tracker:custom-units");
      if (rawUnits) {
        const parsedUnits = JSON.parse(rawUnits);
        if (Array.isArray(parsedUnits)) setCustomUnits(parsedUnits);
      }
    } catch {}
  }, []);

  useEffect(() => {
    try {
      localStorage.setItem(LS_KEY, JSON.stringify(goals));
    } catch {
      // ignore
    }
  }, [goals]);
    useEffect(() => {
    try {
      localStorage.setItem("goals-tracker:custom-units", JSON.stringify(customUnits));
    } catch {}
  }, [customUnits]);

  const orderedGoals = useMemo(() => {
    return [...goals].sort((a, b) => {
      const aDone = !!a.reachedAt;
      const bDone = !!b.reachedAt;

      if (aDone !== bDone) return aDone ? 1 : -1; // incomplete first

      // within each group, keep your existing ordering
      return (a.order ?? 0) - (b.order ?? 0);
    });
  }, [goals]);

  useEffect(() => {
    if (route.name === "home") return;
    if (route.name === "tracking" && tab !== "goals") setTab("goals");
  }, [route, tab]);

  function openCardMenu(goalId) {
  setCardMenu({ open: true, goalId });
  }

  function closeCardMenu() {
    setCardMenu({ open: false, goalId: null });
  }

  function goHomeGoals() {
    setRoute({ name: "home" });
    setTab("goals");
  }

  function pushNav() {
    navStackRef.current = [...navStackRef.current, { tab, route }];
  }

  function popNav() {
    const stack = navStackRef.current;
    const prev = stack[stack.length - 1] || null;
    navStackRef.current = stack.slice(0, -1);

    if (prev) {
      setTab(prev.tab);
      setRoute(prev.route);
      return;
    }

    setRoute({ name: "home" });
  }

  function emptyGoalDraft() {
    return {
      iconKey: "Target",
      name: "",
      note: "",
      startDateOnly: toISODateOnly(isoToday()),
      targetDateOnly: "",
      targetNumber: "",
      startingNumber: "",
      unit: "",
      colour: COLOUR_OPTIONS[0],
      cumulative: false,

      // Calendar planning defaults
      planEnabled: false,
      planInterval: null as any, // or: null as ("weekly" | "fortnightly" | "monthly" | null)
      planDays: [],
      calendarName: "",
    };
  }

  function selectUnit(u: string) {
  const unit = String(u || "").trim();
  if (!unit) return;
  setUnitsModal((s) => ({ ...s, selected: unit, custom: "" }));
  }

  function addCustomUnit() {
    const v = String(unitsModal.custom || "").trim();
    if (!v) return;

    setCustomUnits((prev: string[]) => {
      const exists = prev.some((x) => String(x).toLowerCase() === v.toLowerCase());
      return exists ? prev : [...prev, v];
    });

    setUnitsModal((s) => ({ ...s, selected: v, custom: "" }));
  }

  function deleteCustomUnit(u: string) {
    setCustomUnits((prev: string[]) => prev.filter((x) => x !== u));
    setUnitsModal((s) => (s.selected === u ? { ...s, selected: null } : s));
  }

  function saveUnitSelection() {
    const picked = String(unitsModal.selected || "").trim();
    if (!picked) return;

    setDraftGoal((d) => ({ ...d, unit: picked }));
    setUnitsModal({ open: false, selected: null, custom: "" });
  }

  function openCreateGoal() {
    setDraftGoal(emptyGoalDraft());
    setMoreOptionsOpen(false);
    setGoalModal({ open: true, mode: "create", goalId: null });
  }

  function openEditGoal(goal) {
    setMoreOptionsOpen(false);

    // remember where we came from (Goals, Progress, Calendar, or Tracking)
    editReturnRef.current = { tab, route };

    setDraftGoal({
      iconKey: goal.iconKey || "Target",
      name: goal.name || "",
      note: goal.note || "",
      targetDateOnly: goal.targetDate ? toISODateOnly(goal.targetDate) : "",
      startDateOnly: toISODateOnly(goal.startDate || isoToday()),
      targetNumber: String(goal.targetNumber ?? ""),
      startingNumber: goal.startingNumber == null ? "" : String(goal.startingNumber),
      unit: goal.unit || "",
      colour: goal.colour || COLOUR_OPTIONS[0],
      cumulative: Boolean(goal.cumulative),
      planEnabled: Boolean(goal.planEnabled),
      planInterval: goal.planInterval === "weekly" || goal.planInterval === "fortnightly" || goal.planInterval === "monthly" ? goal.planInterval : null,
      planDays: Array.isArray(goal.planDays) ? goal.planDays : [],
      calendarName: String(goal.calendarName || ""),
    });

    setGoalModal({ open: true, mode: "edit", goalId: goal.id });
  }

  function openUnitsPicker(currentUnit?: string) {
    const current = String(currentUnit ?? draftGoal.unit ?? "").trim();
    setUnitsModal({ open: true, selected: current || null, custom: "" });
  }

  function pickUnit(u) {
  const unit = String(u || "").trim();
  if (!unit) return;
  setDraftGoal((d) => ({ ...d, unit }));
  setUnitsModal({ open: false, selected: null, custom: "" });
}


  function saveGoalFromDraft() {
    const name = String(draftGoal.name || "").trim();
    const note = String(draftGoal.note || "").trim();

    if (!name) return;

    const startDate = fromISODateOnly(draftGoal.startDateOnly);
    if (!startDate) {
      setGoalFormError("Please enter a valid start date.");
      return;
    }

    const targetDate =
      String(draftGoal.targetDateOnly || "").trim() === ""
        ? null
        : fromISODateOnly(draftGoal.targetDateOnly);

    if (draftGoal.targetDateOnly && !targetDate) {
      setGoalFormError("Please enter a valid target date.");
      return;
    }

    // target number optional
    const targetStr = String(draftGoal.targetNumber ?? "").trim();
    const parsedTarget = targetStr === "" ? null : Number(targetStr);
    const finalTargetNumber = Number.isFinite(parsedTarget as number) ? (parsedTarget as number) : null;


    const startStr = String(draftGoal.startingNumber ?? "").trim();
    const startingNumber = startStr === "" ? null : Number(startStr);
    const finalStarting = Number.isFinite(startingNumber as number) ? (startingNumber as number) : null;

    // If target is set, starting number must be set
    if (finalTargetNumber != null && finalStarting == null) {
      setGoalFormError("A starting number is required when a target number is set.");
      return;
    }

    if (goalModal.mode === "create") {
      const maxOrder = goals.reduce((m, g) => Math.max(m, typeof g.order === "number" ? g.order : 0), -1);
      const newGoal: Goal = {
        id: uid(),
        iconType: "emoji",
        iconKey: draftGoal.iconKey || "Target",
        name,
        note,
        targetDate,
        startDate,
        targetNumber: finalTargetNumber,
        startingNumber: finalStarting,
        unit: String(draftGoal.unit || "").trim(),
        colour: normaliseColour(draftGoal.colour),
        records: [],
        order: maxOrder + 1,
        reachedAt: null,
        cumulative: Boolean(draftGoal.cumulative),
        planEnabled: Boolean(draftGoal.planEnabled),
        planInterval:
          draftGoal.planInterval === "fortnightly" || draftGoal.planInterval === "monthly"
            ? draftGoal.planInterval
            : "weekly",
        planDays: Array.isArray(draftGoal.planDays) ? draftGoal.planDays : [0, 2, 4],
        calendarName: String(draftGoal.calendarName || ""),
      };
      setGoals((prev) => [...prev, newGoal]);
    } else {
      setGoals((prev) =>
        prev.map((g) => {
          if (g.id !== goalModal.goalId) return g;
          return {
            ...g,
            iconKey: draftGoal.iconKey || "Target",
            name,
            note,
            targetDate,
            startDate,
            targetNumber: finalTargetNumber,
            unit: String(draftGoal.unit || "").trim(),
            colour: normaliseColour(draftGoal.colour),
            startingNumber: finalStarting,
            cumulative: Boolean(draftGoal.cumulative),
            planEnabled: Boolean(draftGoal.planEnabled),
            planInterval:
              draftGoal.planInterval === "fortnightly" || draftGoal.planInterval === "monthly"
                ? draftGoal.planInterval
                : "weekly",
            planDays: Array.isArray(draftGoal.planDays) ? draftGoal.planDays : [0, 2, 4],
            calendarName: String(draftGoal.calendarName || ""),
            reachedAt: null,
          };
        })
      );
    }

    setGoalModal({ open: false, mode: "create", goalId: null });
  }
  function markGoalComplete(goalId: string) {
    if (!goalId) return;

    const maxOrder = goals.reduce(
      (m, g) => Math.max(m, typeof g.order === "number" ? g.order : 0),
      -1
    );

    setGoals((prev) =>
      prev.map((g) => {
        if (g.id !== goalId) return g;
        if (g.reachedAt) return g; // already completed
        return {
          ...g,
          reachedAt: isoToday(),
          order: maxOrder + 1,
        };
      })
    );

    // show congratulations modal
    setCongrats({ open: true, goalId });
  }

  function deleteGoal(goalId: string | null) {
    if (!goalId) return;
    setGoals((prev) => prev.filter((g) => g.id !== goalId));
    if (route.name === "tracking" && route.goalId === goalId) setRoute({ name: "home" });
  }

  function moveGoal(goalId: string, dir: -1 | 1) {
    const list = orderedGoals;
    const idx = list.findIndex((g) => g.id === goalId);
    if (idx < 0) return;
    const j = idx + dir;
    if (j < 0 || j >= list.length) return;

    const a = list[idx];
    const b = list[j];

    setGoals((prev) =>
      prev.map((g) => {
        if (g.id === a.id) return { ...g, order: b.order };
        if (g.id === b.id) return { ...g, order: a.order };
        return g;
      })
    );
  }

  function confirmDuplicateGoal() {
    const sourceId = duplicateGoalModal.sourceGoalId;
    if (!sourceId) return;

    const source = goals.find((x) => x.id === sourceId);
    if (!source) return;

    const newName = String(duplicateGoalModal.name || "").trim() || String(source.name || "").trim() || "Untitled";

    const maxOrder = goals.reduce(
      (m, g) => Math.max(m, typeof g.order === "number" ? g.order : 0),
      -1
    );

    const cloned: Goal = {
      ...source,
      id: uid(),
      name: newName,
      records: [],       // start fresh
      reachedAt: null,   // not completed
      order: maxOrder + 1,
    };

    setGoals((prev) => [...prev, cloned]);
    setDuplicateGoalModal({ open: false, sourceGoalId: null, name: "" });
  }

  function openTracking(goalId: string) {
    pushNav();
    setRoute({ name: "tracking", goalId });
  }

  function openAddRecord(goalId: string, dateOnly?: string) {
    setDraftRecord({ value: "", note: "", dateOnly: dateOnly || toISODateOnly(isoToday()) });
    setRecordModal({ open: true, goalId });
  }


  function addRecord() {
    const maxOrder = goals.reduce(
      (m, g) => Math.max(m, typeof g.order === "number" ? g.order : 0),
      -1
    );
    const goalId = recordModal.goalId;
    if (!goalId) return;

    const goal = orderedGoals.find((g) => g.id === goalId);
    if (!goal) return;
    let celebrationToShow: { title: string; message: string } | null = null;

    const date = fromISODateOnly(draftRecord.dateOnly);

    const checkIn = isCheckInGoal(goal);

    // Note: optional always, no defaults
    const noteToSave = String(draftRecord.note || "").trim();

    // Value rules:
    // - check-in: no numeric value
    // - numeric mode: must be a valid number
    let valueToSave: number | undefined = undefined;

    // If it's a numeric goal, value is OPTIONAL.
    // If the user leaves it blank, we save a log with no numeric contribution.
    if (!checkIn) {
      const raw = String(draftRecord.value || "").trim();
      if (raw !== "") {
        const n = Number(raw);
        if (!Number.isFinite(n)) return; // keep rejecting non-numbers like "abc"
        valueToSave = n;
      }
    }

    const newRecord: any = {
      id: uid(),
      date,
      ...(valueToSave == null ? {} : { value: valueToSave }),
      ...(noteToSave ? { note: noteToSave } : {}),
    };

    setGoals((prev) =>
      prev.map((g) => {
        if (g.id !== goalId) return g;

        const next = { ...g, records: [...(g.records || []), newRecord] };
        // ---- Celebrations (non-completion) ----
        const prevStreak = computeStreakDays(g.records || []);
        const nextStreak = computeStreakDays(next.records || []);

        const prevCount = (g.records || []).length;
        const nextCount = (next.records || []).length;

        const streakMilestones = new Set([3, 7, 10, 14, 20, 30, 50, 75, 100]);
        if (nextStreak !== prevStreak && streakMilestones.has(nextStreak)) {
          const remaining = getRemainingToTarget(next);
          celebrationToShow = {
            title: `Streak: ${nextStreak} days!`,
            message:
              remaining == null
                ? `You have logged ${nextStreak} days in a row. Keep it going.`
                : `You have logged ${nextStreak} days in a row. You are getting closer to "${next.name}".`,
          };
        }

        const logMilestones = new Set([1, 5, 10, 25, 50, 100, 200]);
        if (!celebrationToShow && nextCount !== prevCount && logMilestones.has(nextCount)) {
          celebrationToShow = {
            title: `${nextCount} logs!`,
            message: `That is ${nextCount} times you have shown up for "${next.name}".`,
          };
        }

        // Comeback: last log was 30+ days ago (only if this isn't their first ever)
        if (!celebrationToShow && prevCount > 0) {
          const prevLatest = sortByDateDesc(g.records || [])[0]?.date;
          if (prevLatest) {
            const gap = daysBetweenDateOnly(toISODateOnly(prevLatest), draftRecord.dateOnly);
            if (gap >= 30) {
              celebrationToShow = {
                title: "Welcome back",
                message: `Nice return. One log is all it takes to restart momentum on "${next.name}".`,
              };
            }
          }
        }

        // Celebrate if target reached (unit not required)
        const nextStats = computeProgress(next);
        if (goalHasTarget(next) && nextStats.reached && !next.reachedAt) {
          // Use the record's date, not "now"
          const reachedAtIso = new Date(date).toISOString();
          setCongrats({ open: true, goalId: next.id });

          return {
            ...next,
            reachedAt: reachedAtIso,
            order: maxOrder + 1, // push completed goal to bottom
          };
        }



        return next;
      })
    );
    if (celebrationToShow) {
      setCelebration({ open: true, title: celebrationToShow.title, message: celebrationToShow.message });
    }

    setRecordModal({ open: false, goalId: null });
    setDraftRecord({ value: "", note: "", dateOnly: toISODateOnly(isoToday()) });
  }

  function toggleCalendarDone(goalId: string, dateOnly: string) {
    const goal = goals.find((g) => g.id === goalId);
    if (!goal) return;

    const match = (goal.records || []).find((r) => toISODateOnly(r.date) === dateOnly);

    // If already done, untick = delete that day's log (no warning)
    if (match) {
      deleteRecord(goalId, match.id);
      return;
    }

    // If not done, tick = open the log modal for that day
    openAddRecord(goalId, dateOnly);
  }

  function deleteRecord(goalId: string, recordId: string) {
    setGoals((prev) =>
      prev.map((g) => {
        if (g.id !== goalId) return g;

        const kept = (g.records || []).filter((r) => r.id !== recordId);

        // Do NOT mutate startingNumber based on records.
        // If user didn't set it, we keep it null. This avoids "current" sticking.
        const next = { ...g, records: kept };

        const stats = computeProgress(next);

        return {
          ...next,
          reachedAt: kept.length > 0 && goalHasTarget(next) && stats.reached ? g.reachedAt : null,
        };
      })
    );
  }

  function setGoalChartMode(goalId: string, mode: ChartMode) {
    setGoals((prev) => prev.map((g) => (g.id === goalId ? { ...g, chartMode: mode } : g)));
  }

  const activeGoal = route.name === "tracking" ? orderedGoals.find((g) => g.id === route.goalId) : null;

  return (
    <>
    {route.name === "home" ? (
      tab === "goals" ? (
        <GoalsScreen
          goals={hideCompletedGoals ? orderedGoals.filter((g) => !g.reachedAt) : orderedGoals}
          onAddGoal={openCreateGoal}
          onOpenGoal={openTracking}
          onEditGoal={openEditGoal}
          onOpenMenu={openCardMenu}
          onOpenSettings={() => setSettingsModal(true)}
        />
      ) : tab === "progress" ? (
        <ProgressScreen
          goals={hideCompletedGoals ? orderedGoals.filter((g) => !g.reachedAt) : orderedGoals}
          onOpenGoal={openTracking}
          onOpenSettings={() => setSettingsModal(true)}
        />

      ) : (
        <CalendarScreen
          goals={hideCompletedGoals ? orderedGoals.filter((g) => !g.reachedAt) : orderedGoals}
          onToggleDone={toggleCalendarDone}
          onEditGoal={openEditGoal}   // <- CHANGE THIS (was openEditGoalFromCalendar)
          onRequestCalendarRemove={(goalId, dateOnly) =>
            setCalendarRemove({ open: true, goalId, dateOnly })
          }
          onOpenSettings={() => setSettingsModal(true)}
          onOpenGoal={openTracking}
        />
      )
      ) : (

        <TrackingScreen
          goal={activeGoal}
          onBack={popNav}
          onAddRecord={() => activeGoal && openAddRecord(activeGoal.id)}
          onDeleteRecord={(recordId) => activeGoal && deleteRecord(activeGoal.id, recordId)}
          onSetChartMode={(mode) => activeGoal && setGoalChartMode(activeGoal.id, mode)}
          onEditGoal={() => {
            if (!activeGoal) return;
            openEditGoal(activeGoal); // <- KEEP ONLY THIS
          }}
          right={
            <div className="flex items-center">
              <button
                className="w-10 h-10 rounded-2xl bg-white border border-slate-200 flex items-center justify-center"
                onClick={() => {
                  if (!activeGoal) return;
                  openEditGoal(activeGoal);
                }}
                aria-label="Edit goal"
                title="Edit"
              >
                <Pencil className="w-5 h-5 text-slate-600" />
              </button>
            </div>
          }
        />
      )}

      <BottomTabs
        tab={tab}
        setTab={(t) => {
          setTab(t);
          if (route.name !== "home") setRoute({ name: "home" });
        }}
      />

      {/* Setting Modal */}
      <Modal
        open={settingsModal}
        title="Settings"
        onClose={() => setSettingsModal(false)}
      >
        <div className="space-y-4">
          <div className="bg-white border border-slate-200 rounded-2xl overflow-hidden">
            <button
              type="button"
              onClick={() => setHideCompletedGoals((v) => !v)}
              className="w-full px-4 py-4 flex items-center justify-between"
            >
              <div className="text-sm text-slate-700">Hide completed goals</div>

              <div
                className={`w-11 h-6 rounded-full border transition flex items-center ${
                  hideCompletedGoals ? "bg-sky-500 border-sky-500 justify-end" : "bg-slate-100 border-slate-200 justify-start"
                }`}
              >
                <div className="w-5 h-5 bg-white rounded-full shadow-sm mx-0.5" />
              </div>
            </button>
          </div>
          <button
            type="button"
            className="w-full h-12 px-4 flex items-center justify-between border-b border-slate-100"
            onClick={exportData}
          >
            <span className="text-sm text-slate-700">Export data</span>
          </button>

          <button
            type="button"
            className="w-full h-12 px-4 flex items-center justify-between"
            onClick={openImportPicker}
          >
            <span className="text-sm text-slate-700">Import data</span>
          </button>


          <div className="bg-white border border-slate-200 rounded-2xl overflow-hidden">
            <button
              type="button"
              onClick={() => setConfirmDelete({ open: true, goalId: "__ALL__" })}
              className="w-full px-4 py-4 flex items-center justify-between"
            >
              <div className="text-sm text-red-600 font-semibold">Delete all goals</div>
              <Trash2 className="w-4 h-4 text-red-600" />
            </button>
          </div>
        </div>
      </Modal>


      {/* Goal modal */}
      <Modal
        open={goalModal.open}
        title={goalModal.mode === "create" ? "Set Goal" : "Edit Goal"}
        onClose={() => {
          setGoalModal({ open: false, mode: "create", goalId: null });
          setGoalFormError("");

          const back = editReturnRef.current;
          editReturnRef.current = null;

          if (back) {
            setTab(back.tab);
            setRoute(back.route);
            return;
          }

          if (goalModal.mode === "edit") goHomeGoals();
        }}
        footer={
          <PrimaryButton
            onClick={() => {
              setGoalFormError("");

              if (!String(draftGoal.name || "").trim()) return;

              const start = String(draftGoal.startDateOnly || "").trim();
              const target = String(draftGoal.targetDateOnly || "").trim();

              if (start && target && target < start) {
                setGoalFormError("Target date must be on or after the start date.");
                return;
              }

              const targetNum = String(draftGoal.targetNumber || "").trim();
              const startNum = String(draftGoal.startingNumber || "").trim();

              if (targetNum !== "" && startNum === "") {
                setGoalFormError("Please set a starting number if you set a target number.");
                return;
              }

              saveGoalFromDraft();

              const back = editReturnRef.current;
              editReturnRef.current = null;

              if (back) {
                setTab(back.tab);
                setRoute(back.route);
                return;
              }

              goHomeGoals();

            }}
            disabled={!String(draftGoal.name || "").trim()}

          >
            Complete
          </PrimaryButton>
        }
      >
        {(() => {



          const currentColour = normaliseColour(draftGoal.colour || COLOUR_OPTIONS[7]);
          const startDate = fromISODateOnly(draftGoal.startDateOnly);
          const targetDate = draftGoal.targetDateOnly ? fromISODateOnly(draftGoal.targetDateOnly) : startDate; // fallback


          return (
            <div className="space-y-4">

            <Field label={<Req>Goal name</Req>}>
              <Input
                value={draftGoal.name}
                onChange={(v) => setDraftGoal((d) => ({ ...d, name: v }))}
              />
            </Field>

            <Field label="Note">
              <TextArea
                value={draftGoal.note}
                onChange={(v) => setDraftGoal((d) => ({ ...d, note: v }))}
              />
            </Field>

            <Field label="Icon">
              <div className="bg-white border border-slate-200 rounded-2xl p-3">
                <div className="max-h-[168px] overflow-auto">
                  <div className="grid grid-cols-6 gap-2">
                    {GOAL_ICONS.map(({ key, label, Icon }) => {
                      const selected = key === (draftGoal.iconKey || "Target");
                      return (
                        <button
                          key={key}
                          type="button"
                          onClick={() => setDraftGoal((d) => ({ ...d, iconKey: key }))}
                          className={`h-12 rounded-2xl border flex items-center justify-center ${
                            selected ? "border-sky-500 bg-sky-50" : "border-slate-200 bg-white"
                          }`}
                          aria-label={label}
                          title={label}
                        >
                          <Icon className="w-5 h-5 text-slate-700" />
                        </button>
                      );
                    })}
                  </div>
                </div>
              </div>
            </Field>

            <Field label="Unit">
              <SelectRow
                label="Select"
                display={draftGoal.unit}
                muted={false}
                onClick={() => openUnitsPicker(draftGoal.unit)}
              />
            </Field>

            <div className="grid grid-cols-2 gap-3">
              <Field label="Start date">
                <Input
                  type="date"
                  value={draftGoal.startDateOnly}
                  onChange={(v) => setDraftGoal((d) => ({ ...d, startDateOnly: v }))}
                />
              </Field>

              <Field label="Target date">
                <Input
                  type="date"
                  value={draftGoal.targetDateOnly}
                  onChange={(v) => setDraftGoal((d) => ({ ...d, targetDateOnly: v }))}
                />
              </Field>
            </div>

            {goalFormError ? (
              <div className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-2xl px-3 py-2">
                {goalFormError}
              </div>
            ) : null}

            <div className="grid grid-cols-2 gap-3">
              <Field label="Starting number">
                <Input
                  type="number"
                  value={draftGoal.startingNumber}
                  onChange={(v) => setDraftGoal((d) => ({ ...d, startingNumber: v }))}
                />
              </Field>

              <Field label="Target number">
                <Input
                  type="number"
                  value={draftGoal.targetNumber}
                  onChange={(v) => setDraftGoal((d) => ({ ...d, targetNumber: v }))}
                />
              </Field>
            </div>

            <Field label="Tracking Style">
              <div className="bg-white border border-slate-200 rounded-2xl px-4 py-3 flex items-center justify-between">
                <label className="flex items-center gap-3 cursor-pointer select-none">
                  <input
                    type="checkbox"
                    checked={Boolean(draftGoal.cumulative)}
                    onChange={(e) => setDraftGoal((d) => ({ ...d, cumulative: e.target.checked }))}
                    className="w-4 h-4"
                  />
                  <span className="text-sm text-slate-700">Add up entries</span>
                </label>

                <button
                  type="button"
                  onClick={() => setCumulativeInfo(true)}
                  className="w-9 h-9 rounded-xl bg-slate-50 border border-slate-200 flex items-center justify-center"
                  aria-label="Info"
                  title="Info"
                >
                  <Info className="w-4 h-4 text-slate-600" />
                </button>
              </div>
              </Field>

              <Field label="Colour">
              <div className="bg-white border border-slate-200 rounded-2xl p-3">
                <div className="max-h-[100px] overflow-auto">
                  <div className="grid grid-cols-8 gap-2">
                    {COLOUR_OPTIONS.map((c) => {
                      const current = normaliseColour(draftGoal.colour || COLOUR_OPTIONS[0]);
                      const selected = current.toLowerCase() === c.toLowerCase();

                      return (
                        <button
                          key={c}
                          type="button"
                          onClick={() => setDraftGoal((d) => ({ ...d, colour: c }))}
                          className="relative w-8 h-8 rounded-full border border-slate-300 hover:border-slate-400"
                          style={{ backgroundColor: c }}
                          aria-label="Colour"
                        >
                          {selected ? (
                            <Check
                              className="absolute inset-0 m-auto w-4 h-4 text-white drop-shadow"
                              strokeWidth={3}
                            />
                          ) : null}
                        </button>

                      );
                    })}
                  </div>
                </div>
              </div>
            </Field>

            <Field>
              <div className="bg-white border border-slate-200 rounded-2xl overflow-hidden">
                <button
                  type="button"
                  onClick={() => setMoreOptionsOpen((v) => !v)}
                  className="w-full h-12 px-4 flex items-center justify-between"
                >
                  <span className="text-sm text-slate-700">More options</span>
                  {moreOptionsOpen ? (
                    <ChevronUp className="w-4 h-4 text-slate-600" />
                  ) : (
                    <ChevronDown className="w-4 h-4 text-slate-600" />
                  )}
                </button>

                {moreOptionsOpen ? (
                  <div className="px-4 pb-4 border-t border-slate-100 space-y-4">
                    <label className="flex items-center gap-3 pt-4 cursor-pointer select-none">
                      <input
                        type="checkbox"
                        checked={Boolean(draftGoal.planEnabled)}
                        onChange={(e) =>
                          setDraftGoal((d) => ({ ...d, planEnabled: e.target.checked }))
                        }
                        className="w-4 h-4"
                      />
                      <span className="text-sm text-slate-700">Show this goal in calendar</span>
                    </label>

                    {draftGoal.planEnabled ? (
                      <>
                        <Field label="Calendar name (optional)">
                          <Input
                            value={draftGoal.calendarName}
                            onChange={(v) => setDraftGoal((d) => ({ ...d, calendarName: v }))}
                            placeholder="Leave blank to use goal name"
                          />
                        </Field>

                        <Field label="How regular">
                          <div className="grid grid-cols-3 gap-2">
                            {[
                              { key: "weekly", label: "Weekly" },
                              { key: "fortnightly", label: "Fortnightly" },
                              { key: "monthly", label: "Monthly" },
                            ].map((opt) => {
                              const selected = draftGoal.planInterval === opt.key;

                              return (
                                <button
                                  key={opt.key}
                                  type="button"
                                  onClick={() =>
                                    setDraftGoal((d) => ({
                                      ...d,
                                      planInterval: d.planInterval === opt.key ? null : opt.key,
                                    }))
                                  }
                                  className={`h-10 rounded-2xl border text-sm ${
                                    selected
                                      ? "border-sky-500 bg-sky-50 text-slate-900"
                                      : "border-slate-200 bg-white text-slate-700"
                                  }`}
                                >
                                  {opt.label}
                                </button>
                              );
                            })}
                          </div>
                        </Field>

                        <Field label="Days">
                          <div className="grid grid-cols-7 gap-2">
                            {["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].map((label, idx) => {
                              const days: number[] = Array.isArray(draftGoal.planDays) ? draftGoal.planDays : [];
                              const selected = days.includes(idx);

                              return (
                                <button
                                  key={label}
                                  type="button"
                                  onClick={() => {
                                    setDraftGoal((d) => {
                                      const current: number[] = Array.isArray(d.planDays) ? d.planDays : [];
                                      const next = current.includes(idx)
                                        ? current.filter((x) => x !== idx)
                                        : [...current, idx].sort((a, b) => a - b);

                                      return { ...d, planDays: next };
                                    });
                                  }}
                                  className={`h-10 rounded-2xl border text-sm ${
                                    selected
                                      ? "border-sky-500 bg-sky-50 text-slate-900"
                                      : "border-slate-200 bg-white text-slate-700"
                                  }`}
                                >
                                  {label}
                                </button>
                              );
                            })}
                          </div>
                        </Field>
                      </>
                    ) : null}
                  </div>
                ) : null}
              </div>
            </Field>

            </div>
          );
        })()}
      </Modal>

      {/* Cumalitives modal */}
      <Modal
        open={cumulativeInfo}
        title="Add up entries"
        onClose={() => setCumulativeInfo(false)}
      >
        <div className="text-slate-600 text-sm space-y-3">
          <div>
            Turn this on if each log should be added together into one total.
          </div>
          <div>
            Examples: money saved, hours practised, pages read.
          </div>
        </div>
      </Modal>

      {/* Units modal */}
      <Modal
        open={unitsModal.open}
        title="Units"
        onClose={() => setUnitsModal({ open: false, selected: null, custom: "" })}
        footer={
          <PrimaryButton onClick={saveUnitSelection} disabled={!unitsModal.selected}>
            Save
          </PrimaryButton>
        }
      >
        <div className="space-y-4">
          <div className="flex items-center gap-2">
            <input
              value={unitsModal.custom}
              onChange={(e) => setUnitsModal((u) => ({ ...u, custom: e.target.value }))}
              placeholder="Add a custom unit"
              className="flex-1 h-11 px-4 rounded-2xl bg-white border border-slate-200 outline-none focus:border-sky-400"
            />
            <button
              type="button"
              className="w-11 h-11 rounded-2xl bg-white border border-slate-200 flex items-center justify-center active:scale-[0.98]"
              onClick={addCustomUnit}
              aria-label="Add custom unit"
              title="Add"
            >
              <Plus className="w-5 h-5 text-slate-600" />
            </button>
          </div>

          {customUnits.length > 0 ? (
            <div>
              <div className="text-sm font-semibold text-slate-700 mb-2">Custom</div>
              <div className="bg-white border border-slate-200 rounded-2xl overflow-hidden">
                {customUnits.map((u: string) => {
                  const selected = unitsModal.selected === u;
                  return (
                    <div
                      key={u}
                      className="w-full h-12 px-4 flex items-center justify-between border-b border-slate-100 last:border-b-0"
                    >
                      <button
                        type="button"
                        onClick={() => selectUnit(u)}
                        className="flex items-center gap-3"
                      >
                        <div
                          className={`w-5 h-5 rounded-full border ${
                            selected ? "border-sky-500 bg-sky-50" : "border-slate-300"
                          } flex items-center justify-center`}
                        >
                          {selected ? <div className="w-2.5 h-2.5 rounded-full bg-sky-500" /> : null}
                        </div>
                        <span className="text-sm text-slate-700">{u}</span>
                      </button>

                      <button
                        type="button"
                        onClick={() => deleteCustomUnit(u)}
                        className="w-9 h-9 rounded-xl bg-white border border-slate-200 flex items-center justify-center"
                        aria-label="Delete custom unit"
                        title="Delete"
                      >
                        <Trash2 className="w-4 h-4 text-slate-600" />
                      </button>
                    </div>
                  );
                })}
              </div>
            </div>
          ) : null}

          {UNIT_GROUPS.map((g) => (
            <div key={g.title}>
              <div className="text-sm font-semibold text-slate-700 mb-2">{g.title}</div>
              <div className="bg-white border border-slate-200 rounded-2xl overflow-hidden">
                {g.items.map((u) => {
                  const selected = unitsModal.selected === u;
                  return (
                    <button
                      key={u}
                      type="button"
                      onClick={() => selectUnit(u)}
                      className="w-full h-12 px-4 flex items-center justify-between border-b border-slate-100 last:border-b-0"
                    >
                      <div className="flex items-center gap-3">
                        <div
                          className={`w-5 h-5 rounded-full border ${
                            selected ? "border-sky-500 bg-sky-50" : "border-slate-300"
                          } flex items-center justify-center`}
                        >
                          {selected ? <div className="w-2.5 h-2.5 rounded-full bg-sky-500" /> : null}
                        </div>
                        <span className="text-sm text-slate-700">{u}</span>
                      </div>
                      {selected ? <Check className="w-4 h-4 text-sky-600" /> : null}
                    </button>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      </Modal>

      {/* Record modal */}
      <Modal
        open={recordModal.open}
        title="Record Progress"
        onClose={() => setRecordModal({ open: false, goalId: null })}
        footer={
          <PrimaryButton
            onClick={addRecord}
            disabled={(() => {
              const goal = goals.find((g) => g.id === recordModal.goalId);
              const checkIn = goal ? isCheckInGoal(goal) : true;
              if (checkIn) return false;

              const raw = String(draftRecord.value || "").trim();
              if (raw === "") return false; // blank is allowed now
              return !Number.isFinite(Number(raw)); // but "abc" still blocked
            })()}
          >
            Add
          </PrimaryButton>
        }
      >
        {recordModal.goalId ? (
          <RecordForm
            goal={orderedGoals.find((g) => g.id === recordModal.goalId) || null}
            draft={draftRecord}
            setDraft={setDraftRecord}
          />
        ) : null}
      </Modal>


      {/* Manage modal */}
      <Modal open={manageModal.open} title="Manage Goals" onClose={() => setManageModal({ open: false })}>
        <div className="space-y-3">
          {orderedGoals.length === 0 ? (
            <div className="text-slate-500">No Goals</div>
          ) : (
            orderedGoals.map((g) => (
              <div key={g.id} className="bg-white border border-slate-200 rounded-2xl px-4 py-3 flex items-center gap-3">
              <IconBadge iconKey={g.iconKey} colour={g.colour} />
                <div className="flex-1 min-w-0">
                  <div className="font-semibold truncate">{g.name}</div>
                  <div className="text-sm text-slate-500 truncate">{firstLine(g.note)}</div>
                </div>
                <div className="flex items-center gap-1">
                  <button
                    className="w-9 h-9 rounded-xl bg-slate-50 border border-slate-200 flex items-center justify-center"
                    onClick={() => moveGoal(g.id, -1)}
                    aria-label="Move up"
                  >
                    <ChevronUp className="w-4 h-4 text-slate-600" />
                  </button>
                  <button
                    className="w-9 h-9 rounded-xl bg-slate-50 border border-slate-200 flex items-center justify-center"
                    onClick={() => moveGoal(g.id, 1)}
                    aria-label="Move down"
                  >
                    <ChevronDown className="w-4 h-4 text-slate-600" />
                  </button>
                  <button
                    className="w-9 h-9 rounded-xl bg-red-50 border border-red-200 flex items-center justify-center"
                    onClick={() => setConfirmDelete({ open: true, goalId: g.id })}
                    aria-label="Delete"
                  >
                    <Trash2 className="w-4 h-4 text-red-600" />
                  </button>
                </div>
              </div>
            ))
          )}
        </div>
      </Modal>

      {/* Card menu */}
      <Modal open={cardMenu.open} title={orderedGoals.find((x) => x.id === cardMenu.goalId)?.name || "Options"} onClose={closeCardMenu}>
        {(() => {
          const g = orderedGoals.find((x) => x.id === cardMenu.goalId);
          if (!g) return <div className="text-slate-500">Goal not found.</div>;

          return (
            <div className="bg-white border border-slate-200 rounded-2xl overflow-hidden">
              <button
                type="button"
                className="w-full h-12 px-4 flex items-center justify-between border-b border-slate-100"
                onClick={() => {
                  closeCardMenu();
                  setRoute({ name: "home" });
                  setTab("goals");
                  openEditGoal(g);
                }}
              >
                <span className="text-sm text-slate-700">Edit</span>
                <ChevronRight className="w-4 h-4 text-slate-400" />
              </button>

              <button
                type="button"
                className="w-full h-12 px-4 flex items-center justify-between border-b border-slate-100"
                onClick={() => {
                  closeCardMenu();
                  setDuplicateGoalModal({ open: true, sourceGoalId: g.id, name: g.name || "" });
                }}
              >
                <span className="text-sm text-slate-700">Duplicate</span>
                <ChevronRight className="w-4 h-4 text-slate-400" />
              </button>

              <button
                type="button"
                className="w-full h-12 px-4 flex items-center justify-between border-b border-slate-100"
                onClick={() => {
                  closeCardMenu();
                  setConfirmComplete({ open: true, goalId: g.id });
                }}
              >
                <span className="text-sm text-slate-700">Complete goal</span>
                <Check className="w-4 h-4 text-slate-400" />
              </button>


              <button
                type="button"
                className="w-full h-12 px-4 flex items-center justify-between border-b border-slate-100"
                onClick={() => {
                  moveGoal(g.id, -1);
                  closeCardMenu();
                }}
              >
                <span className="text-sm text-slate-700">Move up</span>
                <ChevronUp className="w-4 h-4 text-slate-400" />
              </button>

              <button
                type="button"
                className="w-full h-12 px-4 flex items-center justify-between border-b border-slate-100"
                onClick={() => {
                  moveGoal(g.id, 1);
                  closeCardMenu();
                }}
              >
                <span className="text-sm text-slate-700">Move down</span>
                <ChevronDown className="w-4 h-4 text-slate-400" />
              </button>

              <button
                type="button"
                className="w-full h-12 px-4 flex items-center justify-between"
                onClick={() => {
                  closeCardMenu();
                  setConfirmDelete({ open: true, goalId: g.id });
                }}
              >
                <span className="text-sm text-red-600">Delete</span>
                <Trash2 className="w-4 h-4 text-red-600" />
              </button>
            </div>
          );
        })()}
      </Modal>

      {/* Duplicate goal modal */}
      <Modal
        open={duplicateGoalModal.open}
        title="Duplicate goal"
        onClose={() => setDuplicateGoalModal({ open: false, sourceGoalId: null, name: "" })}
        footer={
          <PrimaryButton
            onClick={confirmDuplicateGoal}
            disabled={!String(duplicateGoalModal.name || "").trim()}
          >
            Create copy
          </PrimaryButton>
        }
      >
        <div className="space-y-3">


          <Field label="Goal name">
            <Input
              value={duplicateGoalModal.name}
              onChange={(v) => setDuplicateGoalModal((s) => ({ ...s, name: v }))}
              placeholder="Goal name"
            />
          </Field>
        </div>
      </Modal>

      <Modal
        open={calendarRemove.open}
        title="Remove from calendar?"
        onClose={() => setCalendarRemove({ open: false, goalId: null, dateOnly: calendarRemove.dateOnly })}
        footer={null}
      >
        <div className="text-sm text-slate-600">
          Would you like to remove this goal just for this day, or from your calendar entirely?
        </div>

        <div className="mt-4 grid grid-cols-1 gap-2">
          <button
            type="button"
            className="h-11 rounded-2xl bg-white border border-slate-200 text-sm font-semibold text-slate-800"
            onClick={() => {
              const goalId = calendarRemove.goalId;
              if (!goalId) return;

              setGoals((prev) =>
                prev.map((g) => {
                  if (g.id !== goalId) return g;

                  const anyG: any = g;
                  const existing: string[] = Array.isArray(anyG.planSkipDates) ? anyG.planSkipDates : [];
                  const next = existing.includes(calendarRemove.dateOnly)
                    ? existing
                    : [...existing, calendarRemove.dateOnly];

                  return { ...g, planSkipDates: next } as any;
                })
              );

              setCalendarRemove({ open: false, goalId: null, dateOnly: calendarRemove.dateOnly });
            }}
          >
            Just this day
          </button>

          <button
            type="button"
            className="h-11 rounded-2xl bg-red-600 text-white text-sm font-semibold"
            onClick={() => {
              const goalId = calendarRemove.goalId;
              if (!goalId) return;

              setGoals((prev) =>
                prev.map((g) => (g.id === goalId ? ({ ...g, planEnabled: false } as any) : g))
              );

              setCalendarRemove({ open: false, goalId: null, dateOnly: calendarRemove.dateOnly });
            }}
          >
            Remove from calendar
          </button>
        </div>
      </Modal>

      <Modal
        open={confirmComplete.open}
        title="Complete goal"
        onClose={() => setConfirmComplete({ open: false, goalId: null })}
        footer={
          <div className="space-y-2">
            <PrimaryButton
              onClick={() => {
                const id = confirmComplete.goalId;
                if (!id) return;

                const now = new Date().toISOString();
                const maxOrder = goals.reduce(
                  (m, g) => Math.max(m, typeof g.order === "number" ? g.order : 0),
                  -1
                );

                setGoals((prev) =>
                  prev.map((g) =>
                    g.id !== id ? g : { ...g, reachedAt: now, order: maxOrder + 1 }
                  )
                );

                setConfirmComplete({ open: false, goalId: null });
                setCongrats({ open: true, goalId: id });
              }}
              disabled={!confirmComplete.goalId}
              iconLeft={<Check className="w-4 h-4" />}
            >
              Yes, complete
            </PrimaryButton>

            <button
              className="w-full h-12 rounded-xl border border-slate-200 bg-white font-semibold"
              onClick={() => setConfirmComplete({ open: false, goalId: null })}
            >
              Cancel
            </button>
          </div>
        }
      >
        <div className="text-slate-600">Are you sure you want to mark this goal as completed?</div>
      </Modal>

      {/* Confirm delete */}
      <Modal
        open={confirmDelete.open}
        title="Delete Goal"
        onClose={() => setConfirmDelete({ open: false, goalId: null })}
        footer={
          <div className="space-y-2">
            <PrimaryButton
              onClick={() => {
                if (confirmDelete.goalId === "__ALL__") {
                  setGoals([]);
                  setRoute({ name: "home" });
                } else {
                  deleteGoal(confirmDelete.goalId);
                }

                setConfirmDelete({ open: false, goalId: null });
                setManageModal({ open: false });
              }}
              disabled={!confirmDelete.goalId}
              iconLeft={<Trash2 className="w-4 h-4" />}
            >
              Yes, delete
            </PrimaryButton>
            <button
              className="w-full h-12 rounded-xl border border-slate-200 bg-white font-semibold"
              onClick={() => setConfirmDelete({ open: false, goalId: null })}
            >
              Cancel
            </button>
          </div>
        }
      >
      <div className="text-slate-600">
        {confirmDelete.goalId === "__ALL__"
          ? "Are you sure you want to delete all goals? This action cannot be undone."
          : "Are you sure you want to delete this goal?"}
      </div>

      </Modal>

      {/* Congrats */}
      <Modal
        open={congrats.open}
        title="Congratulations!"
        onClose={() => setCongrats({ open: false, goalId: null })}
        footer={
          <div className="space-y-2">
            <PrimaryButton
              onClick={() => {
                const g = orderedGoals.find((x) => x.id === congrats.goalId);
                if (g) openEditGoal(g);
                setCongrats({ open: false, goalId: null });
              }}
              disabled={!congrats.goalId}
            >
              Update to a new goal
            </PrimaryButton>
            <button
              className="w-full h-12 rounded-xl border border-slate-200 bg-white font-semibold"
              onClick={() => setCongrats({ open: false, goalId: null })}
            >
              Not now
            </button>
          </div>
        }
      >
      {(() => {
        const g = orderedGoals.find((x) => x.id === congrats.goalId);
        if (!g) return <div className="text-slate-600">You have reached your goal.</div>;

        const target = g.targetDate ? toISODateOnly(g.targetDate) : null;
        const reached = g.reachedAt ? toISODateOnly(g.reachedAt) : null;

        let timingLine: string | null = null;

        if (target && reached) {
          const diff = daysBetweenDateOnly(reached, target); // positive means target is after reached
          if (diff > 0) timingLine = `You completed this goal ${diff} days before your target date.`;
          else if (diff < 0) timingLine = `You completed this goal ${Math.abs(diff)} days after your target date.`;
          else timingLine = "You completed this goal on your target date.";
        }

        return (
          <div className="text-slate-600 space-y-2">
            <div>You have reached your goal.</div>
            {timingLine ? <div>{timingLine}</div> : null}
            <div>Would you like to update it to a new goal?</div>
          </div>
        );
      })()}
      </Modal>
      <Modal
        open={celebration.open}
        title={celebration.title}
        onClose={() => setCelebration({ open: false, title: "", message: "" })}
        footer={
          <button
            className="w-full h-12 rounded-xl border border-slate-200 bg-white font-semibold"
            onClick={() => setCelebration({ open: false, title: "", message: "" })}
          >
            Nice
          </button>
        }
      >
        <div className="text-slate-600">{celebration.message}</div>
      </Modal>
      <input
        ref={fileInputRef}
        type="file"
        accept="application/json"
        onChange={handleImportFile}
        style={{ display: "none" }}
      />

    </>
  );
}

// -------------------------
// Screens
// -------------------------
function GoalsScreen({
  goals,
  onAddGoal,
  onOpenGoal,
  onEditGoal,
  onOpenMenu,
  onOpenSettings,
}: {
  goals: Goal[];
  onAddGoal: () => void;
  onOpenGoal: (id: string) => void;
  onEditGoal: (g: Goal) => void;
  onOpenMenu: (id: string) => void;
  onOpenSettings: () => void;
}) {

  return (
    <AppShell
      title="My Goals"
      left={null}
      right={
        <button
          className="w-10 h-10 rounded-2xl bg-white border border-slate-200 flex items-center justify-center"
          onClick={onOpenSettings}
          aria-label="Settings"
          title="Settings"
        >
          <Settings className="w-5 h-5 text-slate-600" />
        </button>
      }
    >

      {goals.length === 0 ? (
        <div className="min-h-[60vh] flex flex-col items-center justify-center gap-6">
          <div className="text-slate-400">No Goals</div>
          <div className="w-full">
            <PrimaryButton onClick={onAddGoal} iconLeft={<Plus className="w-5 h-5" />}>
              Add Goal
            </PrimaryButton>
          </div>
        </div>
      ) : (
        <div className="space-y-3">
          {goals.map((g) => (
            <GoalCard
              key={g.id}
              goal={g}
              onOpen={() => onOpenGoal(g.id)}
              onMenu={() => onOpenMenu(g.id)}
              onEdit={() => onEditGoal(g)}
            />
          ))}
          <div className="pt-3">
            <PrimaryButton onClick={onAddGoal} iconLeft={<Plus className="w-5 h-5" />}>
              Add Goal
            </PrimaryButton>
          </div>
        </div>
      )}
    </AppShell>
  );
}

function GoalCard({
  goal,
  onOpen,
  onMenu,
  onEdit,
}: {
  goal: Goal;
  onOpen: () => void;
  onMenu: () => void;
  onEdit: () => void;
}) {
  const stats = useMemo(() => computeProgress(goal), [goal]);
  const hasTarget = goal.targetNumber != null;
  const hasAnyValue =
  goal.startingNumber != null || (goal.records?.length ?? 0) > 0;
  const currentDisplay = hasAnyValue ? stats.current : null;
  const isCompleted = Boolean(goal.reachedAt);
  const isCumulative = Boolean(goal.cumulative);
  const total = (goal.startingNumber ?? 0) + sumNumericRecords(goal.records || []);
  const streakDays = useMemo(() => computeStreakDays(goal.records || []), [goal.records]);



  return (
    <Card onClick={onOpen}>
      <div className="p-4">
        <div className="flex items-start gap-3">
        <IconBadge iconKey={goal.iconKey} colour={goal.colour} />
          <div className="flex-1 min-w-0">
            <div className="font-semibold truncate">{goal.name}</div>
            <div className="text-sm text-slate-500 truncate">{firstLine(goal.note)}</div>

            <div className="mt-3 flex items-center gap-3 text-xs text-slate-500">
            <span className="inline-flex items-center gap-2">
              <span className="inline-flex items-center gap-1">
                <span className="inline-flex items-center justify-center w-5 h-5 rounded-lg bg-slate-50 border border-slate-100">
                  <ArrowUp className="w-3.5 h-3.5 text-slate-500" />
                </span>
                {stats.recordCount}
              </span>

              {streakDays >= 2 ? (
                <span className="inline-flex items-center gap-1">
                  <span className="inline-flex items-center justify-center w-5 h-5 rounded-lg bg-slate-50 border border-slate-100">
                    <Flame className="w-3.5 h-3.5 text-slate-500" />
                  </span>
                  {streakDays}
                </span>
              ) : null}
            </span>

            {goal.targetDate ? (() => {
              const today = toISODateOnly(isoToday());
              const target = toISODateOnly(goal.targetDate);
              const overdueOrToday = target <= today;

              return (
                <span
                  className={[
                    "inline-flex items-center gap-1 rounded-xl px-2 py-1 text-xs",
                    overdueOrToday
                      ? "bg-red-50 text-red-700 border border-red-200"
                      : "text-slate-500",
                  ].join(" ")}
                >
                  <Calendar
                    className={`w-4 h-4 ${overdueOrToday ? "text-red-600" : "text-slate-400"}`}
                  />
                  <span className="tabular-nums">
                    {formatDisplayDate(goal.targetDate)}
                  </span>
                </span>
              );
            })() : null}

            </div>
          </div>

          <div className="-mr-2 -mt-2">
            <Kebab
              onClick={(e: any) => {
                e.stopPropagation();
                onMenu();
              }}
            />
          </div>
        </div>
        {isCompleted ? (
          <div className="mt-4">
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                onEdit();
              }}
              className="w-full h-10 rounded-2xl bg-slate-50 border border-slate-200 flex items-center justify-center text-sm font-semibold text-slate-700"
              aria-label="Edit goal"
            >
              Completed
            </button>
          </div>
        ) : hasTarget ? (
          <div className="mt-4">
            <ProgressBar value01={stats.progress01} colour={goal.colour} />
            <div className="mt-2 flex items-center justify-between text-xs text-slate-500">
              <span>
              <span>
                {isCumulative
                  ? `Total: ${total}${goal.unit ? ` ${goal.unit}` : ""}`
                  : (currentDisplay != null ? `Current: ${currentDisplay}${goal.unit ? ` ${goal.unit}` : ""}` : null)
                }
                </span>
              </span>
              <span>
                {goal.targetNumber}
                {goal.unit ? ` ${goal.unit}` : ""}
              </span>
            </div>
          </div>
        ) : null}

        </div>
</Card>
);
}

function TrackingScreen({
  goal,
  onBack,
  onAddRecord,
  onDeleteRecord,
  onSetChartMode,
  right,
  onEditGoal,
}: {
  goal: Goal | null;
  onBack: () => void;
  onAddRecord: () => void;
  onDeleteRecord: (recordId: string) => void;
  onSetChartMode: (mode: ChartMode) => void;
  right?: React.ReactNode;
  onEditGoal?: () => void;
}) {

  if (!goal) {
    return (
      <AppShell
        title="Track Progress"
        left={
          <button
            className="w-10 h-10 rounded-2xl flex items-center justify-center"
            onClick={onBack}
            aria-label="Back"
          >
            <ArrowLeft className="w-5 h-5 text-slate-700" />
          </button>
        }
        right={null}
      >
        <div className="text-slate-500">Goal not found.</div>
      </AppShell>
    );
  }

  // -------------------------
  // Booleans go HERE (single source of truth)
  // -------------------------
  const hasUnit = String(goal.unit || "").trim().length > 0;
  const hasTarget = goal.targetNumber != null && Number.isFinite(Number(goal.targetNumber));
  const hasStart = goal.startingNumber != null && Number.isFinite(Number(goal.startingNumber));
  const isCompleted = Boolean(goal.reachedAt);
  const isCumulative = Boolean(goal.cumulative);
  const total = (goal.startingNumber ?? 0) + sumNumericRecords(goal.records || []);



  // "Numeric mode" if the user has provided ANY numeric intent
  const numericMode = hasUnit || hasTarget || hasStart;
  const isCheckIn = !numericMode;

  // We show the chart container whenever numericMode is true
  const showChartContainer = numericMode;

  // Chart mode: line or bar only (remembered per goal)
  const defaultChartMode: ChartMode = hasTarget ? "line" : "bar";
  const chartMode: ChartMode = goal.chartMode === "bar" || goal.chartMode === "line" ? goal.chartMode : defaultChartMode;

  const cycleChartMode = () => {
    const next: ChartMode = chartMode === "line" ? "bar" : "line";
    onSetChartMode(next);
  };


  // -------------------------
  // Records + stats
  // -------------------------
  const recordsAsc = useMemo(() => sortByDateAsc(goal.records || []), [goal.records]);
  const recordsDesc = useMemo(() => sortByDateDesc(goal.records || []), [goal.records]);

  // Only numeric points for chart/summary
  const numericRecordsAsc = useMemo(() => {
    if (!numericMode) return [];
    return sortByDateAsc((goal.records || []).filter((r: any) => Number.isFinite(Number(r.value))));
  }, [goal.records, numericMode]);

  const showChart = numericMode && numericRecordsAsc.length > 0;

  // Progress bar only makes sense when a target exists (unit not required)
  const stats = useMemo(() => computeProgress(goal), [goal]);
  const showProgress = hasTarget;

  // Current summary should disappear when there is no start and no numeric records
  const hasAnyNumericValue = hasStart || numericRecordsAsc.length > 0;
  const currentDisplay = hasAnyNumericValue ? stats.current : null;

  function recordLabel(iso: string) {
    const rec = new Date(iso);
    rec.setHours(0, 0, 0, 0);

    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const diffDays = Math.round((today.getTime() - rec.getTime()) / (24 * 60 * 60 * 1000));
    if (diffDays === 0) return "Today";
    if (diffDays === 1) return "Yesterday";
    if (diffDays > 1 && diffDays < 7) return `${formatDayShort(iso)} - ${formatDisplayDate(iso)}`;
    return formatDisplayDate(iso);
  }

  // Chart data: works with unit OR target OR start (unit is only for display text)
  const chartData = useMemo(() => {
    if (!showChart) return [];

    const byDay = new Map<string, number>();

    for (const r of numericRecordsAsc) {
      const day = toISODateOnly(r.date);
      const v = Number(r.value);

      if (isCumulative) {
        byDay.set(day, (byDay.get(day) ?? 0) + v);
      } else {
        byDay.set(day, v);
      }
    }

    const entries = Array.from(byDay.entries()).sort(([a], [b]) => a.localeCompare(b));

    let running = Number(goal.startingNumber ?? 0);

    return entries.map(([dateOnly, value]) => {
      if (isCumulative) running += value;

      return {
        dateOnly,
        label: new Date(fromISODateOnly(dateOnly)).toLocaleDateString("en-GB", {
          day: "numeric",
          month: "short",
        }),
        value,
        cumulative: running,
      };
    });
  }, [numericRecordsAsc, showChart, isCumulative, goal.startingNumber]);

  return (
    <AppShell
      title={goal.name}
      left={
        <button
          className="w-10 h-10 rounded-2xl flex items-center justify-center"
          onClick={onBack}
          aria-label="Back"
        >
          <ArrowLeft className="w-5 h-5 text-slate-700" />
        </button>
      }
      right={
        right ?? (
          <button
            className="h-10 px-3 rounded-2xl bg-white border border-slate-200 text-sm font-semibold text-slate-800"
            onClick={() => onEditGoal?.()}
          >
            Edit
          </button>
        )
      }
    >

      <div className="space-y-3">
        {showChartContainer ? (
          <Card>
          <div className="p-4">
            <div className="flex items-center justify-between">
              {showChart ? (
                <button
                  type="button"
                  onClick={cycleChartMode}
                  className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-1.5 text-xs text-slate-600"
                  title="Change chart"
                  aria-label="Change chart"
                >
                  {chartMode === "bar" ? <BarChart3 className="w-4 h-4" /> : <LineChartIcon className="w-4 h-4" />}
                  <span className="capitalize">{chartMode}</span>
                </button>
              ) : (
                <div />
              )}

              {showProgress ? (
                <div className="w-28">
                  <ProgressBar value01={stats.progress01} colour={goal.colour} />
                </div>
              ) : null}
            </div>

            <div className="mt-3 bg-slate-50 rounded-2xl border border-slate-100 p-3">
              <div className="flex items-center justify-between text-xs text-slate-500">
                <span>
                  {isCumulative
                    ? `${total}${goal.unit ? ` ${goal.unit}` : ""}`
                    : `${stats.current}${goal.unit ? ` ${goal.unit}` : ""}`}
                </span>

                {hasTarget ? (
                  <span>
                    {goal.targetNumber}
                    {hasUnit ? ` ${goal.unit}` : ""}
                  </span>
                ) : null}
              </div>

              {showChart ? (
                <div className="mt-2 h-44">
                  <ResponsiveContainer width="100%" height="100%">
                    {chartMode === "bar" ? (
                      <BarChart data={chartData} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
                        <CartesianGrid vertical={false} strokeDasharray="3 3" />
                        <XAxis dataKey="label" tickLine={false} axisLine={false} fontSize={12} />
                        <YAxis width={34} tickLine={false} axisLine={false} fontSize={12} />
                        <Tooltip
                          contentStyle={{ borderRadius: 12, border: "1px solid rgb(226 232 240)" }}
                          labelFormatter={(label: any, payload: any) => {
                            const p = payload?.[0]?.payload;
                            if (!p?.dateOnly) return label;
                            return new Date(fromISODateOnly(p.dateOnly)).toLocaleDateString("en-GB", {
                              day: "numeric",
                              month: "short",
                              year: "numeric",
                            });
                          }}
                          formatter={(v: any) => [`${v}${hasUnit ? ` ${goal.unit}` : ""}`, ""]}
                        />
                        {hasTarget ? (
                          <ReferenceLine y={goal.targetNumber as any} stroke="#94a3b8" strokeDasharray="4 4" />
                        ) : null}
                        <Bar dataKey="value" fill={normaliseColour(goal.colour)} radius={[10, 10, 10, 10]} />
                      </BarChart>
                    ) : (
                      <LineChart data={chartData} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
                        <CartesianGrid vertical={false} strokeDasharray="3 3" />
                        <XAxis dataKey="label" tickLine={false} axisLine={false} fontSize={12} />
                        <YAxis width={34} tickLine={false} axisLine={false} fontSize={12} />
                        <Tooltip
                          contentStyle={{ borderRadius: 12, border: "1px solid rgb(226 232 240)" }}
                          labelFormatter={(label: any, payload: any) => {
                            const p = payload?.[0]?.payload;
                            if (!p?.dateOnly) return label;
                            return new Date(fromISODateOnly(p.dateOnly)).toLocaleDateString("en-GB", {
                              day: "numeric",
                              month: "short",
                              year: "numeric",
                            });
                          }}
                          formatter={(v: any) => [`${v}${hasUnit ? ` ${goal.unit}` : ""}`, ""]}
                        />
                        {hasTarget ? (
                          <ReferenceLine y={goal.targetNumber as any} stroke="#94a3b8" strokeDasharray="4 4" />
                        ) : null}
                        <Line
                          type="monotone"
                          dataKey={isCumulative ? "cumulative" : "value"}
                          connectNulls
                          stroke={normaliseColour(goal.colour)}
                          strokeWidth={3}
                          dot={{ r: 3, strokeWidth: 0, fill: normaliseColour(goal.colour) }}
                          activeDot={{ r: 5 }}
                        />
                      </LineChart>
                    )}
                  </ResponsiveContainer>
                </div>
              ) : null}
            </div>
          </div>
          </Card>
        ) : null}

        <Card>
          <div className="p-4">
            <div className="flex items-center justify-between">
              <div className="font-semibold">Logs</div>
            </div>
            <div className="mt-3 divide-y divide-slate-100">
              {recordsDesc.length === 0 ? (
                <div className="py-6 text-slate-500 text-sm">No records yet.</div>
              ) : (
                recordsDesc.map((r: any) => {
                  const label = recordLabel(r.date);
                  const noteText = String(r.note || "").trim();

                  return (
                    <div key={r.id} className="py-3 flex items-center justify-between gap-3">
                      <div className="min-w-0">
                        <div className="text-sm text-slate-700 truncate">{label}</div>
                        {noteText ? <div className="text-xs text-slate-500 truncate">{noteText}</div> : null}
                      </div>

                      <div className="flex items-center gap-2 shrink-0">
                        {/* Value only in numeric mode */}
                        {!isCheckIn && Number.isFinite(Number(r.value)) ? (
                          <div className="text-sm font-semibold">
                            {r.value}
                            {hasUnit ? ` ${goal.unit}` : ""}
                          </div>
                        ) : null}

                        <button
                          type="button"
                          onClick={() => onDeleteRecord(r.id)}
                          className="w-9 h-9 rounded-xl bg-white border border-slate-200 flex items-center justify-center"
                          aria-label="Delete record"
                          title="Delete"
                        >
                          <Trash2 className="w-4 h-4 text-slate-600" />
                        </button>
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </div>
        </Card>

        <PrimaryButton onClick={onAddRecord} iconLeft={<Plus className="w-5 h-5" />}>
          Add Log
        </PrimaryButton>
      </div>
    </AppShell>
  );
}

function RecordForm({
  goal,
  draft,
  setDraft,
}: {
  goal: Goal | null;
  draft: { value: string; note: string; dateOnly: string };
  setDraft: React.Dispatch<React.SetStateAction<{ value: string; note: string; dateOnly: string }>>;
}) {
  if (!goal) return null;

  const checkIn = isCheckInGoal(goal);

  return (
    <div className="space-y-5">
      <Field label="Date">
        <Input
          type="date"
          value={draft.dateOnly}
          onChange={(v) => setDraft((d) => ({ ...d, dateOnly: v }))}
        />
      </Field>

      {checkIn ? (
        <Field label="Note">
          <TextArea
            value={draft.note}
            onChange={(v) => setDraft((d) => ({ ...d, note: v }))}
            placeholder="What did you do?"
          />
        </Field>
      ) : (
        <>
          <div className="space-y-2">
          <div className="text-xs text-slate-400">
            {(goal.unit ? goal.unit : "Value") + " (optional)"}
          </div>
            <input
              type="number"
              inputMode="numeric"
              value={draft.value}
              onChange={(e) => setDraft((d) => ({ ...d, value: e.target.value }))}
              className="w-full text-3xl bg-transparent border-b border-slate-200 outline-none px-1 py-3"
            />
          </div>

          <Field label="Note">
            <TextArea
              value={draft.note}
              onChange={(v) => setDraft((d) => ({ ...d, note: v }))}
              placeholder="Optional"
            />
          </Field>
        </>
      )}
    </div>
  );
}


function ProgressScreen({
  goals,
  onOpenGoal,
  onOpenSettings,
}: {
  goals: Goal[];
  onOpenGoal: (id: string) => void;
  onOpenSettings: () => void;
}) {

  const active = goals.filter((g) => !g.reachedAt);
  const completed = goals.filter((g) => Boolean(g.reachedAt));

  return (
    <AppShell
      title="Progress"
      left={null}
      right={
        <button
          className="w-10 h-10 rounded-2xl bg-white border border-slate-200 flex items-center justify-center"
          onClick={onOpenSettings}
          aria-label="Settings"
          title="Settings"
        >
          <Settings className="w-5 h-5 text-slate-600" />
        </button>
      }
    >
      {goals.length === 0 ? (
        <div className="min-h-[60vh] flex items-center justify-center text-slate-400">No Goals</div>
      ) : (
        <div className="space-y-6">
          {active.length > 0 ? (
            <div className="space-y-3">
              <div className="text-xs text-slate-500 px-1">Active</div>
              {active.map((g) => (
                <GoalProgressMini key={g.id} goal={g} onOpen={() => onOpenGoal(g.id)} />
              ))}
            </div>
          ) : null}

          {completed.length > 0 ? (
            <div className="space-y-3">
              <div className="text-xs text-slate-500 px-1">Completed</div>
              {completed.map((g) => (
                <GoalProgressMini key={g.id} goal={g} onOpen={() => onOpenGoal(g.id)} />
              ))}
            </div>
          ) : null}
        </div>
      )}
    </AppShell>
  );
}

function GoalProgressMini({ goal, onOpen }: { goal: Goal; onOpen: () => void }) {
  const isCompleted = Boolean(goal.reachedAt);

  // Same “single source of truth” logic as TrackingScreen
  const hasUnit = String(goal.unit || "").trim().length > 0;
  const hasTarget = goal.targetNumber != null && Number.isFinite(Number(goal.targetNumber));
  const hasStart = goal.startingNumber != null && Number.isFinite(Number(goal.startingNumber));
  const numericMode = hasUnit || hasTarget || hasStart;
  const isCheckIn = !numericMode;

  const stats = useMemo(() => computeProgress(goal), [goal]);
  const recordsAsc = useMemo(() => sortByDateAsc(goal.records || []), [goal.records]);
  const recordsDesc = useMemo(() => sortByDateDesc(goal.records || []), [goal.records]);

  const isCumulative = Boolean(goal.cumulative);
  const total = (goal.startingNumber ?? 0) + sumNumericRecords(goal.records || []);

  // Only numeric points for chart
  const numericRecordsAsc = useMemo(() => {
    if (!numericMode) return [];
    return sortByDateAsc((goal.records || []).filter((r: any) => Number.isFinite(Number(r.value))));
  }, [goal.records, numericMode]);

  const showChart = numericMode && numericRecordsAsc.length > 0;

  // Remembered chart style per goal (line or bar)
  const defaultChartMode: ChartMode = hasTarget ? "line" : "bar";
  const chartMode: ChartMode =
    goal.chartMode === "bar" || goal.chartMode === "line" ? goal.chartMode : defaultChartMode;

  // Build chart data (daily latest, or daily sums for cumulative)
  const chartData = useMemo(() => {
    if (!showChart) return [];

    const byDay = new Map<string, number>();

    for (const r of numericRecordsAsc) {
      const day = toISODateOnly(r.date);
      const v = Number(r.value);

      if (isCumulative) {
        byDay.set(day, (byDay.get(day) ?? 0) + v);
      } else {
        byDay.set(day, v);
      }
    }

    const entries = Array.from(byDay.entries()).sort(([a], [b]) => a.localeCompare(b));

    let running = Number(goal.startingNumber ?? 0);

    return entries.map(([dateOnly, value]) => {
      if (isCumulative) running += value;

      return {
        dateOnly,
        label: new Date(fromISODateOnly(dateOnly)).toLocaleDateString("en-GB", { day: "numeric", month: "short" }),
        value,
        cumulative: running,
      };
    });
  }, [showChart, numericRecordsAsc, isCumulative, goal.startingNumber]);

  const lastRecordDate = recordsDesc[0]?.date ?? null;
  const lastRecordLabel = lastRecordDate ? formatDisplayDate(lastRecordDate) : null;

  // Only show progress UI when a target exists AND goal isn't completed
  const showProgressBar = hasTarget && !isCompleted;

  // Correct progress for cumulative goals:
  // - non-cumulative: use computeProgress()
  // - cumulative: use (startingNumber + sum of all entries) as "current"
  const progress01 = useMemo(() => {
    if (!hasTarget) return null;

    if (!isCumulative) return stats.progress01;

    const start = Number(goal.startingNumber ?? 0);
    const current = start + sumNumericRecords(goal.records || []);
    const target = Number(goal.targetNumber);

    const dir = start > target ? "decrease" : "increase";

    let p = 0;
    if (dir === "increase") {
      const denom = target - start;
      p = denom === 0 ? 0 : (current - start) / denom;
    } else {
      const denom = start - target;
      p = denom === 0 ? 0 : (start - current) / denom;
    }

    return clamp01(p);
  }, [hasTarget, isCumulative, goal.startingNumber, goal.targetNumber, goal.records, stats.progress01]);

  const showPercent = hasTarget && !isCompleted && progress01 != null;

  const entryStats = useMemo(() => {
    const vals = numericRecordsAsc.map((r: any) => Number(r.value)).filter((v: any) => Number.isFinite(v));
    if (vals.length === 0) return null;

    const sum = vals.reduce((a: number, b: number) => a + b, 0);
    const avg = sum / vals.length;
    const min = Math.min(...vals);
    const max = Math.max(...vals);

    const round2 = (x: number) => Math.round(x * 100) / 100;

    return { avg: round2(avg), min: round2(min), max: round2(max), n: vals.length };
  }, [numericRecordsAsc]);

  // Summary text for the bottom row
  const leftSummary = isCheckIn
    ? goal.records?.length
      ? `Last: ${lastRecordLabel} • Logs: ${goal.records.length}`
      : "No records yet"
    : isCumulative
      ? `Total: ${total}${hasUnit ? ` ${goal.unit}` : ""}`
      : entryStats
        ? `Avg: ${entryStats.avg}${hasUnit ? ` ${goal.unit}` : ""} • High: ${entryStats.max}${hasUnit ? ` ${goal.unit}` : ""} • Low: ${entryStats.min}${hasUnit ? ` ${goal.unit}` : ""}`
        : "No records yet";


  const rightSummary =
    hasTarget && !isCompleted ? `Target: ${goal.targetNumber}${hasUnit ? ` ${goal.unit}` : ""}` : null;

  return (
    <Card onClick={onOpen}>
      <div className="p-4">
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-start gap-3 min-w-0">
            <IconBadge iconKey={goal.iconKey} colour={goal.colour} />
            <div className="min-w-0">
              <div className="font-semibold truncate">{goal.name}</div>
              <div className="text-sm text-slate-500 truncate">{firstLine(goal.note)}</div>
            </div>
          </div>

          {isCompleted ? (
            <div className="text-xs text-slate-500">Completed</div>
          ) : showPercent ? (
            <div className="text-xs text-slate-500">{Math.round((progress01 as number) * 100)}%</div>
          ) : null}
        </div>

        {/* Chart: only if numeric goal AND has numeric records */}
        {showChart ? (
          <div className="mt-3 h-28 bg-slate-50 rounded-2xl border border-slate-100 p-2">
            <ResponsiveContainer width="100%" height="100%">
              {chartMode === "bar" ? (
                <BarChart data={chartData} margin={{ top: 6, right: 6, bottom: 0, left: 0 }}>
                  <XAxis dataKey="label" tickLine={false} axisLine={false} fontSize={12} interval="preserveStartEnd" />
                  <YAxis hide />
                  {hasTarget ? <ReferenceLine y={goal.targetNumber as any} stroke="rgb(148 163 184)" strokeDasharray="6 6" /> : null}
                  <Bar dataKey="value" fill={normaliseColour(goal.colour)} radius={[10, 10, 10, 10]} />
                </BarChart>
              ) : (
                <LineChart data={chartData} margin={{ top: 6, right: 6, bottom: 0, left: 0 }}>
                  <XAxis dataKey="label" tickLine={false} axisLine={false} fontSize={12} interval="preserveStartEnd" />
                  <YAxis hide />
                  {hasTarget ? <ReferenceLine y={goal.targetNumber as any} stroke="rgb(148 163 184)" strokeDasharray="6 6" /> : null}
                  <Line
                    type="monotone"
                    dataKey={isCumulative ? "cumulative" : "value"}
                    connectNulls
                    stroke={normaliseColour(goal.colour)}
                    strokeWidth={2.5}
                    dot={false}
                  />
                </LineChart>
              )}
            </ResponsiveContainer>
          </div>
        ) : null}

        {/* Progress bar: only if target exists AND not completed */}
        {showProgressBar && progress01 != null ? (
          <div className="mt-3">
            <ProgressBar value01={progress01} colour={goal.colour} />
          </div>
        ) : null}

        <div className="mt-3 flex items-center justify-between text-xs text-slate-500">
          <span className="truncate">{leftSummary}</span>
          {rightSummary ? <span className="shrink-0">{rightSummary}</span> : null}
        </div>
      </div>
    </Card>
  );
}


// -------------------------
// Self tests
// -------------------------

function runSelfTests() {
  const today = isoToday();

  // Direction
  const gInc = { targetNumber: 10, startingNumber: 3, records: [{ id: "r1", date: today, value: 4 }] };
  const gDec = { targetNumber: 60, startingNumber: 90, records: [{ id: "r1", date: today, value: 80 }] };
  if (inferDirection(gInc as any) !== "increase") throw new Error("Test failed: inferDirection increase");
  if (inferDirection(gDec as any) !== "decrease") throw new Error("Test failed: inferDirection decrease");

  // Direction inferred from first record
  const gDecNoStart = { targetNumber: 60, startingNumber: null, records: [{ id: "r1", date: today, value: 90 }] };
  if (inferDirection(gDecNoStart as any) !== "decrease") throw new Error("Test failed: inferDirection from first record");

  // Progress bounds
  const inc = computeProgress(gInc as any);
  const dec = computeProgress(gDec as any);
  if (!(inc.progress01 > 0 && inc.progress01 < 1)) throw new Error("Test failed: progress range increase");
  if (!(dec.progress01 > 0 && dec.progress01 < 1)) throw new Error("Test failed: progress range decrease");

  // Reached
  const reachedInc = computeProgress({ ...gInc, records: [{ id: "r1", date: today, value: 10 }] } as any).reached;
  const reachedDec = computeProgress({ ...gDec, records: [{ id: "r1", date: today, value: 60 }] } as any).reached;
  if (!reachedInc) throw new Error("Test failed: reached increase");
  if (!reachedDec) throw new Error("Test failed: reached decrease");

  // updateStartingNumber keeps worst baseline
  const u1 = updateStartingNumber({ ...gInc, startingNumber: 5 } as any, 4);
  if (u1 !== 4) throw new Error("Test failed: updateStartingNumber increase keeps lower");
  const u2 = updateStartingNumber({ ...gDec, startingNumber: 80 } as any, 85);
  if (u2 !== 85) throw new Error("Test failed: updateStartingNumber decrease keeps higher");
}

try {
  if (typeof process !== "undefined" && (process as any)?.env?.NODE_ENV === "test") {
    runSelfTests();
  }
} catch {
  // ignore
}

function CalendarTaskRow({
  goal,
  dateOnly,
  done,
  onToggleDone,
  onEditGoal,
  onRequestCalendarRemove,
  openRowId,
  setOpenRowId,
  onOpenGoal,
}: {
  goal: Goal;
  dateOnly: string;
  done: boolean;
  onToggleDone: (goalId: string, dateOnly: string) => void;
  onEditGoal: (g: Goal) => void;
  onRequestCalendarRemove: (goalId: string, dateOnly: string) => void;
  openRowId: string | null;
  setOpenRowId: (id: string | null) => void;
  onOpenGoal: (goalId: string) => void;
}) {
  const col = normaliseColour(goal.colour);

  const maxReveal = 112; // 2 x 56px buttons
  const isOpen = openRowId === goal.id;

  const [dragX, setDragX] = useState(0); // 0 .. -maxReveal
  const startXRef = React.useRef<number | null>(null);
  const draggingRef = React.useRef(false);

  function clamp(v: number) {
    return Math.min(0, Math.max(-maxReveal, v));
  }

  function closeActions() {
    setOpenRowId(null);
    setDragX(0);
  }

  function onPointerDown(e: React.PointerEvent) {
    // close any other open row first
    if (!isOpen && openRowId) setOpenRowId(null);

    startXRef.current = e.clientX;
    draggingRef.current = true;
    (e.currentTarget as any).setPointerCapture?.(e.pointerId);
  }

  function onPointerMove(e: React.PointerEvent) {
    if (!draggingRef.current || startXRef.current == null) return;

    const delta = e.clientX - startXRef.current; // left swipe = negative
    const base = isOpen ? -maxReveal : 0;
    setDragX(clamp(base + delta));
  }

  function onPointerUp() {
    if (!draggingRef.current) return;
    draggingRef.current = false;

    const shouldOpen = dragX < -maxReveal * 0.45;
    setOpenRowId(shouldOpen ? goal.id : null);
    setDragX(shouldOpen ? -maxReveal : 0);
    startXRef.current = null;
  }

  // keep dragX in sync if something else closes this row
  useEffect(() => {
    if (!isOpen) setDragX(0);
    if (isOpen) setDragX(-maxReveal);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen]);

  const showActions = isOpen || draggingRef.current || dragX < 0;

  return (
    <div data-cal-row="1" className="relative w-full overflow-hidden rounded-none bg-white">
      {/* Actions behind (only visible when swiping/open) */}
      <div
        data-cal-actions="1"
        className={[
          "absolute inset-0 flex items-stretch justify-end z-0 transition-opacity",
          showActions ? "opacity-100" : "opacity-0 pointer-events-none",
        ].join(" ")}
        onPointerDown={(e) => e.stopPropagation()}
        onTouchStart={(e) => e.stopPropagation()}
      >
        <button
          type="button"
          onClick={() => {
            closeActions();
            onEditGoal(goal);
          }}
          className="w-14 flex items-center justify-center bg-sky-500"
          aria-label="Edit goal"
        >
          <Pencil className="w-5 h-5 text-white" />
        </button>

        <button
          type="button"
          onClick={() => {
            closeActions();
            onRequestCalendarRemove(goal.id, dateOnly);
          }}
          className="w-14 flex items-center justify-center bg-red-600"
          aria-label="Delete goal"
        >
          <Trash2 className="w-5 h-5 text-white" />
        </button>
      </div>

      {/* Foreground row */}
      <div
        className="relative z-10 bg-white border border-slate-200 rounded-none px-3 py-3 flex items-center gap-3 touch-pan-y"
        style={{
          transform: `translateX(${dragX}px)`,
          transition: draggingRef.current ? "none" : "transform 160ms ease",
        }}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
      >
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          onToggleDone(goal.id, dateOnly);
        }}
        className={["w-9 h-9 rounded-xl border flex items-center justify-center", done ? "" : "bg-white border-slate-200"].join(" ")}
        style={done ? { backgroundColor: col, borderColor: col } : undefined}
        aria-label={done ? "Completed" : "Mark done"}
      >
        {done ? <Check className="w-4 h-4 text-white" /> : null}
      </button>

      <div className="flex-1 text-left">
        <div className={["text-sm", done ? "text-slate-400 line-through" : "text-slate-900"].join(" ")}>
          {String((goal as any).calendarName || "").trim()
            ? String((goal as any).calendarName)
            : goal.name}
        </div>
      </div>

      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          onOpenGoal(goal.id);
        }}
        className="w-10 flex items-center justify-end"
        aria-label="Open goal"
      >
        <IconBadge iconKey={goal.iconKey} colour={goal.colour} />
      </button>

      </div>
    </div>
  );
}

function CalendarScreen({
  goals,
  onToggleDone,
  onEditGoal,
  onRequestCalendarRemove,
  onOpenSettings,
  onOpenGoal,
}: {
  goals: Goal[];
  onToggleDone: (goalId: string, dateOnly: string) => void;
  onEditGoal: (g: Goal) => void;
  onRequestCalendarRemove: (goalId: string, dateOnly: string) => void;
  onOpenSettings: () => void;
  onOpenGoal: (goalId: string) => void;
}) {
  const [openRowId, setOpenRowId] = useState<string | null>(null);
  useEffect(() => {
    function onDocPointerDown(e: any) {
      const t = e.target as HTMLElement | null;
      if (!t) return;

      // If the tap is inside a calendar task row or its action buttons, do nothing
      if (t.closest('[data-cal-row="1"]') || t.closest('[data-cal-actions="1"]')) return;

      setOpenRowId(null);
    }

    document.addEventListener("pointerdown", onDocPointerDown, true);
    document.addEventListener("touchstart", onDocPointerDown, true);

    return () => {
      document.removeEventListener("pointerdown", onDocPointerDown, true);
      document.removeEventListener("touchstart", onDocPointerDown, true);
    };
  }, []);

  const todayOnly = toISODateOnly(isoToday());

  const [monthCursor, setMonthCursor] = useState(() => {
    const d = new Date();
    d.setDate(1);
    d.setHours(0, 0, 0, 0);
    return d.toISOString();
  });

  const [selectedDateOnly, setSelectedDateOnly] = useState<string>(todayOnly);
  const [calendarCollapsed, setCalendarCollapsed] = useState<boolean>(true);

  const [pickerOpen, setPickerOpen] = useState(false);

  const monthLabel = useMemo(() => {
    const d = new Date(monthCursor);
    return d.toLocaleDateString("en-GB", { month: "long", year: "numeric" });
  }, [monthCursor]);

  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, []);

  function monthKey(iso: string) {
    const d = new Date(iso);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
  }

  const monthStart = useMemo(() => {
    const d = new Date(monthCursor);
    d.setDate(1);
    d.setHours(0, 0, 0, 0);
    return d.toISOString();
  }, [monthCursor]);

  const daysInMonth = useMemo(() => {
    const d = new Date(monthStart);
    const y = d.getFullYear();
    const m = d.getMonth();
    return new Date(y, m + 1, 0).getDate();
  }, [monthStart]);

  // Monday=0 .. Sunday=6
  const firstWeekdayIndex = useMemo(() => {
    const d = new Date(monthStart);
    const js = d.getDay(); // Sun=0 .. Sat=6
    return (js + 6) % 7; // Mon=0 .. Sun=6
  }, [monthStart]);

  function addMonths(iso: string, delta: number) {
    const d = new Date(iso);
    d.setMonth(d.getMonth() + delta);
    d.setDate(1);
    d.setHours(0, 0, 0, 0);
    return d.toISOString();
  }

  function weekdayIndexFromDateOnly(dateOnly: string) {
    const d = new Date(fromISODateOnly(dateOnly));
    const js = d.getDay(); // Sun=0
    return (js + 6) % 7; // Mon=0
  }

  function isSameMonth(dateOnly: string, monthIso: string) {
    return monthKey(fromISODateOnly(dateOnly)) === monthKey(monthIso);
  }

  function weekStartMonday(dateOnly: string) {
    const d = new Date(fromISODateOnly(dateOnly));
    const js = d.getDay(); // Sun=0
    const monIndex = (js + 6) % 7; // Mon=0..Sun=6
    d.setDate(d.getDate() - monIndex);
    return toISODateOnly(d.toISOString());
  }

  function goalLabelForCalendar(goal: Goal) {
    const t = String((goal as any).calendarName || "").trim();
    return t ? t : goal.name;
  }

  function goalHasRecordOnDay(goal: Goal, dateOnly: string) {
    return (goal.records || []).some((r) => toISODateOnly(r.date) === dateOnly);
  }

  // Scheduling rules (simple + predictable):
  // - If planEnabled is false: never appears
  // - If no interval AND no days: only appears on start date
  // - If weekly: appears every week on chosen weekdays (or start weekday if none chosen)
  // - If fortnightly: appears every 2 weeks, based on start week, on chosen weekdays (or start weekday)
  // - If monthly: appears once per month on the same day-of-month as the start date
  function isGoalScheduledOn(goal: Goal, dateOnly: string) {
    if (!(goal as any).planEnabled) return false;
    const anyGoal: any = goal;
    const skips: string[] = Array.isArray(anyGoal.planSkipDates) ? anyGoal.planSkipDates : [];
    if (skips.includes(dateOnly)) return false;

    const startOnly = toISODateOnly(goal.startDate || isoToday());
    if (dateOnly < startOnly) return false;

    // If completed, keep it visible up to the completion day, but not after
    if (goal.reachedAt) {
      const reachedOnly = toISODateOnly(goal.reachedAt);
      if (dateOnly > reachedOnly) return false;
    }

    const planInterval = (goal as any).planInterval as
      | "weekly"
      | "fortnightly"
      | "monthly"
      | null
      | undefined;

    const planDaysRaw = (goal as any).planDays;
    const planDays: number[] = Array.isArray(planDaysRaw) ? planDaysRaw : [];

    const dateIso = fromISODateOnly(dateOnly);
    const startIso = fromISODateOnly(startOnly);

    const dt = new Date(dateIso);
    const st = new Date(startIso);

    const diffDays = Math.floor((dt.getTime() - st.getTime()) / (24 * 60 * 60 * 1000));

    const startW = weekdayIndexFromDateOnly(startOnly);
    const w = weekdayIndexFromDateOnly(dateOnly);
    const effectiveDays = planDays.length > 0 ? planDays : [startW];

    // One-off (no regularity selected)
    if (!planInterval) {
      if (planDays.length === 0) return dateOnly === startOnly;
      return effectiveDays.includes(w);
    }

    if (planInterval === "weekly") {
      return effectiveDays.includes(w);
    }

    if (planInterval === "fortnightly") {
      const weeksDiff = Math.floor(diffDays / 7);
      return weeksDiff % 2 === 0 && effectiveDays.includes(w);
    }

    // monthly
    const startDayOfMonth = new Date(startIso).getDate();
    const dayOfMonth = new Date(dateIso).getDate();
    return dayOfMonth === startDayOfMonth;

    // (If you later want monthly + weekdays, we can add that cleanly.)
  }

  const plannedGoals = useMemo(() => {
    return goals.filter((g) => Boolean((g as any).planEnabled));
  }, [goals]);

  const scheduledByDay = useMemo(() => {
    const map = new Map<string, Goal[]>();

    // Build entries only for the current visible month grid (plus padding)
    const totalCells = Math.ceil((firstWeekdayIndex + daysInMonth) / 7) * 7;

    for (let cell = 0; cell < totalCells; cell++) {
      const dayNum = cell - firstWeekdayIndex + 1;
      const inMonth = dayNum >= 1 && dayNum <= daysInMonth;

      let dateOnly: string;
      if (inMonth) {
        const d = new Date(monthStart);
        d.setDate(dayNum);
        dateOnly = toISODateOnly(d.toISOString());
      } else {
        // still compute the date so dots can show on leading/trailing days if relevant
        const d = new Date(monthStart);
        d.setDate(dayNum);
        dateOnly = toISODateOnly(d.toISOString());
      }

      const list = plannedGoals.filter((g) => isGoalScheduledOn(g, dateOnly));
      if (list.length) map.set(dateOnly, list);
    }

    return map;
  }, [plannedGoals, monthStart, firstWeekdayIndex, daysInMonth]);

  const tasksForSelectedDay = useMemo(() => {
    const list = plannedGoals.filter((g) => isGoalScheduledOn(g, selectedDateOnly));
    return [...list].sort((a, b) => goalLabelForCalendar(a).localeCompare(goalLabelForCalendar(b)));
  }, [plannedGoals, selectedDateOnly]);

  const totalCells = Math.ceil((firstWeekdayIndex + daysInMonth) / 7) * 7;

  function jumpToDate(dateOnly: string) {
    setSelectedDateOnly(dateOnly);
    const d = new Date(fromISODateOnly(dateOnly));
    d.setDate(1);
    d.setHours(0, 0, 0, 0);
    setMonthCursor(d.toISOString());
  }
  const selectedCellClass = "bg-sky-50";

  const deadlinesForSelectedDay = useMemo(() => {
    return (goals || [])
      .filter((g) => String(g.targetDate || "").trim() !== "")
      .filter((g) => toISODateOnly(g.targetDate) === selectedDateOnly)
      .sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
  }, [goals, selectedDateOnly]);

  return (
    <AppShell
      title="Calendar"
      left={null}
      right={
        <button
          className="w-10 h-10 rounded-2xl bg-white border border-slate-200 flex items-center justify-center"
          onClick={onOpenSettings}
          aria-label="Settings"
          title="Settings"
        >
          <Settings className="w-5 h-5 text-slate-600" />
        </button>
      }
    >

      <style>{`
        .cal-scroll::-webkit-scrollbar { width: 6px; }
        .cal-scroll::-webkit-scrollbar-track { background: transparent; }
        .cal-scroll::-webkit-scrollbar-thumb { background: rgba(100,116,139,0.35); border-radius: 999px; }
      `}</style>

      <div className="flex flex-col h-[calc(100vh-56px-2rem)] overflow-hidden">
        {/* Fixed top area */}
        <div className="shrink-0">
          {/* Top header */}
          <div className="flex items-center justify-between">
            <button
              type="button"
              onClick={() => setMonthCursor((m) => addMonths(m, -1))}
              className="w-10 h-10 rounded-2xl bg-white border border-slate-200 flex items-center justify-center"
              aria-label="Previous month"
            >
              <ArrowLeft className="w-4 h-4 text-slate-700" />
            </button>

            {/* Tapping the month label opens the native date picker */}
            <div className="relative">
              <button
                type="button"
                className="h-10 px-4 rounded-2xl bg-white border border-slate-200 text-sm font-semibold text-slate-800"
                aria-label="Choose date"
              >
                {monthLabel}
              </button>

              <input
                id="cal-date-picker"
                type="date"
                value={selectedDateOnly}
                onChange={(e) => {
                  const v = e.target.value;
                  if (!v) return;
                  jumpToDate(v);
                }}
                className="absolute inset-0 opacity-0 cursor-pointer"
                aria-label="Choose date"
              />
            </div>

            <button
              type="button"
              onClick={() => setMonthCursor((m) => addMonths(m, 1))}
              className="w-10 h-10 rounded-2xl bg-white border border-slate-200 flex items-center justify-center"
              aria-label="Next month"
            >
              <ArrowRight className="w-4 h-4 text-slate-700" />
            </button>
          </div>

          {/* Weekday labels (always visible) */}
          <div className="mt-3 grid grid-cols-7 text-[11px] text-slate-500">
          {["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].map((d) => (
              <div key={d} className="text-center">
                {d}
              </div>
            ))}
          </div>

          {/* Calendar area (week by default, month when expanded) */}
          {calendarCollapsed ? (
            <div className="mt-2 grid grid-cols-7 border border-slate-200 rounded-2xl overflow-hidden bg-white">
              {Array.from({ length: 7 }).map((_, i) => {
                const start = weekStartMonday(selectedDateOnly);
                const dateOnly = addDaysDateOnly(start, i);

                const d = new Date(fromISODateOnly(dateOnly));
                const isToday = dateOnly === todayOnly;
                const isSelected = dateOnly === selectedDateOnly;

                const dayTasks = plannedGoals.filter((g) => isGoalScheduledOn(g, dateOnly));

                return (
                  <button
                    key={dateOnly}
                    type="button"
                    onClick={() => {
                      setOpenRowId(null);
                      setSelectedDateOnly(dateOnly);
                      if (!isSameMonth(dateOnly, monthStart)) setMonthCursor(d.toISOString());
                    }}
                    className={[
                      "h-12 flex flex-col items-center justify-between py-1.5 border-r border-slate-200 last:border-r-0",
                      isSelected ? selectedCellClass : "bg-white",
                    ].join(" ")}

                  >
                    <div className={["text-xs", isToday ? "font-semibold text-slate-900" : "text-slate-700"].join(" ")}>
                      {d.getDate()}
                    </div>

                    {/* 2 rows x 4 slots, 8th is +N */}
                    <div className="w-full flex items-center justify-center px-2">
                      <div className="grid grid-cols-4 grid-rows-2 gap-x-1 gap-y-1">
                        {(() => {
                          const maxDots = 7;
                          const showMore = dayTasks.length > maxDots;
                          const dots = dayTasks.slice(0, maxDots);

                          const slots: React.ReactNode[] = [];

                          for (const g of dots) {
                            const done = goalHasRecordOnDay(g, dateOnly);
                            const col = normaliseColour(g.colour);

                            slots.push(
                              <span
                                key={g.id}
                                className="w-1.5 h-1.5 rounded-full border"
                                style={{
                                  borderColor: col,
                                  backgroundColor: done ? col : "transparent",
                                }}
                              />
                            );
                          }

                          if (showMore) {
                            const extra = dayTasks.length - maxDots;
                            slots.push(
                              <span
                                key="more"
                                className="w-2 h-2 flex items-center justify-center text-[8px] text-slate-500 leading-none"
                                title={`+${extra} more`}
                              >
                                +{extra}
                              </span>
                            );
                          } else {
                            slots.push(<span key="empty" className="w-2 h-2" />);
                          }

                          while (slots.length < 8) slots.push(<span key={`pad-${slots.length}`} className="w-2 h-2" />);
                          return slots;
                        })()}
                      </div>
                    </div>
                  </button>
                );
              })}
            </div>
          ) : (
            <div className="mt-2 grid grid-cols-7 border border-slate-200 rounded-2xl overflow-hidden bg-white">
              {Array.from({ length: totalCells }).map((_, cell) => {
                const dayNum = cell - firstWeekdayIndex + 1;
                const inMonth = dayNum >= 1 && dayNum <= daysInMonth;

                const d = new Date(monthStart);
                d.setDate(dayNum);
                const dateOnly = toISODateOnly(d.toISOString());

                const isToday = dateOnly === todayOnly;
                const isSelected = dateOnly === selectedDateOnly;

                const dayTasks = scheduledByDay.get(dateOnly) || [];

                return (
                  <button
                    key={dateOnly}
                    type="button"
                    onClick={() => {
                      setSelectedDateOnly(dateOnly);
                      if (!isSameMonth(dateOnly, monthStart)) setMonthCursor(d.toISOString());
                    }}
                    className={[
                      "h-12 flex flex-col items-center justify-between py-1.5 border-r border-b border-slate-200",
                      isSelected ? selectedCellClass : inMonth ? "bg-white" : "bg-slate-50",
                    ].join(" ")}

                  >
                    <div
                      className={[
                        "text-xs",
                        inMonth ? "text-slate-700" : "text-slate-400",
                        isToday ? "font-semibold" : "font-normal",
                      ].join(" ")}
                    >
                      {d.getDate()}
                    </div>

                    <div className="w-full flex items-center justify-center px-2">
                      <div className="grid grid-cols-4 grid-rows-2 gap-x-1 gap-y-1">
                        {(() => {
                          const maxDots = 7;
                          const showMore = dayTasks.length > maxDots;
                          const dots = dayTasks.slice(0, maxDots);

                          const slots: React.ReactNode[] = [];

                          for (const g of dots) {
                            const done = goalHasRecordOnDay(g, dateOnly);
                            const col = normaliseColour(g.colour);

                            slots.push(
                              <span
                                key={g.id}
                                className="w-1.5 h-1.5 rounded-full border"
                                style={{
                                  borderColor: col,
                                  backgroundColor: done ? col : "transparent",
                                }}
                              />
                            );
                          }

                          if (showMore) {
                            const extra = dayTasks.length - maxDots;
                            slots.push(
                              <span key="more" className="w-2 h-2 flex items-center justify-center text-[8px] text-slate-500 leading-none">
                                +{extra}
                              </span>
                            );
                          } else {
                            slots.push(<span key="empty" className="w-2 h-2" />);
                          }

                          while (slots.length < 8) slots.push(<span key={`pad-${slots.length}`} className="w-2 h-2" />);
                          return slots;
                        })()}
                      </div>
                    </div>
                  </button>
                );
              })}
            </div>
          )}

          {/* Centre toggle handle */}
          <div className="mt-1 flex justify-center">
            <button
              type="button"
              onClick={() => setCalendarCollapsed((v) => !v)}
              className="p-2 flex items-center justify-center"
              aria-label={calendarCollapsed ? "Expand to month view" : "Collapse to week view"}
            >
              {calendarCollapsed ? (
                <ChevronDown className="w-5 h-5 text-slate-400" />
              ) : (
                <ChevronUp className="w-5 h-5 text-slate-400" />
              )}
            </button>
          </div>

          {/* Fixed day title (NOT scrollable) */}
          <div className="mt-2 text-sm font-semibold text-slate-800">
            {selectedDateOnly === todayOnly
              ? "Today"
              : new Date(fromISODateOnly(selectedDateOnly)).toLocaleDateString("en-GB", {
                  weekday: "long",
                  day: "numeric",
                  month: "short",
                })}
          </div>
        </div>

        {/* Scrollable bottom area (ONLY tasks scroll) */}
        <div
          className="cal-scroll flex-1 overflow-y-auto mt-3 pb-24 overscroll-contain"
          style={{ scrollbarWidth: "thin" }}
        >
        <div className="space-y-2">

        {/* DEADLINES */}
        {deadlinesForSelectedDay.length > 0 && (
          <div className="pt-2 space-y-2">
            {deadlinesForSelectedDay.map((g) => (
              <div
                key={`deadline-${g.id}`}
                className="flex items-center justify-between rounded-2xl border border-amber-200 bg-amber-50 px-3 py-2"
              >
                <div className="min-w-0">
                  <div className="text-sm font-semibold text-slate-800 truncate">
                    {g.name}
                  </div>
                  <div className="text-xs text-slate-600">
                    Target date
                  </div>
                </div>
                {g.targetNumber != null && g.targetNumber !== "" ? (
                  <div className="text-xs font-semibold text-amber-700 px-2 py-1 rounded-xl">
                    {g.targetNumber}
                    {g.unit ? ` ${g.unit}` : ""}
                  </div>
                ) : null}
              </div>
            ))}
          </div>
        )}
          {tasksForSelectedDay.length === 0 ? (
            <div className="text-sm text-slate-500 bg-white border border-slate-200 rounded-2xl p-4">
              Nothing planned for this day.
            </div>
          ) : (
            tasksForSelectedDay.map((g) => {
              const done = goalHasRecordOnDay(g, selectedDateOnly);

              return (
                <CalendarTaskRow
                  key={g.id}
                  goal={g}
                  dateOnly={selectedDateOnly}
                  done={done}
                  onToggleDone={onToggleDone}
                  onEditGoal={onEditGoal}
                  onRequestCalendarRemove={onRequestCalendarRemove}
                  openRowId={openRowId}
                  setOpenRowId={setOpenRowId}
                  onOpenGoal={onOpenGoal}
                />
              );
            })
          )}
        </div>

        </div>
      </div>
    </AppShell>
  );
}
