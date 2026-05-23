export type BugState = 'Active' | 'Resolved' | 'Closed';
export type BugType = 'CPWF' | 'BugChain';
export type RejectReason = 'As Designed' | 'Cannot Reproduce' | 'Obsolete';

export interface BugLink {
  rel: 'Affected By';
  id: number;
  title: string;
  url: string;
}

export interface Bug {
  id: number;
  title: string;
  state: BugState;
  type: BugType;
  /** PDK or ChildProject name */
  pdkOrChildProject: string | null;
  assignee: string;
  assignedToPdk: boolean;
  description: string;
  links: BugLink[];
  /** State of the child work item (if any) */
  childState: BugState | null;
  /** Reason field (set on reject) */
  reason: RejectReason | null;
  resendTo: string | null;
  comment: string;
}

export const MOCK_PDK_LIST: string[] = [
  'PDK-Alpha',
  'PDK-Beta',
  'PDK-Gamma',
  'PDK-Delta',
  'PDK-Epsilon',
];

const initialBugs: Bug[] = [
  {
    id: 10001,
    title: 'Kernel panic on boot after update',
    state: 'Active',
    type: 'CPWF',
    pdkOrChildProject: null,
    assignee: 'user1@kaspersky.com',
    assignedToPdk: false,
    description: 'System crashes with kernel panic immediately after applying update KB-20240301.',
    links: [],
    childState: null,
    reason: null,
    resendTo: null,
    comment: '',
  },
  {
    id: 10002,
    title: 'False positive in web-filter module',
    state: 'Active',
    type: 'BugChain',
    pdkOrChildProject: 'PDK-Alpha',
    assignee: 'user2@kaspersky.com',
    assignedToPdk: true,
    description: 'Web-filter incorrectly blocks *.internal.corp domains.',
    links: [{ rel: 'Affected By', id: 20101, title: 'WF-20101: Filter regression', url: '#' }],
    childState: 'Active',
    reason: null,
    resendTo: null,
    comment: '',
  },
  {
    id: 10003,
    title: 'Memory leak in scan engine v14',
    state: 'Resolved',
    type: 'CPWF',
    pdkOrChildProject: 'PDK-Beta',
    assignee: 'user3@kaspersky.com',
    assignedToPdk: true,
    description: 'Scan engine leaks ~4 MB per scan cycle, causes OOM after 8 hours.',
    links: [{ rel: 'Affected By', id: 20202, title: 'SE-20202: Engine task', url: '#' }],
    childState: 'Resolved',
    reason: null,
    resendTo: null,
    comment: '',
  },
  {
    id: 10004,
    title: 'UI freeze when opening large report',
    state: 'Closed',
    type: 'BugChain',
    pdkOrChildProject: 'PDK-Gamma',
    assignee: 'user4@kaspersky.com',
    assignedToPdk: true,
    description: 'Management console freezes for 20+ seconds when opening reports > 50 MB.',
    links: [{ rel: 'Affected By', id: 20303, title: 'UI-20303: Report rendering', url: '#' }],
    childState: 'Closed',
    reason: null,
    resendTo: null,
    comment: '',
  },
  {
    id: 10005,
    title: 'Policy import silently drops custom rules',
    state: 'Active',
    type: 'CPWF',
    pdkOrChildProject: null,
    assignee: 'user5@kaspersky.com',
    assignedToPdk: false,
    description: 'When importing a policy XML, custom firewall rules are silently ignored.',
    links: [],
    childState: null,
    reason: null,
    resendTo: null,
    comment: '',
  },
];

// Export a mutable copy so the page can simulate state changes
export const mockBugs: Bug[] = initialBugs.map((b) => ({ ...b }));

/** Async wrapper for use with useAsync. */
export async function fetchBugs(): Promise<Bug[]> {
  return Promise.resolve(mockBugs.map((b) => ({ ...b })));
}
