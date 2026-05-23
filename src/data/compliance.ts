// Jira Compliance Task Lifecycle

export type LifecycleState = 'New' | 'In Progress' | 'Internal UAT' | 'UAT' | 'Done' | 'Closed';

export interface ComplianceTask {
  id: string;
  title: string;
  assignee: string;
  state: LifecycleState;
  uatReadyDate: string | null;
  targetDate: string | null;
  endDate: string | null;
}

export const LIFECYCLE_STATES: LifecycleState[] = [
  'New',
  'In Progress',
  'Internal UAT',
  'UAT',
  'Done',
  'Closed',
];

export const mockComplianceTasks: ComplianceTask[] = [
  {
    id: 'COMP-101',
    title: 'Asset Inventory Documentation',
    assignee: 'Ivan P.',
    state: 'Done',
    uatReadyDate: '2025-11-15',
    targetDate: '2025-11-01',
    endDate: '2025-11-20',
  },
  {
    id: 'COMP-102',
    title: 'Antivirus Compliance Report',
    assignee: 'Ivan P.',
    state: 'Done',
    uatReadyDate: '2025-11-15',
    targetDate: '2025-11-01',
    endDate: '2025-11-20',
  },
  {
    id: 'COMP-103',
    title: 'Patch Management Documentation',
    assignee: 'Olga S.',
    state: 'Internal UAT',
    uatReadyDate: '2026-02-10',
    targetDate: '2026-01-25',
    endDate: null,
  },
  {
    id: 'COMP-104',
    title: 'Network Interaction Rules',
    assignee: 'Olga S.',
    state: 'UAT',
    uatReadyDate: '2026-02-05',
    targetDate: '2026-01-20',
    endDate: '2026-03-01',
  },
  {
    id: 'COMP-105',
    title: 'Access Rights Regulations (AUTH)',
    assignee: 'Dmitry K.',
    state: 'In Progress',
    uatReadyDate: null,
    targetDate: '2026-04-01',
    endDate: null,
  },
  {
    id: 'COMP-106',
    title: 'Secrets Protection Plan',
    assignee: 'Dmitry K.',
    state: 'In Progress',
    uatReadyDate: null,
    targetDate: '2026-04-15',
    endDate: null,
  },
  {
    id: 'COMP-107',
    title: 'Log Inventory',
    assignee: 'Anna M.',
    state: 'New',
    uatReadyDate: null,
    targetDate: '2026-05-01',
    endDate: null,
  },
];

// QARA Artifacts Checklist

export type ArtifactStatus = 'done' | 'in-progress' | 'not-started';

export interface QaraArtifact {
  domain: string;
  artifact: string;
  status: ArtifactStatus;
  responsible: string;
}

export const mockQaraArtifacts: QaraArtifact[] = [
  {
    domain: 'Assets',
    artifact: 'Asset Inventory Documentation',
    status: 'done',
    responsible: 'Ivan P.',
  },
  {
    domain: 'AV',
    artifact: 'Antivirus Compliance Report',
    status: 'done',
    responsible: 'Ivan P.',
  },
  {
    domain: 'Patch',
    artifact: 'Patch Management Documentation',
    status: 'in-progress',
    responsible: 'Olga S.',
  },
  {
    domain: 'Network',
    artifact: 'Network Interaction Rules',
    status: 'in-progress',
    responsible: 'Olga S.',
  },
  {
    domain: 'AUTH',
    artifact: 'Access Rights Regulations',
    status: 'in-progress',
    responsible: 'Dmitry K.',
  },
  {
    domain: 'Secrets',
    artifact: 'Secrets Protection Plan',
    status: 'in-progress',
    responsible: 'Dmitry K.',
  },
  {
    domain: 'Logs',
    artifact: 'Log Inventory',
    status: 'not-started',
    responsible: 'Anna M.',
  },
];

// IS Document Awareness

export type ReviewStatus = 'reviewed' | 'pending' | 'not-reviewed';

export interface IsDocument {
  title: string;
  englishTitle: string;
  category: string;
  reviewStatus: ReviewStatus;
}

export const mockIsDocuments: IsDocument[] = [
  {
    title: '[IS] Положение о парольной политике',
    englishTitle: 'Password Policy Regulation',
    category: 'Policy',
    reviewStatus: 'reviewed',
  },
  {
    title: '[IS] Положение о сетевой безопасности',
    englishTitle: 'Policy on Network Security',
    category: 'Policy',
    reviewStatus: 'reviewed',
  },
  {
    title: '[IS] Процедура управления доступом к информационным активам',
    englishTitle: 'Information Asset Access Control Procedure',
    category: 'Procedure',
    reviewStatus: 'reviewed',
  },
  {
    title: '[IS] Положение о мониторинге ИБ',
    englishTitle: 'IS Monitoring Regulation',
    category: 'Policy',
    reviewStatus: 'pending',
  },
  {
    title: '[IS] Положение по управлению уязвимостями',
    englishTitle: 'Regulation on Vulnerability Management',
    category: 'Policy',
    reviewStatus: 'pending',
  },
  {
    title: '[IS] Политика ИБ',
    englishTitle: 'Information Security Policy',
    category: 'Policy',
    reviewStatus: 'reviewed',
  },
  {
    title: '[IS] Процедура управления соответствием требованиям по ИБ',
    englishTitle: 'IS Compliance Management Procedure',
    category: 'Procedure',
    reviewStatus: 'not-reviewed',
  },
  {
    title: '[IS] Положение по управлению инцидентами ИБ',
    englishTitle: 'IS Incident Management Regulation',
    category: 'Policy',
    reviewStatus: 'not-reviewed',
  },
  {
    title: '[IS] Регламент по обеспечению безопасности веб-сайтов',
    englishTitle: 'Web Security Standard',
    category: 'Standard',
    reviewStatus: 'reviewed',
  },
  {
    title: '[IS] Требования к контейнерам',
    englishTitle: 'Container Security Requirements',
    category: 'Standard',
    reviewStatus: 'not-reviewed',
  },
];

export interface ComplianceData {
  tasks: ComplianceTask[];
  qaraArtifacts: QaraArtifact[];
  isDocuments: IsDocument[];
}

/** Async wrapper for use with useAsync. */
export async function fetchComplianceData(): Promise<ComplianceData> {
  return Promise.resolve({
    tasks: [...mockComplianceTasks],
    qaraArtifacts: [...mockQaraArtifacts],
    isDocuments: [...mockIsDocuments],
  });
}
