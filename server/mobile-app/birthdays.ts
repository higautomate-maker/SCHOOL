// Read-only "birthdays this week" helper.
//
// PRIVACY: callers must pass ONLY records the principal is already authorized to
// see (a student's own record; a parent's linked children). This helper never
// widens visibility and never exposes the birth YEAR, surname, id, or full DOB —
// only a first name + weekday + relative day count.

export type BirthdayStudent = {
  firstName?: string | null;
  fullName?: string | null;
  dateOfBirth?: string | null; // ISO date (YYYY-MM-DD)
};

export type BirthdayEntry = {
  name: string;
  weekday: string;
  inDays: number;
  isToday: boolean;
};

const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

function firstNameOnly(student: BirthdayStudent): string {
  if (student.firstName && student.firstName.trim()) return student.firstName.trim();
  const full = (student.fullName ?? "").trim();
  return full ? full.split(/\s+/)[0] : "Student";
}

// Days from `now` (at local midnight) until this student's next birthday, or
// null if the DOB is missing/unparseable or falls outside the window.
function daysUntilBirthday(dob: string, now: Date, windowDays: number): number | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(dob.trim());
  if (!match) return null;
  const month = Number(match[2]) - 1;
  const day = Number(match[3]);
  if (month < 0 || month > 11 || day < 1 || day > 31) return null;

  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  let next = new Date(today.getFullYear(), month, day);
  if (next.getTime() < today.getTime()) next = new Date(today.getFullYear() + 1, month, day);
  // Guard against invalid dates (e.g. Feb 29 rolled over by the Date ctor).
  if (next.getMonth() !== month) return null;
  const diff = Math.round((next.getTime() - today.getTime()) / 86_400_000);
  return diff >= 0 && diff <= windowDays ? diff : null;
}

export function upcomingBirthdays(
  students: BirthdayStudent[],
  now: Date = new Date(),
  windowDays = 7,
): BirthdayEntry[] {
  const entries: BirthdayEntry[] = [];
  for (const student of students) {
    if (!student.dateOfBirth) continue;
    const inDays = daysUntilBirthday(student.dateOfBirth, now, windowDays);
    if (inDays === null) continue;
    const when = new Date(now.getFullYear(), now.getMonth(), now.getDate() + inDays);
    entries.push({
      name: firstNameOnly(student),
      weekday: WEEKDAYS[when.getDay()],
      inDays,
      isToday: inDays === 0,
    });
  }
  return entries.sort((a, b) => a.inDays - b.inDays);
}
