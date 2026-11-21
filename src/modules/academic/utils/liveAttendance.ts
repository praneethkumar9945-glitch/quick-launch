/**
 * Live class attendance derived from biometric punches.
 *
 * A biometric feed (see data/biometricFeed.ts) supplies punch-in / punch-out
 * events; these rules turn them into the live status a trainer sees while
 * teaching. Keep this module pure so it can be unit-tested and reused when a
 * real device integration replaces the simulated feed.
 */

export type LiveAttendanceStatus = 'Present' | 'Late' | 'Absent' | 'Leave' | 'Awaiting';

export interface BiometricPunch {
  studentId: string;
  type: 'IN' | 'OUT';
  /** Minutes since midnight (local time) */
  minutes: number;
}

/** Minutes after class start a student may punch in and still count as Present. */
export const LATE_GRACE_MINUTES = 10;

export interface LiveStudentAttendance {
  status: LiveAttendanceStatus;
  /** First punch-in of the class window, minutes since midnight */
  loginMinutes?: number | undefined;
  /** Last punch-out after the last punch-in, minutes since midnight */
  logoutMinutes?: number | undefined;
  /** True when the student has punched in and not punched out since */
  inClass: boolean;
}

export function deriveLiveAttendance(input: {
  punches: BiometricPunch[];
  onLeave: boolean;
  classStartMinutes: number;
  nowMinutes: number;
  graceMinutes?: number | undefined;
}): LiveStudentAttendance {
  const grace = input.graceMinutes ?? LATE_GRACE_MINUTES;
  const visible = input.punches
    .filter((punch) => punch.minutes <= input.nowMinutes)
    .sort((a, b) => a.minutes - b.minutes);

  const firstIn = visible.find((punch) => punch.type === 'IN');
  const lastPunch = visible[visible.length - 1];
  const lastIn = [...visible].reverse().find((punch) => punch.type === 'IN');
  const logout = lastIn
    ? [...visible].reverse().find((punch) => punch.type === 'OUT' && punch.minutes >= lastIn.minutes)
    : undefined;

  if (!firstIn) {
    if (input.onLeave) return { status: 'Leave', inClass: false };
    const absent = input.nowMinutes > input.classStartMinutes + grace;
    return { status: absent ? 'Absent' : 'Awaiting', inClass: false };
  }

  return {
    status: firstIn.minutes <= input.classStartMinutes + grace ? 'Present' : 'Late',
    loginMinutes: firstIn.minutes,
    logoutMinutes: logout?.minutes,
    inClass: lastPunch?.type === 'IN'
  };
}

export function formatClockMinutes(minutes: number): string {
  const hour = Math.floor(minutes / 60) % 24;
  const minute = Math.floor(minutes % 60);
  const suffix = hour >= 12 ? 'PM' : 'AM';
  return `${String(hour % 12 || 12).padStart(2, '0')}:${String(minute).padStart(2, '0')} ${suffix}`;
}
