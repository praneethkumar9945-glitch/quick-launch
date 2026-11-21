import {
  type Context,
  createContext,
  useContext,
  useEffect,
  useMemo,
  useReducer,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { cashCountReducer, initialCashCount } from "./cashCount";
import { canonicalAdmissionNo } from "./billing";
import { seedCourseCatalog, SEED_DEPARTMENTS } from "./courses";
import {
  EXPENSE_CATEGORIES,
  INCOME_CATEGORIES,
  OPENING,
  PETTY_CATEGORIES,
  seedPetty,
  seedPayments,
  seedSettlements,
  seedStudents,
  seedTransactions,
} from "./data";
import { isCash, pettyDailyBalances, sum, TODAY } from "./logic";
import type {
  CourseCatalog,
  DocumentCorrectionItem,
  DocumentCorrectionRequest,
  DocumentVerification,
  ApplicationRejection,
  FeePayment,
  FeeReminder,
  FeeWorkflowPayment,
  Handoff,
  InstallmentReminder,
  Person,
  PettyEntry,
  Settlement,
  Student,
  Transaction,
} from "./types";
import {
  ADMISSION_NO_RECEIVED_TEXT,
  ADMINISTRATION_PAYMENT_NOTIFIED_TEXT,
} from "./feeWorkflowConfig";
import {
  areAllPaymentsAdministrationNotified,
  allocatePayment,
  autoForwardEligibleApplications,
  createDemoBillingPayments,
  createDemoBillingStudents,
  createDemoFeeWorkflow,
  createNewFeeWorkflowPayment,
  feeWorkflowPaymentStatus,
  markPaymentsAdministrationNotified,
  mergeBillingPayments,
  preparePaymentConfirmation,
  studentFromAdmittedPerson,
  validateAdmissionNo,
  documentVerificationStatus,
  isApplicationVerified,
} from "./feeWorkflow";
import { personFromStudent } from "./feeWorkflowConfig";
import type { FeeWorkflowState } from "./feeWorkflow";
import { ensureTransactionIds } from "./transactionIds";
import { nextAvailableReceiptNumber } from "./receipt";
import {
  DOCUMENT_CORRECTIONS_STORAGE_KEY,
  applyResubmissions,
  addDocumentsToOpenCorrectionRequest,
  createCorrectionRequest,
  loadStoredCorrections,
  resubmitCorrection,
  sampleDocumentFile,
  saveStoredCorrections,
} from "./documentCorrections";
import type { BankStatementImport } from "./bankStatementImport";
import type { BankReconciliationDecision } from "./bankReconciliation";
import { createSimulatedConcessions } from "./concessionSeed";
import {
  applyApprovedConcession,
  eligibleFeeTotal,
  forwardToDirector,
  normalizeConcessionRequest,
  saveReview,
  type ConcessionRequest,
  type ConcessionResult,
  type AccountsReview,
} from "./concessions";

const COURSE_CATALOG_STORAGE_KEY = "finance-course-catalog-v2";
const BANK_STATEMENT_IMPORTS_STORAGE_KEY = "finance-bank-statement-imports-v1";
const BANK_RECONCILIATION_STORAGE_KEY = "finance-bank-reconciliation-v1";
const CONCESSIONS_STORAGE_KEY = "finance-concessions-v1";
const DOCUMENT_VERIFICATIONS_STORAGE_KEY = "finance-document-verifications-v1";

const INITIAL_FEE_WORKFLOW = createDemoFeeWorkflow(seedStudents, seedPayments);
const INITIAL_DEMO_STUDENTS = createDemoBillingStudents(INITIAL_FEE_WORKFLOW);
const INITIAL_BILLING_PAYMENTS = createDemoBillingPayments(seedPayments, INITIAL_FEE_WORKFLOW);
const INITIAL_CONCESSIONS = createSimulatedConcessions(INITIAL_FEE_WORKFLOW);

/** Read concession requests (and their applied plans) saved in this browser. */
function loadStoredConcessions(): ConcessionRequest[] {
  try {
    const stored = window.localStorage.getItem(CONCESSIONS_STORAGE_KEY);
    if (!stored) return INITIAL_CONCESSIONS;
    const parsed: unknown = JSON.parse(stored);
    if (!Array.isArray(parsed)) return INITIAL_CONCESSIONS;
    const valid = parsed.filter(
      (item): item is ConcessionRequest =>
        !!item &&
        typeof item === "object" &&
        typeof (item as ConcessionRequest).id === "string" &&
        typeof (item as ConcessionRequest).status === "string" &&
        Array.isArray((item as ConcessionRequest).history),
    );
    const restored =
      valid.length > 0
        ? valid.map((item) => {
            const request = normalizeConcessionRequest(item);
            if (Number.isFinite(request.submission.eligibleFees)) return request;
            const person = INITIAL_FEE_WORKFLOW.persons.find(
              (candidate) => candidate.id === request.personId,
            );
            return {
              ...request,
              submission: {
                ...request.submission,
                eligibleFees: person ? eligibleFeeTotal(person.plan) : 0,
              },
            };
          })
        : [];
    return [
      ...restored,
      ...INITIAL_CONCESSIONS.filter(
        (initial) => !restored.some((request) => request.id === initial.id),
      ),
    ];
  } catch {
    // Keep the bundled sample requests if browser storage is unavailable or malformed.
    return INITIAL_CONCESSIONS;
  }
}

const APPLICATION_REJECTIONS_STORAGE_KEY = "finance-application-rejections-v1";

function loadStoredApplicationRejections(): Record<string, ApplicationRejection> {
  try {
    const parsed: unknown = JSON.parse(
      window.localStorage.getItem(APPLICATION_REJECTIONS_STORAGE_KEY) ?? "{}",
    );
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return {};
    return Object.fromEntries(
      Object.entries(parsed).filter(
        (entry): entry is [string, ApplicationRejection] =>
          !!entry[1] &&
          typeof entry[1] === "object" &&
          typeof entry[1].reason === "string" &&
          typeof entry[1].date === "string",
      ),
    );
  } catch {
    return {};
  }
}

function loadStoredDocumentVerifications(): Record<string, DocumentVerification[]> {
  try {
    const stored = window.localStorage.getItem(DOCUMENT_VERIFICATIONS_STORAGE_KEY);
    if (!stored) return {};
    const parsed: unknown = JSON.parse(stored);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return {};
    return Object.fromEntries(
      Object.entries(parsed).filter(
        (entry): entry is [string, DocumentVerification[]] =>
          Array.isArray(entry[1]) &&
          entry[1].every(
            (verification) =>
              !!verification &&
              typeof verification === "object" &&
              typeof verification.documentType === "string" &&
              (verification.status === "Approved" || verification.status === "Rejected") &&
              typeof verification.date === "string" &&
              typeof verification.sourceFingerprint === "string" &&
              Array.isArray(verification.history),
          ),
      ),
    );
  } catch {
    return {};
  }
}

function billingStudentForPerson(person: Person, plan: Person["plan"], totalFee: number): Student {
  return {
    id: person.id,
    applicationId: person.applicationId,
    name: person.name,
    regNo: person.admissionNo ?? "",
    admissionStatus: person.admissionNo ? "Admitted" : "Applicant",
    course: person.course,
    phone: person.contact,
    email: person.email,
    registeredOn: person.appliedOn,
    totalFee,
    installments: plan.map((installment) => ({
      label: installment.label,
      due: installment.dueDate,
      amount: installment.amountDue,
      originalAmount: installment.originalAmount,
      concessionAmount: installment.concessionAmount,
    })),
    applicationDetails: person.applicationDetails,
  };
}

function normalizeContact(value: string) {
  const digits = value.replace(/\D/g, "");
  return digits.length === 12 && digits.startsWith("91") ? digits.slice(2) : digits;
}

function studentMatchesPerson(student: Student, person: Person) {
  return (
    student.id === person.id ||
    (!!student.applicationId && student.applicationId === person.applicationId) ||
    (!!student.regNo &&
      !!person.admissionNo &&
      canonicalAdmissionNo(student.regNo) === canonicalAdmissionNo(person.admissionNo)) ||
    normalizeContact(student.phone) === normalizeContact(person.contact)
  );
}

function updateBillingStudent(student: Student, plan: Person["plan"], totalFee: number): Student {
  return {
    ...student,
    totalFee,
    installments: student.installments.map((installment, index) => ({
      ...installment,
      amount: plan[index]?.amountDue ?? installment.amount,
      originalAmount:
        plan[index]?.originalAmount ?? installment.originalAmount ?? plan[index]?.amountDue,
      concessionAmount: plan[index]?.concessionAmount ?? installment.concessionAmount ?? 0,
    })),
  };
}

/**
 * Re-apply approved installment plans saved by Accounts so billing stays
 * consistent after a refresh.
 */
function withConcessionPlans(
  workflow: FeeWorkflowState,
  concessions: ConcessionRequest[],
  students: Student[],
): { workflow: FeeWorkflowState; students: Student[] } {
  const appliedByPerson = new Map(
    concessions
      .filter((item) => item.status === "Approved" && item.applied?.planAfter)
      .map((item) => [item.personId, item.applied!]),
  );
  if (appliedByPerson.size === 0) return { workflow, students };
  const persons = workflow.persons.map((person) => {
    const applied = appliedByPerson.get(person.id);
    return applied
      ? {
          ...person,
          plan: applied.planAfter,
          feePayableOverride: applied.netPayable,
        }
      : person;
  });
  const updatedStudents = students.map((student) => {
    const person = workflow.persons.find((item) => studentMatchesPerson(student, item));
    const applied = person ? appliedByPerson.get(person.id) : undefined;
    return applied ? updateBillingStudent(student, applied.planAfter, applied.netPayable) : student;
  });
  const missingStudents = persons.flatMap((person) => {
    const applied = appliedByPerson.get(person.id);
    return applied && !updatedStudents.some((student) => studentMatchesPerson(student, person))
      ? [billingStudentForPerson(person, applied.planAfter, applied.netPayable)]
      : [];
  });
  return {
    workflow: {
      ...workflow,
      persons,
    },
    students: [...updatedStudents, ...missingStudents],
  };
}

export interface FinanceSettings {
  institution: { name: string; address: string; phone: string; email: string; gstin: string };
  financialYear: { label: string; start: string; end: string };
  incomeCategories: string[];
  expenseCategories: string[];
  accountCategories: string[];
  pettyCategories: string[];
  paymentMethods: Record<string, boolean>;
  receipt: { prefix: string; next: number; footer: string };
  currency: { code: string; symbol: string; grouping: string };
}

const defaultSettings: FinanceSettings = {
  institution: {
    name: "Sample Institute of Higher Studies",
    address: "12 College Road, Bengaluru 560001",
    phone: "+91 80 4000 1234",
    email: "accounts@sample-institute.edu.in",
    gstin: "29ABCDE1234F1Z5",
  },
  financialYear: { label: "FY 2026-27", start: "2026-04-01", end: "2027-03-31" },
  incomeCategories: INCOME_CATEGORIES,
  expenseCategories: EXPENSE_CATEGORIES,
  accountCategories: ["Assets", "Liabilities", "Income", "Expenses", "Equity"],
  pettyCategories: PETTY_CATEGORIES,
  paymentMethods: {
    Cash: true,
    UPI: true,
    "Bank Transfer": true,
    Cheque: true,
  },
  receipt: {
    prefix: "RCP-2026-",
    next:
      Math.max(
        1000,
        ...seedTransactions.map((transaction) =>
          Number(transaction.receiptNo?.split("-").at(-1) ?? 0),
        ),
        ...INITIAL_BILLING_PAYMENTS.map((payment) =>
          Number(payment.receiptNo.split("-").at(-1) ?? 0),
        ),
      ) + 1,
    footer: "This is a computer-generated receipt.",
  },
  currency: { code: "INR", symbol: "₹", grouping: "Indian (12,34,567)" },
};

const uid = (p: string) =>
  `${p}${Date.now().toString(36)}${Math.random().toString(36).slice(2, 5)}`;

type BalanceGuardError = { reason: "cash" | "bank" | "petty"; available: number };
type TransactionSaveResult = true | false | BalanceGuardError;

function useFinanceState() {
  const buildInitialState = (persisted: boolean) => {
    const stored = (persisted ? loadStoredConcessions() : INITIAL_CONCESSIONS);
    const documentVerifications = (persisted ? loadStoredDocumentVerifications() : {});
    const corrections = (persisted ? loadStoredCorrections() : []);
    const rejections = (persisted ? loadStoredApplicationRejections() : {});
    const baseStudents: Student[] = [...seedStudents, ...INITIAL_DEMO_STUDENTS];
    const state = withConcessionPlans(INITIAL_FEE_WORKFLOW, stored, baseStudents);
    return {
      ...state,
      workflow: {
        ...state.workflow,
        persons: state.workflow.persons.map((person) =>
          applyResubmissions(
            {
              ...person,
              documentVerifications:
                documentVerifications[person.id] ?? person.documentVerifications,
              ...(rejections[person.id]
                ? { applicationRejection: rejections[person.id], accountantVerifiedAt: undefined }
                : {}),
            },
            corrections,
          ),
        ),
      },
      concessions: stored,
      corrections,
    };
  };
  const [initialConcessionState] = useState(() => buildInitialState(false));
  const [storageLoaded, setStorageLoaded] = useState(false);
  const [documentCorrections, setDocumentCorrections] = useState<DocumentCorrectionRequest[]>(
    initialConcessionState.corrections,
  );
  const [students, setStudents] = useState<Student[]>(initialConcessionState.students);
  const [payments, setPayments] = useState<FeePayment[]>(INITIAL_BILLING_PAYMENTS);
  const [feeWorkflow, setFeeWorkflow] = useState<FeeWorkflowState>(() =>
    autoForwardEligibleApplications(
      initialConcessionState.workflow,
      undefined,
      initialConcessionState.concessions,
    ),
  );
  const [concessions, setConcessions] = useState<ConcessionRequest[]>(
    initialConcessionState.concessions,
  );
  useEffect(() => {
    const restored = buildInitialState(true);
    setDocumentCorrections(restored.corrections);
    setStudents(restored.students);
    setFeeWorkflow(autoForwardEligibleApplications(restored.workflow, undefined, restored.concessions));
    setConcessions(restored.concessions);
    setStorageLoaded(true);
  }, []);
  const concessionsRef = useRef(concessions);
  concessionsRef.current = concessions;
  const autoForward = (workflow: FeeWorkflowState, at?: string): FeeWorkflowState =>
    autoForwardEligibleApplications(workflow, at, concessionsRef.current);
  useEffect(() => {
    try {
      if (!storageLoaded) return;
      window.localStorage.setItem(CONCESSIONS_STORAGE_KEY, JSON.stringify(concessions));
    } catch {
      // The current session remains usable if browser storage is unavailable.
    }
  }, [concessions, storageLoaded]);
  const updateConcession = (
    id: string,
    change: (request: ConcessionRequest) => ConcessionResult,
  ): ConcessionResult => {
    const request = concessionsRef.current.find((item) => item.id === id);
    if (!request) return { ok: false, error: "Concession request not found." };
    const result = change(request);
    if (result.ok) {
      concessionsRef.current = concessionsRef.current.map((item) =>
        item.id === id ? result.value : item,
      );
      setConcessions(concessionsRef.current);
      setFeeWorkflow((current) =>
        autoForwardEligibleApplications(current, undefined, concessionsRef.current),
      );
    }
    return result;
  };
  const workflowPaymentRequests = useRef(new Map<string, FeeWorkflowPayment>());
  const reservedReceiptNumbers = useRef(new Set<string>());
  const [reminders, setReminders] = useState<FeeReminder[]>([]);
  const [transactions, setTransactions] = useState<Transaction[]>(() =>
    ensureTransactionIds(seedTransactions),
  );
  const [bankStatementImports, setBankStatementImports] = useState<BankStatementImport[]>([]);
  const [bankStatementImportsLoaded, setBankStatementImportsLoaded] = useState(false);
  const [bankReconciliationDecisions, setBankReconciliationDecisions] = useState<
    Record<string, BankReconciliationDecision>
  >({});
  const [bankReconciliationLoaded, setBankReconciliationLoaded] = useState(false);

  useEffect(() => {
    try {
      const stored = window.localStorage.getItem(BANK_STATEMENT_IMPORTS_STORAGE_KEY);
      if (stored) {
        const parsed: unknown = JSON.parse(stored);
        if (Array.isArray(parsed)) setBankStatementImports(parsed as BankStatementImport[]);
      }
    } catch {
      setBankStatementImports([]);
    } finally {
      setBankStatementImportsLoaded(true);
    }
  }, []);
  useEffect(() => {
    try {
      const stored = window.localStorage.getItem(BANK_RECONCILIATION_STORAGE_KEY);
      if (stored) {
        const parsed: unknown = JSON.parse(stored);
        if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
          setBankReconciliationDecisions(parsed as Record<string, BankReconciliationDecision>);
        }
      }
    } catch {
      setBankReconciliationDecisions({});
    } finally {
      setBankReconciliationLoaded(true);
    }
  }, []);
  const [petty, setPetty] = useState<PettyEntry[]>(seedPetty);
  const [cashCount, dispatchCashCount] = useReducer(cashCountReducer, initialCashCount);
  const physicalCount = cashCount.saved.at(-1)?.total ?? null;
  const [settlements, setSettlements] = useState<Settlement[]>(seedSettlements);
  const [settings, setSettings] = useState<FinanceSettings>(defaultSettings);
  const [courseCatalog, setCourseCatalog] = useState<CourseCatalog>(seedCourseCatalog);
  const [courseCatalogLoaded, setCourseCatalogLoaded] = useState(false);

  useEffect(() => {
    try {
      const stored = window.localStorage.getItem(COURSE_CATALOG_STORAGE_KEY);
      if (stored) {
        const parsed: unknown = JSON.parse(stored);
        if (
          parsed &&
          typeof parsed === "object" &&
          Array.isArray((parsed as CourseCatalog).courses) &&
          Array.isArray((parsed as CourseCatalog).history)
        ) {
          const oldCatalog = parsed as CourseCatalog & { departments?: (string[]) | undefined };
          setCourseCatalog({
            courses: oldCatalog.courses.map((course) => {
              const fallback = seedCourseCatalog.courses.find(
                (seed) => seed.id === course.id || seed.name === course.name,
              );
              const oldDepartment = course.department as string | undefined;
              return {
                ...course,
                department: SEED_DEPARTMENTS.includes(oldDepartment ?? "")
                  ? oldDepartment!
                  : (fallback?.department ?? SEED_DEPARTMENTS[0]!),
              };
            }),
            history: oldCatalog.history,
            departments: SEED_DEPARTMENTS,
          });
        }
      }
    } catch {
      // Keep the bundled catalog if browser storage is unavailable or malformed.
    }
    setCourseCatalogLoaded(true);
  }, []);

  useEffect(() => {
    if (!courseCatalogLoaded) return;
    try {
      window.localStorage.setItem(COURSE_CATALOG_STORAGE_KEY, JSON.stringify(courseCatalog));
    } catch {
      // The current session remains usable if browser storage is unavailable.
    }
  }, [courseCatalog, courseCatalogLoaded]);

  const balances = useMemo(() => {
    const cashIn =
      sum(payments.filter((p) => isCash(p.method)).map((p) => p.amount)) +
      sum(transactions.filter((t) => t.type === "income" && isCash(t.method)).map((t) => t.amount));
    const cashOut = sum(
      transactions.filter((t) => t.type === "expense" && isCash(t.method)).map((t) => t.amount),
    );
    const bankIn =
      sum(payments.filter((p) => !isCash(p.method)).map((p) => p.amount)) +
      sum(
        transactions.filter((t) => t.type === "income" && !isCash(t.method)).map((t) => t.amount),
      );
    const bankOut = sum(
      transactions.filter((t) => t.type === "expense" && !isCash(t.method)).map((t) => t.amount),
    );
    const pettyBook =
      pettyDailyBalances(petty, OPENING.petty, TODAY).at(-1)?.closing ?? OPENING.petty;
    return {
      cash: OPENING.cash + cashIn - cashOut,
      bank: OPENING.bank + bankIn - bankOut,
      pettyBook,
    };
  }, [payments, transactions, petty]);

  return {
    students,
    payments,
    reminders,
    transactions,
    bankStatementImports,
    bankStatementImportsLoaded,
    bankReconciliationDecisions,
    bankReconciliationLoaded,
    saveBankReconciliationDecision: (decision: BankReconciliationDecision): boolean => {
      if (!bankReconciliationLoaded) return false;
      const next = { ...bankReconciliationDecisions, [decision.statementId]: decision };
      try {
        window.localStorage.setItem(BANK_RECONCILIATION_STORAGE_KEY, JSON.stringify(next));
      } catch {
        return false;
      }
      setBankReconciliationDecisions(next);
      return true;
    },
    addBankStatementImport: (statement: BankStatementImport): boolean => {
      if (
        !bankStatementImportsLoaded ||
        bankStatementImports.some((item) => item.id === statement.id)
      )
        return false;
      const next = [...bankStatementImports, statement];
      try {
        window.localStorage.setItem(BANK_STATEMENT_IMPORTS_STORAGE_KEY, JSON.stringify(next));
      } catch {
        return false;
      }
      setBankStatementImports(next);
      return true;
    },
    petty,
    physicalCount,
    settlements,
    feeWorkflow,
    concessions,
    saveConcessionReview: (id: string, review: AccountsReview) =>
      updateConcession(id, (request) => saveReview(request, review, new Date().toISOString())),
    forwardConcessionToDirector: (id: string) =>
      updateConcession(id, (request) => forwardToDirector(request, new Date().toISOString())),
    applyConcession: (id: string): ConcessionResult => {
      const request = concessionsRef.current.find((item) => item.id === id);
      if (!request) return { ok: false, error: "Concession request not found." };
      const person = feeWorkflow.persons.find((item) => item.id === request.personId);
      if (!person) return { ok: false, error: "Student fee record not found." };
      const result = applyApprovedConcession(
        request,
        person,
        feeWorkflow.payments,
        new Date().toISOString(),
      );
      if (!result.ok) return result;
      const { plan } = result.value;
      concessionsRef.current = concessionsRef.current.map((item) =>
        item.id === id ? result.value.request : item,
      );
      setConcessions(concessionsRef.current);
      setFeeWorkflow((current) =>
        autoForward({
          ...current,
          persons: current.persons.map((item) =>
            item.id === person.id
              ? {
                  ...item,
                  plan,
                  feePayableOverride: result.value.request.applied?.netPayable,
                }
              : item,
          ),
        }),
      );
      const netPayable =
        result.value.request.applied?.netPayable ??
        sum(plan.map((installment) => installment.amountDue));
      setStudents((current) => {
        const existingStudent = current.some((student) => studentMatchesPerson(student, person));
        const updated = current.map((student) =>
          studentMatchesPerson(student, person)
            ? updateBillingStudent(student, plan, netPayable)
            : student,
        );
        return existingStudent
          ? updated
          : [...updated, billingStudentForPerson(person, plan, netPayable)];
      });
      return { ok: true, value: result.value.request };
    },
    updateFeeWorkflowPerson: (person: Person) => {
      setFeeWorkflow((current) =>
        autoForward({
          ...current,
          persons: current.persons.map((item) => (item.id === person.id ? person : item)),
        }),
      );
      if (!isApplicationVerified(person)) return;
      setStudents((current) => {
        const existingIndex = current.findIndex((student) => studentMatchesPerson(student, person));
        const totalFee =
          person.feePayableOverride ?? sum(person.plan.map((installment) => installment.amountDue));
        const linkedStudent = billingStudentForPerson(person, person.plan, totalFee);
        if (existingIndex < 0) return [...current, linkedStudent];
        return current.map((student, index) =>
          index === existingIndex ? { ...student, ...linkedStudent, id: student.id } : student,
        );
      });
    },
    saveDocumentVerifications: (
      personId: string,
      documentVerifications: DocumentVerification[],
      rejectedDocument?: Pick<DocumentCorrectionItem, "documentType" | "issue" | "reason">,
    ): boolean => {
      let nextCorrections = documentCorrections;
      let previousCorrectionsValue: string | null = null;
      let correctionsPersisted = false;
      const person = feeWorkflow.persons.find((item) => item.id === personId);
      try {
        if (rejectedDocument && person) {
          previousCorrectionsValue = window.localStorage.getItem(DOCUMENT_CORRECTIONS_STORAGE_KEY);
          const storedCorrections = loadStoredCorrections();
          nextCorrections = addDocumentsToOpenCorrectionRequest(
            storedCorrections,
            person.applicationId,
            [rejectedDocument],
          );
          if (nextCorrections !== storedCorrections) {
            if (!saveStoredCorrections(nextCorrections)) return false;
            correctionsPersisted = true;
          } else {
            nextCorrections = documentCorrections;
          }
        }
        const stored = loadStoredDocumentVerifications();
        window.localStorage.setItem(
          DOCUMENT_VERIFICATIONS_STORAGE_KEY,
          JSON.stringify({ ...stored, [personId]: documentVerifications }),
        );
      } catch {
        if (correctionsPersisted) {
          try {
            if (previousCorrectionsValue === null)
              window.localStorage.removeItem(DOCUMENT_CORRECTIONS_STORAGE_KEY);
            else
              window.localStorage.setItem(
                DOCUMENT_CORRECTIONS_STORAGE_KEY,
                previousCorrectionsValue,
              );
          } catch {
            return false;
          }
        }
        return false;
      }
      if (correctionsPersisted) setDocumentCorrections(nextCorrections);
      setFeeWorkflow((current) =>
        autoForward({
          ...current,
          persons: current.persons.map((person) =>
            person.id === personId ? { ...person, documentVerifications } : person,
          ),
        }),
      );
      return true;
    },
    /** Saves an application-level rejection (kept in this browser) and updates the application. */
    saveApplicationRejection: (person: Person): boolean => {
      if (!person.applicationRejection) return false;
      try {
        window.localStorage.setItem(
          APPLICATION_REJECTIONS_STORAGE_KEY,
          JSON.stringify({
            ...loadStoredApplicationRejections(),
            [person.id]: person.applicationRejection,
          }),
        );
      } catch {
        return false;
      }
      setFeeWorkflow((current) =>
        autoForward({
          ...current,
          persons: current.persons.map((item) => (item.id === person.id ? person : item)),
        }),
      );
      return true;
    },
    documentCorrections,
    /** Prototype: records a correction request for Admission (Sales) in this browser. */
    sendDocumentCorrectionRequest: (
      person: Person,
      documents: Pick<
        DocumentCorrectionRequest["documents"][number],
        "documentType" | "issue" | "reason"
      >[],
    ): boolean => {
      const seenDocumentTypes = new Set<DocumentCorrectionItem["documentType"]>();
      const eligibleDocuments = documents.filter((requested) => {
        if (seenDocumentTypes.has(requested.documentType)) return false;
        seenDocumentTypes.add(requested.documentType);
        const document = person.applicationDetails?.documents.find(
          (item) => item.type === requested.documentType,
        );
        if (!document) return false;
        const isMissing = !document.provided || !document.fileUrl;
        const isRejected =
          !isMissing &&
          documentVerificationStatus(document, person.documentVerifications) === "Rejected";
        return (
          (requested.issue === "Missing" && isMissing) ||
          (requested.issue === "Rejected" && isRejected)
        );
      });
      if (!eligibleDocuments.length) return false;
      const openRequest = documentCorrections.find(
        (request) =>
          request.applicationId === person.applicationId &&
          request.status === "Awaiting Resubmission",
      );
      const next = openRequest
        ? addDocumentsToOpenCorrectionRequest(
            documentCorrections,
            person.applicationId,
            eligibleDocuments,
          )
        : [
            ...documentCorrections,
            createCorrectionRequest(
              person,
              eligibleDocuments,
              new Date().toISOString(),
              documentCorrections,
            ),
          ];
      if (next === documentCorrections) return false;
      if (!saveStoredCorrections(next)) return false;
      setDocumentCorrections(next);
      return true;
    },
    /** Prototype: simulates Admission (Sales) uploading every requested replacement together. */
    simulateDocumentResubmission: (requestId: string): Person | null => {
      const request = documentCorrections.find((item) => item.id === requestId);
      const person = feeWorkflow.persons.find((item) => item.id === request?.personId);
      if (!request || !person) return null;
      const requestedDocuments = request.documents.map((requested) => ({
        requested,
        document: person.applicationDetails?.documents.find(
          (item) => item.type === requested.documentType,
        ),
      }));
      if (requestedDocuments.some(({ document }) => !document)) return null;
      const sourceFiles = requestedDocuments.map(({ requested, document }) => {
        return {
          documentType: requested.documentType,
          fileUrl: document?.fileUrl ?? sampleDocumentFile(requested.documentType).fileUrl,
        };
      });
      if (sourceFiles.length !== request.documents.length) return null;
      const next = resubmitCorrection(documentCorrections, requestId, sourceFiles);
      if (next === documentCorrections || !saveStoredCorrections(next)) return null;
      setDocumentCorrections(next);
      const updated = { ...applyResubmissions(person, next), accountantVerifiedAt: undefined };
      setFeeWorkflow((current) => ({
        ...current,
        persons: current.persons.map((item) => (item.id === updated.id ? updated : item)),
      }));
      return updated;
    },
    addFeeWorkflowPayment: (payment: Omit<FeeWorkflowPayment, "id" | "adminNotified">) => {
      const requestKey = `${payment.personId}|${payment.receiptNo}`;
      const existing = feeWorkflow.payments.find(
        (item) => item.personId === payment.personId && item.receiptNo === payment.receiptNo,
      );
      if (existing) return existing;
      const pending = workflowPaymentRequests.current.get(requestKey);
      if (pending) return pending;
      if (
        payments.some((item) => item.receiptNo === payment.receiptNo) ||
        feeWorkflow.payments.some((item) => item.receiptNo === payment.receiptNo) ||
        transactions.some(
          (item) => item.receiptNo === payment.receiptNo || item.reference === payment.receiptNo,
        ) ||
        reservedReceiptNumbers.current.has(payment.receiptNo)
      ) {
        throw new Error(`Receipt number ${payment.receiptNo} is already in use.`);
      }
      const newPayment = createNewFeeWorkflowPayment(
        {
          ...payment,
          confirmation: { status: "Not Sent" as const },
        },
        uid("FWP-"),
      );
      const person = feeWorkflow.persons.find((item) => item.id === newPayment.personId);
      const created = person
        ? {
            ...newPayment,
            confirmationRequest: preparePaymentConfirmation(person, newPayment, [
              ...feeWorkflow.payments,
              newPayment,
            ]),
          }
        : newPayment;
      workflowPaymentRequests.current.set(requestKey, created);
      reservedReceiptNumbers.current.add(created.receiptNo);
      setFeeWorkflow((current) => {
        if (
          current.payments.some(
            (item) => item.id === created.id || item.receiptNo === created.receiptNo,
          )
        )
          return current;
        const payments = [...current.payments, created];
        return autoForward({
          ...current,
          payments,
          persons: current.persons.map((person) =>
            person.id !== created.personId
              ? person
              : {
                  ...person,
                  adminNotifiedOfClearance: areAllPaymentsAdministrationNotified(
                    payments.filter((item) => item.personId === person.id),
                  ),
                },
          ),
        });
      });
      return created;
    },
    recordFeeWorkflowPayment: (payment: Omit<FeeWorkflowPayment, "id" | "adminNotified">) => {
      const requestKey = `${payment.personId}|${payment.receiptNo}`;
      const existing = feeWorkflow.payments.find(
        (item) => item.personId === payment.personId && item.receiptNo === payment.receiptNo,
      );
      if (existing) return existing;
      const pending = workflowPaymentRequests.current.get(requestKey);
      if (pending) return pending;
      if (
        payments.some((item) => item.receiptNo === payment.receiptNo) ||
        feeWorkflow.payments.some((item) => item.receiptNo === payment.receiptNo) ||
        transactions.some(
          (item) => item.receiptNo === payment.receiptNo || item.reference === payment.receiptNo,
        ) ||
        reservedReceiptNumbers.current.has(payment.receiptNo)
      ) {
        throw new Error(`Receipt number ${payment.receiptNo} is already in use.`);
      }
      const newPayment = createNewFeeWorkflowPayment(
        {
          ...payment,
          confirmation: { status: "Not Sent" as const },
        },
        uid("FWP-"),
      );
      const person = feeWorkflow.persons.find((item) => item.id === newPayment.personId);
      const created = person
        ? {
            ...newPayment,
            confirmationRequest: preparePaymentConfirmation(person, newPayment, [
              ...feeWorkflow.payments,
              newPayment,
            ]),
          }
        : newPayment;
      workflowPaymentRequests.current.set(requestKey, created);
      reservedReceiptNumbers.current.add(created.receiptNo);
      const nextPayments = [...feeWorkflow.payments, created];
      setFeeWorkflow((current) =>
        current.payments.some(
          (item) => item.id === created.id || item.receiptNo === created.receiptNo,
        )
          ? current
          : autoForward({
              ...current,
              payments: [...current.payments, created],
              persons: current.persons.map((item) =>
                item.id !== payment.personId || !person
                  ? item
                  : {
                      ...item,
                      paymentStatus: feeWorkflowPaymentStatus(
                        item,
                        nextPayments.filter((entry) => entry.personId === item.id),
                      ),
                      adminNotifiedOfClearance: areAllPaymentsAdministrationNotified(
                        nextPayments.filter((entry) => entry.personId === item.id),
                      ),
                      applicationStatus:
                        item.admissionStatus === "Admitted" || item.admissionNo
                          ? item.applicationStatus
                          : "Payment Recorded",
                    },
              ),
            }),
      );
      const student = students.find((item) => item.id === payment.personId);
      if (!student && person) {
        setStudents((current) =>
          current.some((item) => item.id === person.id)
            ? current
            : [
                ...current,
                {
                  id: person.id,
                  applicationId: person.applicationId,
                  name: person.name,
                  regNo: person.admissionNo ?? "",
                  admissionStatus: person.admissionNo ? "Admitted" : "Applicant",
                  course: person.course,
                  phone: person.contact,
                  email: person.email,
                  registeredOn: person.appliedOn,
                  totalFee:
                    person.feePayableOverride ??
                    sum(person.plan.map((installment) => installment.amountDue)),
                  installments: person.plan.map((installment) => ({
                    label: installment.label,
                    due: installment.dueDate,
                    amount: installment.amountDue,
                    originalAmount: installment.originalAmount,
                    concessionAmount: installment.concessionAmount,
                  })),
                  applicationDetails: person.applicationDetails,
                },
              ],
        );
      }
      setPayments((current) =>
        current.some((item) => item.id === created.id)
          ? current
          : [
              ...current,
              {
                id: created.id,
                studentId: payment.personId,
                date: created.date,
                amount: created.amount,
                method: created.method,
                reference: created.reference,
                receiptNo: created.receiptNo,
                allocations: created.allocations,
              },
            ],
      );
      setSettings((current) => ({
        ...current,
        receipt: {
          ...current.receipt,
          next: Math.max(
            current.receipt.next,
            Number(created.receiptNo.slice(current.receipt.prefix.length)) + 1,
          ),
        },
      }));
      return created;
    },
    notifyFeeWorkflowPayments: (paymentIds: string[]) =>
      setFeeWorkflow((current) => {
        const payments = markPaymentsAdministrationNotified(current.payments, paymentIds);
        if (payments === current.payments) return current;
        return {
          ...current,
          payments,
          persons: current.persons.map((person) => {
            const adminNotifiedOfClearance = areAllPaymentsAdministrationNotified(
              payments.filter((payment) => payment.personId === person.id),
            );
            return person.adminNotifiedOfClearance === adminNotifiedOfClearance
              ? person
              : { ...person, adminNotifiedOfClearance };
          }),
        };
      }),
    saveFeeWorkflowHandoff: (handoff: Handoff) =>
      setFeeWorkflow((current) => {
        const existing = current.handoffs.find(
          (item) => item.personId === handoff.personId && item.target === handoff.target,
        );
        const history = [...(existing?.history ?? [])];
        const paymentNotificationRefs = new Set(
          history
            .filter(
              (entry) => entry.text === ADMINISTRATION_PAYMENT_NOTIFIED_TEXT && !!entry.referenceId,
            )
            .map((entry) => entry.referenceId!),
        );
        const keys = new Set(
          history.map((entry) => `${entry.referenceId ?? ""}|${entry.date}|${entry.text}`),
        );
        for (const entry of handoff.history) {
          const key = `${entry.referenceId ?? ""}|${entry.date}|${entry.text}`;
          if (
            entry.text === ADMINISTRATION_PAYMENT_NOTIFIED_TEXT &&
            entry.referenceId &&
            paymentNotificationRefs.has(entry.referenceId)
          )
            continue;
          if (!keys.has(key)) {
            history.push(entry);
            keys.add(key);
            if (entry.text === ADMINISTRATION_PAYMENT_NOTIFIED_TEXT && entry.referenceId)
              paymentNotificationRefs.add(entry.referenceId);
          }
        }
        const saved = { ...handoff, history };
        const notifiedPaymentIds = (handoff.target === "Administration" ? history : [])
          .filter(
            (entry) => entry.text === ADMINISTRATION_PAYMENT_NOTIFIED_TEXT && !!entry.referenceId,
          )
          .map((entry) => entry.referenceId!)
          .filter((id) =>
            current.payments.some(
              (payment) => payment.id === id && payment.personId === handoff.personId,
            ),
          );
        const payments = markPaymentsAdministrationNotified(current.payments, notifiedPaymentIds);
        return {
          ...current,
          payments,
          persons: current.persons.map((person) => {
            const adminNotifiedOfClearance = areAllPaymentsAdministrationNotified(
              payments.filter((payment) => payment.personId === person.id),
            );
            return person.adminNotifiedOfClearance === adminNotifiedOfClearance
              ? person
              : { ...person, adminNotifiedOfClearance };
          }),
          handoffs: [
            ...current.handoffs.filter(
              (item) => item.personId !== handoff.personId || item.target !== handoff.target,
            ),
            saved,
          ],
        };
      }),
    receiveFeeWorkflowAdmissionNo: (
      personId: string,
      admissionNo: string,
    ): true | "invalid" | "duplicate" | "missing" | "not-awaiting" => {
      const validation = validateAdmissionNo(admissionNo, personId, feeWorkflow.persons, students);
      if (validation !== "valid") return validation;
      const normalized = canonicalAdmissionNo(admissionNo);
      const person = feeWorkflow.persons.find((item) => item.id === personId);
      if (!person) return "missing";
      const administrationHandoff = feeWorkflow.handoffs.find(
        (item) =>
          item.personId === personId &&
          item.target === "Administration" &&
          (item.status === "Ready" || item.status === "Simulated (not delivered)"),
      );
      if (!administrationHandoff) return "not-awaiting";

      const date = new Date().toISOString();
      const admittedPerson: Person = {
        ...person,
        admissionNo: normalized,
        applicationStatus: "Admitted",
        admissionStatus: "Admitted",
        paymentStatus: feeWorkflowPaymentStatus(
          person,
          feeWorkflow.payments.filter((payment) => payment.personId === personId),
        ),
      };
      const student = studentFromAdmittedPerson(admittedPerson, normalized);

      setFeeWorkflow((current) => ({
        ...current,
        persons: current.persons.map((item) => (item.id === personId ? admittedPerson : item)),
        handoffs: current.handoffs.map((item) => {
          if (item.personId !== personId) return item;
          if (item.target === "Administration") {
            return {
              ...item,
              status: "Completed",
              history: [...item.history, { date, text: ADMISSION_NO_RECEIVED_TEXT }],
            };
          }
          if (item.target === "Sales") {
            return {
              ...item,
              status: "Completed",
              history: [...item.history, { date, text: "Application completed (simulated)" }],
            };
          }
          return item;
        }),
      }));
      setStudents((current) =>
        current.some((item) => item.id === student.id)
          ? current.map((item) => (item.id === student.id ? student : item))
          : [...current, student],
      );
      setPayments((current) => mergeBillingPayments(current, feeWorkflow.payments, personId));
      return true;
    },
    logInstallmentReminder: (
      personId: string,
      installmentId: string,
      reminder: InstallmentReminder,
    ) =>
      setFeeWorkflow((current) => ({
        ...current,
        persons: current.persons.map((person) =>
          person.id !== personId
            ? person
            : {
                ...person,
                plan: person.plan.map((installment) =>
                  installment.id !== installmentId
                    ? installment
                    : reminder.id &&
                        installment.reminders.some((existing) => existing.id === reminder.id)
                      ? installment
                      : {
                          ...installment,
                          reminders: [...installment.reminders, reminder],
                        },
                ),
              },
        ),
      })),
    settings,
    courseCatalog,
    setCourseCatalog,
    balances,
    logReminder: (reminder: Omit<FeeReminder, "id">) => {
      setReminders((current) =>
        current.some(
          (item) =>
            item.studentId === reminder.studentId &&
            item.sentAt.slice(0, 10) === reminder.sentAt.slice(0, 10),
        )
          ? current
          : [...current, { ...reminder, id: uid("REM-") }],
      );
    },
    addStudent: (s: Omit<Student, "id">) => {
      const matchedPerson =
        feeWorkflow.persons.find(
          (person) => !!s.applicationId && person.applicationId === s.applicationId.trim(),
        ) ??
        feeWorkflow.persons.find(
          (person) => normalizeContact(person.contact) === normalizeContact(s.phone),
        );
      if (matchedPerson) {
        const existingStudent =
          students.find((student) => student.id === matchedPerson.id) ??
          students.find(
            (student) => !!s.applicationId && student.applicationId === s.applicationId.trim(),
          ) ??
          students.find((student) => normalizeContact(student.phone) === normalizeContact(s.phone));
        const linkedStudent: Student = existingStudent ?? {
          id: matchedPerson.id,
          applicationId: matchedPerson.applicationId,
          name: matchedPerson.name,
          regNo: matchedPerson.admissionNo ?? "",
          admissionStatus: matchedPerson.admissionNo ? "Admitted" : "Applicant",
          course: matchedPerson.course,
          phone: matchedPerson.contact,
          email: matchedPerson.email,
          registeredOn: matchedPerson.appliedOn,
          totalFee:
            matchedPerson.feePayableOverride ??
            sum(matchedPerson.plan.map((installment) => installment.amountDue)),
          installments: matchedPerson.plan.map((installment) => ({
            label: installment.label,
            due: installment.dueDate,
            amount: installment.amountDue,
            originalAmount: installment.originalAmount,
            concessionAmount: installment.concessionAmount,
          })),
          applicationDetails: matchedPerson.applicationDetails,
        };
        if (!existingStudent)
          setStudents((current) =>
            current.some((student) => student.id === linkedStudent.id)
              ? current
              : [...current, linkedStudent],
          );
        setFeeWorkflow((current) => ({
          ...current,
          persons: current.persons.map((person) =>
            person.id === matchedPerson.id ? { ...person, billCreated: true } : person,
          ),
        }));
        return linkedStudent;
      }
      const st = { ...s, id: uid("S") };
      setStudents((x) => [...x, st]);
      const person = { ...personFromStudent(st, feeWorkflow.persons.length), billCreated: true };
      setFeeWorkflow((current) =>
        current.persons.some((item) => item.id === person.id)
          ? current
          : { ...current, persons: [...current.persons, person] },
      );
      return st;
    },
    addPayment: (p: Omit<FeePayment, "id" | "receiptNo">) => {
      const usedReceiptNumbers = [
        ...payments.map((payment) => payment.receiptNo),
        ...feeWorkflow.payments.map((payment) => payment.receiptNo),
        ...transactions.flatMap((transaction) =>
          [transaction.receiptNo, transaction.reference].filter(
            (receiptNo): receiptNo is string => !!receiptNo,
          ),
        ),
      ];
      const receiptNo = nextAvailableReceiptNumber(settings.receipt.prefix, settings.receipt.next, [
        ...usedReceiptNumbers,
        ...reservedReceiptNumbers.current,
      ]);
      reservedReceiptNumbers.current.add(receiptNo);
      const pay: FeePayment = {
        ...p,
        id: uid("P"),
        receiptNo,
      };
      setPayments((x) => (x.some((payment) => payment.id === pay.id) ? x : [...x, pay]));
      const person = feeWorkflow.persons.find((item) => item.id === p.studentId);
      if (person) {
        const workflowPayment = createNewFeeWorkflowPayment(
          {
            personId: person.id,
            amount: pay.amount,
            date: pay.date,
            method: pay.method,
            reference: pay.reference,
            receiptNo: pay.receiptNo,
            allocations: allocatePayment(
              person.plan,
              feeWorkflow.payments.filter((item) => item.personId === person.id),
              pay.amount,
            ),
            confirmation: { status: "Not Sent" },
          },
          pay.id,
        );
        const nextPayments = [...feeWorkflow.payments, workflowPayment];
        setFeeWorkflow((current) => {
          if (current.payments.some((item) => item.id === workflowPayment.id)) return current;
          const currentPerson = current.persons.find((item) => item.id === person.id);
          if (!currentPerson) return current;
          const currentPayments = [...current.payments, workflowPayment];
          return autoForward({
            ...current,
            payments: currentPayments,
            persons: current.persons.map((item) =>
              item.id !== person.id
                ? item
                : {
                    ...item,
                    paymentStatus: feeWorkflowPaymentStatus(
                      item,
                      currentPayments.filter((entry) => entry.personId === item.id),
                    ),
                    adminNotifiedOfClearance: areAllPaymentsAdministrationNotified(
                      currentPayments.filter((entry) => entry.personId === item.id),
                    ),
                    applicationStatus:
                      item.admissionStatus === "Admitted" || item.admissionNo
                        ? item.applicationStatus
                        : "Payment Recorded",
                  },
            ),
          });
        });
      }
      setSettings((s) => ({
        ...s,
        receipt: {
          ...s.receipt,
          next: Math.max(s.receipt.next, Number(receiptNo.slice(s.receipt.prefix.length)) + 1),
        },
      }));
      return pay;
    },
    saveTransaction: (
      t: Omit<Transaction, "id"> & { id?: string | undefined },
    ): TransactionSaveResult => {
      const receiptNumbers = [t.receiptNo, t.reference].filter((r): r is string => !!r);
      if (
        receiptNumbers.some(
          (receiptNo) =>
            payments.some((p) => p.receiptNo === receiptNo) ||
            feeWorkflow.payments.some((payment) => payment.receiptNo === receiptNo) ||
            (!t.id && reservedReceiptNumbers.current.has(receiptNo)) ||
            transactions.some(
              (o) => o.id !== t.id && (o.receiptNo === receiptNo || o.reference === receiptNo),
            ),
        )
      ) {
        return false;
      }
      if (t.type === "expense") {
        const isCashMethod = isCash(t.method);
        const opening = isCashMethod ? OPENING.cash : OPENING.bank;
        const movements = [
          ...payments
            .filter((payment) => isCash(payment.method) === isCashMethod)
            .map((payment) => ({ date: payment.date, amount: payment.amount, id: payment.id })),
          ...transactions
            .filter(
              (transaction) =>
                transaction.id !== t.id && isCash(transaction.method) === isCashMethod,
            )
            .map((transaction) => ({
              date: transaction.date,
              amount: transaction.type === "income" ? transaction.amount : -transaction.amount,
              id: transaction.id,
            })),
          { date: t.date, amount: t.amount, id: "\uffff-new" },
        ].sort((a, b) => a.date.localeCompare(b.date) || a.id.localeCompare(b.id));
        let balance = opening;
        let available = opening;
        let insufficient = false;
        movements.forEach((movement) => {
          if (movement.id === "\uffff-new") {
            available = balance;
            balance -= movement.amount;
            if (balance < 0) insufficient = true;
          } else {
            balance += movement.amount;
            if (balance < 0) insufficient = true;
          }
        });
        if (insufficient) return { reason: isCashMethod ? "cash" : "bank", available };
      }
      if (t.id)
        setTransactions((x) => x.map((o) => (o.id === t.id ? ({ ...o, ...t } as Transaction) : o)));
      else {
        receiptNumbers.forEach((receiptNo) => reservedReceiptNumbers.current.add(receiptNo));
        const usedIds = new Set(transactions.map((transaction) => transaction.id));
        let id = uid("T");
        while (usedIds.has(id)) id = uid("T");
        setTransactions((x) => [...x, { ...t, id }]);
        if (t.type === "income" && t.receiptNo) {
          setSettings((s) => ({
            ...s,
            receipt: {
              ...s.receipt,
              next: Math.max(
                s.receipt.next,
                Number((t.receiptNo ?? "").slice(s.receipt.prefix.length)) + 1,
              ),
            },
          }));
        }
      }
      return true;
    },
    approveTransaction: (id: string) =>
      setTransactions((x) => x.map((o) => (o.id === id ? { ...o, status: "Approved" } : o))),
    addPetty: (e: Omit<PettyEntry, "id">): true | BalanceGuardError => {
      if (e.kind === "paid") {
        const candidate = [...petty, { ...e, id: "\uffff-new" }];
        const throughDate = e.date > TODAY ? e.date : TODAY;
        const daily = pettyDailyBalances(candidate, OPENING.petty, throughDate);
        const beforeDate =
          pettyDailyBalances(petty, OPENING.petty, e.date).at(-1)?.closing ?? OPENING.petty;
        if (daily.some((day) => day.closing < 0)) return { reason: "petty", available: beforeDate };
      }
      setPetty((x) => [...x, { ...e, id: uid("PC") }]);
      return true;
    },
    cashCount,
    dispatchCashCount,
    saveSettlement: (s: Omit<Settlement, "id"> & { id?: string | undefined }) => {
      if (s.id)
        setSettlements((x) => x.map((o) => (o.id === s.id ? ({ ...o, ...s } as Settlement) : o)));
      else setSettlements((x) => [...x, { ...s, id: uid("SET-") }]);
    },
    setSettings,
  };
}

type FinanceCtx = ReturnType<typeof useFinanceState>;
// Keep one context instance across hot reloads so a re-evaluated module
// doesn't orphan consumers from the already-mounted provider.
const globalCtx = globalThis as { __financeCtx?: (Context<FinanceCtx | null>) | undefined };
const Ctx = (globalCtx.__financeCtx ??= createContext<FinanceCtx | null>(null));

export function FinanceProvider({ children }: { children: ReactNode }) {
  const value = useFinanceState();
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useFinance() {
  const v = useContext(Ctx);
  if (!v) throw new Error("useFinance must be used inside FinanceProvider");
  return v;
}

/** Unified receipts/payments view: fee payments + general transactions, each record appearing once. */
export function useLedgerEntries() {
  const { payments, transactions, students } = useFinance();
  return useMemo(() => {
    const byId = new Map(students.map((s) => [s.id, s]));
    const fee = payments.map((p) => ({
      id: p.id,
      date: p.date,
      type: "income" as const,
      description: `Fee payment – ${byId.get(p.studentId)?.name ?? p.studentId}`,
      category: "Student Fees",
      amount: p.amount,
      method: p.method,
      reference: p.reference,
      receiptNo: p.receiptNo,
      status: "Posted" as const,
      source: "fee" as const,
    }));
    const gen = transactions.map((t) => ({ ...t, source: "txn" as const }));
    return [...fee, ...gen].sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0));
  }, [payments, transactions, students]);
}
export type LedgerEntry = ReturnType<typeof useLedgerEntries>[number];
