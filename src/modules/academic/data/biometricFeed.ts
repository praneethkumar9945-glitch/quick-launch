import { ScheduleItem } from '../types';
import { BiometricPunch } from '../utils/liveAttendance';
import { getScheduleBatchId, parseTimeToMinutes } from '../utils/dateTimeUtils';

/**
 * Source of biometric punches for a class. The simulated feed below stands in
 * for a real attendance device until one is connected; swap
 * `biometricFeed` for a device-backed implementation with the same shape.
 */
export interface BiometricFeed {
  readonly isSimulated: boolean;
  getClassPunches(schedule: ScheduleItem, date: string): BiometricPunch[];
  getStudentsOnLeave(schedule: ScheduleItem, date: string): Set<string>;
}

function stableHash(value: string): number {
  return [...value].reduce((hash, character) => (hash * 31 + character.charCodeAt(0)) >>> 0, 7);
}

export const simulatedBiometricFeed: BiometricFeed = {
  isSimulated: true,
  getClassPunches(schedule, date) {
    const batchId = getScheduleBatchId(schedule);
    const start = parseTimeToMinutes(schedule.startTime);
    const end = parseTimeToMinutes(schedule.endTime);
    const punches: BiometricPunch[] = [];

    schedule.students.forEach((student) => {
      const seed = stableHash(`${batchId}|${student.id}|${date}|live`);
      const bucket = seed % 20;
      if (bucket < 2) return; // absent or on leave, no punches
      const late = bucket < 5;
      const inAt = late ? start + 11 + (seed % 25) : start - 12 + (seed % 20);
      punches.push({ studentId: student.id, type: 'IN', minutes: inAt });

      if (bucket === 5) {
        // Short break: steps out and returns mid-class
        const outAt = inAt + 30 + (seed % 20);
        punches.push({ studentId: student.id, type: 'OUT', minutes: outAt });
        punches.push({ studentId: student.id, type: 'IN', minutes: outAt + 8 + (seed % 7) });
      }
      if (bucket === 6) {
        // Leaves early
        punches.push({ studentId: student.id, type: 'OUT', minutes: end - 25 - (seed % 20) });
        return;
      }
      punches.push({ studentId: student.id, type: 'OUT', minutes: end + 1 + (seed % 9) });
    });

    return punches;
  },
  getStudentsOnLeave(schedule, date) {
    const batchId = getScheduleBatchId(schedule);
    return new Set(
      schedule.students
        .filter((student) => stableHash(`${batchId}|${student.id}|${date}|live`) % 20 === 1)
        .map((student) => student.id)
    );
  }
};

export const biometricFeed: BiometricFeed = simulatedBiometricFeed;
