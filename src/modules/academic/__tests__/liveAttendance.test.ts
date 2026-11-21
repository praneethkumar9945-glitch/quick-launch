import assert from 'node:assert/strict';
import { describe, it } from 'vitest';
import { deriveLiveAttendance, LATE_GRACE_MINUTES } from '../utils/liveAttendance';

const START = 11 * 60; // 11:00 AM
const punchIn = (minutes: number) => ({ studentId: 's1', type: 'IN' as const, minutes });
const punchOut = (minutes: number) => ({ studentId: 's1', type: 'OUT' as const, minutes });

describe('live class attendance from biometric punches', () => {
  it('uses a 10 minute late grace period', () => {
    assert.equal(LATE_GRACE_MINUTES, 10);
  });

  it('marks a punch-in within 10 minutes of class start as Present', () => {
    const result = deriveLiveAttendance({ punches: [punchIn(START + 10)], onLeave: false, classStartMinutes: START, nowMinutes: START + 30 });
    assert.equal(result.status, 'Present');
    assert.equal(result.loginMinutes, START + 10);
    assert.equal(result.inClass, true);
  });

  it('marks a punch-in more than 10 minutes after start as Late', () => {
    const result = deriveLiveAttendance({ punches: [punchIn(START + 11)], onLeave: false, classStartMinutes: START, nowMinutes: START + 30 });
    assert.equal(result.status, 'Late');
  });

  it('marks a student with no punch as Absent once the grace period passes', () => {
    assert.equal(deriveLiveAttendance({ punches: [], onLeave: false, classStartMinutes: START, nowMinutes: START + 5 }).status, 'Awaiting');
    assert.equal(deriveLiveAttendance({ punches: [], onLeave: false, classStartMinutes: START, nowMinutes: START + 11 }).status, 'Absent');
  });

  it('shows Leave for a student on approved leave with no punch', () => {
    assert.equal(deriveLiveAttendance({ punches: [], onLeave: true, classStartMinutes: START, nowMinutes: START + 30 }).status, 'Leave');
  });

  it('records logout time and stops showing the student in class after punch-out', () => {
    const result = deriveLiveAttendance({ punches: [punchIn(START - 5), punchOut(START + 60)], onLeave: false, classStartMinutes: START, nowMinutes: START + 90 });
    assert.equal(result.logoutMinutes, START + 60);
    assert.equal(result.inClass, false);
  });

  it('ignores punches that have not happened yet', () => {
    const result = deriveLiveAttendance({ punches: [punchIn(START - 5), punchOut(START + 60)], onLeave: false, classStartMinutes: START, nowMinutes: START + 20 });
    assert.equal(result.logoutMinutes, undefined);
    assert.equal(result.inClass, true);
  });
});
