/** A portal news or policy update displayed on the Updates page. */
export interface Update {
  id: number;
  title: string;
  date: string;
  description: string;
}

export const MOCK_UPDATES: Update[] = [
  {
    id: 1,
    title: 'ISY agent update policy changed',
    date: '2026-03-25',
    description:
      'The ISY security agent policy has been updated to enforce real-time threat detection on all MOPS VMs. All teams must redeploy agents by 2026-04-01.',
  },
  {
    id: 2,
    title: 'OpenStack Bobcat upgrade complete',
    date: '2026-03-22',
    description:
      'The OpenStack environment has been successfully upgraded to the Bobcat release. Nova, Cinder, and Neutron are all running on new versions. Review the release notes for API changes.',
  },
  {
    id: 3,
    title: 'New QARA compliance checklist v2.1',
    date: '2026-03-19',
    description:
      'QARA has published compliance checklist version 2.1 with updated requirements for audit logging and secret rotation. All new services must pass v2.1 before production deployment.',
  },
  {
    id: 4,
    title: 'TFS BugChain rule update',
    date: '2026-03-14',
    description:
      'BugChain escalation rules have been updated: P1 bugs now auto-escalate to the MOPS lead after 4 hours without acknowledgement. Cross-team transfers must include a severity justification.',
  },
  {
    id: 5,
    title: 'Password policy enforcement tightened',
    date: '2026-03-10',
    description:
      'All service account passwords must now be rotated every 90 days via Vault. Personal accounts expire every 180 days. The lock-out threshold has been reduced from 10 to 5 failed attempts.',
  },
  {
    id: 6,
    title: 'CI/CD pipeline template v3 released',
    date: '2026-03-05',
    description:
      'Pipeline template v3 adds a mandatory security scan stage using ISY Compliance Checker. All new pipelines should migrate to v3. Existing pipelines must be updated by end of Q2.',
  },
];
