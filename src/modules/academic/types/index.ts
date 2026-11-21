export type ScheduleApprovalStatus = 'Pending' | 'Approved' | 'Change Requested';
export type SyllabusUpdateStatus = 'Updated' | 'Pending Update' | 'Class Not Conducted' | 'Not Started';
export type SessionOutcome = 'Completed' | 'Not Conducted' | 'Scheduled' | 'Rescheduled';

export interface Student {
  id: string;
  name: string;
  rollNumber: string;
  attendancePercent: number;
  email: string;
  photoUrl?: string | undefined;
  fullName?: string | undefined;
  admissionNumber?: string | undefined;
  dateOfBirth?: string | undefined;
  gender?: string | undefined;
  contactNumber?: string | undefined;
  address?: string | undefined;
  guardianName?: string | undefined;
  guardianContactNumber?: string | undefined;
  qualification?: string | undefined;
  courseName?: string | undefined;
  batchName?: string | undefined;
  admissionDate?: string | undefined;
  studentStatus?: string | undefined;
}

export type AttendanceStatus = 'Present' | 'Absent' | 'Late' | 'Holiday';

export interface AttendanceRecord {
  id: string;
  studentId: string;
  batchId: string;
  attendanceDate: string;
  status: AttendanceStatus;
  checkInTime?: string | undefined;
  checkOutTime?: string | undefined;
  source: 'Biometric' | 'Authorized Admin Correction';
  lastSynchronizedAt?: string | undefined;
}

export interface SyllabusTopic {
  id: string;
  number: number;
  title: string;
  isCompleted: boolean;
  completedDate?: string | undefined; // YYYY-MM-DD or formatted system date
  completedSessionId?: string | undefined;
}

export interface ModuleData {
  id: string;
  code: string;
  name: string;
  batch: string;
  level: string;
  duration: string;
  totalSessions: number;
  description: string;
  topics: SyllabusTopic[];
}

export interface ScheduleItem {
  id: string;
  batchId?: string | undefined;
  moduleId: string;
  moduleName: string;
  batch: string;
  startDate: string;     // Batch Start Date (YYYY-MM-DD)
  historicalEndDate?: string | undefined; // Frozen calculated end date once the module is completed
  topicScheduleAdjustments?: Record<string, string> | undefined;
  scheduledDate: string; // Current / Anchor date (YYYY-MM-DD)
  scheduledDays: number[]; // 0: Sunday through 6: Saturday
  startTime: string;     // e.g. "09:00 AM"
  endTime: string;       // e.g. "11:00 AM"
  sessionNumber: number;
  totalSessions: number;
  roomOrLink: string;
  approvalStatus: ScheduleApprovalStatus;
  changeRequestReason?: string | undefined;
  syllabusUpdateStatus: SyllabusUpdateStatus;
  students: Student[];
  missedReason?: string | undefined;
  completedTopicIds?: string[] | undefined;
}

export interface ScheduledSyllabusSession {
  id: string;
  scheduleId: string;
  batchId: string;
  moduleId: string;
  scheduledDate: string;
  startTime: string;
  endTime: string;
  sessionNumber: number;
  outcome?: 'Conducted' | 'Not Conducted' | undefined;
  syllabusUpdateStatus: SyllabusUpdateStatus;
}

export interface TopicScheduleChangeRequest {
  id: string;
  scheduleId: string;
  batchId: string;
  batchName: string;
  moduleId: string;
  moduleName: string;
  topicId: string;
  topicName: string;
  originalScheduledDate: string;
  postponeFrom: string;
  postponeUntil: string;
  rescheduledDate: string;
  reason: string;
  requestedAt: string;
  status: 'Pending' | 'Approved' | 'Rejected';
  decidedAt?: string | undefined;
  decisionReason?: string | undefined;
}

export interface SyllabusActivityEvent {
  id: string;
  timestamp: string; // ISO date-time string
  displayDate: string;
  batchId: string;
  batchName?: string | undefined;
  moduleId: string;
  moduleName: string;
  eventType:
    | 'Topic Completed'
    | 'Class Not Conducted'
    | 'MCQ Assessment Sent'
    | 'MCQ Assessment Completed'
    | 'Topic Requires Retake'
    | 'Topic Being Taken Again'
    | 'Topic Notes Uploaded'
    | 'Topic Notes Updated'
    | 'Topic Notes Released'
    | 'Module Submitted for Finance Verification';
  scheduledDate?: string | undefined;
  topicId?: string | undefined;
  topicName?: string | undefined;
  topicNumber?: number | undefined;
  assessmentId?: string | undefined;
  assessmentCompletionStatus?: SyllabusAssessmentStatus | undefined;
  finalAssessmentResult?: string | undefined;
  trainerId?: string | undefined;
  relatedCompletionEventId?: string | undefined;
  details?: string | undefined;
  sessionId?: string | undefined;
  sessionIdentifier?: string | undefined; // e.g. "Session 12 (09:00 AM - 10:00 AM)"
  reason?: string | undefined;
  savedStatus: 'Saved' | 'Pending';
}

export interface TopicNotesMetadata {
  id: string;
  trainerId: string;
  moduleId: string;
  topicId: string;
  fileName: string;
  fileSize: number;
  fileType: string;
  storageReference: string;
  version: number;
  uploadedAt: string;
  lastUpdatedAt: string;
}

export interface TopicNotesRelease {
  id: string;
  batchId: string;
  moduleId: string;
  topicId: string;
  notesId: string;
  notesVersion: number;
  assessmentCompletionStatus: 'Completed';
  availabilityStatus: 'Notes Uploaded';
  releasedAt: string;
}

export type TopicNotesAvailabilityStatus = 'Notes Locked' | 'Notes Pending' | 'Notes Uploaded';

export interface SyllabusAssessmentQuestion {
  question: string;
  options: string[];
  correctOption: number;
}

export interface SyllabusAssessmentStudentResult {
  studentId: string;
  studentName: string;
  score: number | null;
  submittedAt?: string | undefined;
}

export type SyllabusAssessmentStatus = 'Sent' | 'In Progress' | 'Completed';

export interface SyllabusAssessment {
  id: string;
  batchId: string;
  moduleId: string;
  topicId: string;
  topicName: string;
  attempt: number;
  questions: SyllabusAssessmentQuestion[];
  students: SyllabusAssessmentStudentResult[];
  status: SyllabusAssessmentStatus;
  sentAt: string;
  completedAt?: string | undefined;
  classAgainStartedAt?: string | undefined;
}

export interface NotificationItem {
  id: string;
  title: string;
  message: string;
  timestamp: string;
  category: 'syllabus_overdue' | 'schedule_approval' | 'examination' | 'system';
  isResolved: boolean;
  moduleId?: string | undefined;
  sessionId?: string | undefined;
  dateContext?: string | undefined;
  actionLabel?: string | undefined;
  relatedRequestId?: string | undefined;
  targetRole?: 'Finance Department' | 'Admin' | undefined;
}

export type ExaminationComponentType =
  | 'Theory'
  | 'Practical'
  | 'Technical Viva'
  | 'Industrial Viva'
  | 'Project';

export type ExaminationCompletionComponent = 'Theory' | 'Practical' | 'Viva' | 'Project';

export interface ExaminationCompletionStatusItem {
  completed: boolean;
  completedAt?: string | undefined;
  trainerId?: string | undefined;
  trainerName?: string | undefined;
  eventId?: string | undefined;
}

export type ExaminationCompletionState = Partial<Record<ExaminationCompletionComponent, ExaminationCompletionStatusItem>>;

export interface ExaminationCompletionEvent {
  eventId: string;
  eventType: 'EXAM_COMPONENT_COMPLETED';
  batchId: string;
  batchName: string;
  moduleId: string;
  moduleName: string;
  scheduleId: string;
  component: ExaminationCompletionComponent;
  trainerId?: string | undefined;
  trainerName?: string | undefined;
  completedAt: string;
  notificationStatus: 'PENDING_INTEGRATION';
}

export interface AdminExaminationComponent {
  scheduledDate: string;
  scheduledTime: string;
  endTime?: string | undefined;
  maxMarks?: number | undefined;
  details?: string | undefined;
}

export interface ExaminationEligibleStudent {
  studentId: string;
  studentName: string;
  batchName: string;
  eligibilityRemarks?: string | undefined;
}

export interface AdminExaminationScheduleUpdate {
  id: string;
  component: ExaminationComponentType;
  previousDate: string;
  previousTime: string;
  updatedDate: string;
  updatedTime: string;
  timestamp: string;
  details?: string | undefined;
}

export interface AdminExamination {
  id: string;
  batchId: string;
  batchName: string;
  moduleId: string;
  moduleName: string;
  components: Partial<Record<ExaminationComponentType, AdminExaminationComponent>>;
  eligibleStudents: ExaminationEligibleStudent[];
  publishedAt: string;
  status: 'Admin Published';
  publishedBy: string;
  scheduleUpdates: AdminExaminationScheduleUpdate[];
  adminDetails?: string | undefined;
}

export interface ExaminationStudentMarks {
  studentId: string;
  theory: number | null;
  practical: number | null;
  technicalViva?: number | null | undefined;
  industrialViva?: number | null | undefined;
  project: number | null;
}

export type ExaminationMarksStatus = 'Draft' | 'Submitted';

export interface ExaminationMarksRecord {
  id: string;
  examinationId: string;
  batchId: string;
  moduleId: string;
  trainerId: string;
  studentMarks: ExaminationStudentMarks[];
  status: ExaminationMarksStatus;
  savedAt?: string | undefined;
  submittedAt?: string | undefined;
}

export interface TrainerProfile {
  name: string;
  trainerId: string;
  email: string;
  department: string;
  assignedBatches: string[];
  phone: string;
  officeHours: string;
  joinedDate: string;
  designation: string;
}

export interface ToastMessage {
  id: string;
  type: 'success' | 'error' | 'warning' | 'info';
  title: string;
  message: string;
}

export type AdminTaskStatus = 'Pending' | 'In Progress' | 'Completed';
export type AdminTaskPriority = 'High' | 'Medium' | 'Normal';
export type AdminTaskCategory = 'Evaluation & Grading' | 'Curriculum Review' | 'Student Mentoring' | 'Lab & Infrastructure' | 'Faculty Sync';

export interface AdminTask {
  id: string;
  title: string;
  description: string;
  assignedDate: string; // YYYY-MM-DD
  startTime: string;     // e.g. "01:30 PM" (during trainer's free hours)
  endTime: string;       // e.g. "03:00 PM"
  status: AdminTaskStatus;
  priority: AdminTaskPriority;
  category: AdminTaskCategory;
  assignedBy: string;    // e.g. "Academic Administration"
  deliverables?: string | undefined;
  completionNotes?: string | undefined;
}

export interface FreeHourSlot {
  id: string;
  date: string;
  startTime: string;
  endTime: string;
  durationMinutes: number;
  assignedTasks: AdminTask[];
}
