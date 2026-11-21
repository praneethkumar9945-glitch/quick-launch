import assert from 'node:assert/strict';
import { describe, it } from 'vitest';
import { filterStudentsByEligibility } from '../utils/examinationEligibility';

const students = [
  { id: 'student-1', name: 'Eligible One' },
  { id: 'student-2', name: 'Not Eligible' },
  { id: 'student-3', name: 'Eligible Two' }
];
const eligibleStudentIds = new Set(['student-1', 'student-3']);

describe('Examination eligibility filter', () => {
  it('shows every student when All Students is selected', () => {
    assert.deepEqual(
      filterStudentsByEligibility(students, eligibleStudentIds, 'all').map((student) => student.id),
      ['student-1', 'student-2', 'student-3']
    );
  });

  it('shows only eligible students when Eligible is selected', () => {
    assert.deepEqual(
      filterStudentsByEligibility(students, eligibleStudentIds, 'eligible').map((student) => student.id),
      ['student-1', 'student-3']
    );
  });

  it('shows only not eligible students when Not Eligible is selected', () => {
    assert.deepEqual(
      filterStudentsByEligibility(students, eligibleStudentIds, 'not-eligible').map((student) => student.id),
      ['student-2']
    );
  });
});
