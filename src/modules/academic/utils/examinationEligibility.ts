export type EligibilityFilter = 'all' | 'eligible' | 'not-eligible';

export function filterStudentsByEligibility<Student extends { id: string }>(
  students: Student[],
  eligibleStudentIds: ReadonlySet<string>,
  filter: EligibilityFilter
): Student[] {
  if (filter === 'all') return students;

  const shouldBeEligible = filter === 'eligible';
  return students.filter((student) => eligibleStudentIds.has(student.id) === shouldBeEligible);
}
