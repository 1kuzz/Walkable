/** Mock data for the ISY (Information Security Yardstick) security dashboard. */

export type SecurityStatus = 'ok' | 'warning' | 'fail';

export interface IssyHost {
  id: string;
  host: string;
  avStatus: SecurityStatus;
  patchStatus: SecurityStatus;
  logStatus: SecurityStatus;
  authStatus: SecurityStatus;
}

export const MOCK_ISSY_HOSTS: IssyHost[] = [
  {
    id: 'host-1',
    host: 'srv-mops-01.corp',
    avStatus: 'ok',
    patchStatus: 'ok',
    logStatus: 'ok',
    authStatus: 'ok',
  },
  {
    id: 'host-2',
    host: 'srv-mops-02.corp',
    avStatus: 'ok',
    patchStatus: 'warning',
    logStatus: 'ok',
    authStatus: 'ok',
  },
  {
    id: 'host-3',
    host: 'srv-db-01.corp',
    avStatus: 'ok',
    patchStatus: 'ok',
    logStatus: 'warning',
    authStatus: 'ok',
  },
  {
    id: 'host-4',
    host: 'srv-db-02.corp',
    avStatus: 'warning',
    patchStatus: 'fail',
    logStatus: 'ok',
    authStatus: 'warning',
  },
  {
    id: 'host-5',
    host: 'srv-ci-01.corp',
    avStatus: 'ok',
    patchStatus: 'ok',
    logStatus: 'ok',
    authStatus: 'ok',
  },
  {
    id: 'host-6',
    host: 'srv-ci-02.corp',
    avStatus: 'fail',
    patchStatus: 'warning',
    logStatus: 'fail',
    authStatus: 'ok',
  },
  {
    id: 'host-7',
    host: 'srv-proxy-01.corp',
    avStatus: 'ok',
    patchStatus: 'ok',
    logStatus: 'ok',
    authStatus: 'warning',
  },
  {
    id: 'host-8',
    host: 'srv-backup-01.corp',
    avStatus: 'ok',
    patchStatus: 'ok',
    logStatus: 'ok',
    authStatus: 'ok',
  },
];

/** Derive the overall status of a host (worst of its four checks). */
export function hostOverallStatus(host: IssyHost): SecurityStatus {
  const statuses = [host.avStatus, host.patchStatus, host.logStatus, host.authStatus];
  if (statuses.includes('fail')) return 'fail';
  if (statuses.includes('warning')) return 'warning';
  return 'ok';
}

/** Async wrapper for use with useAsync. */
export async function fetchIssyHosts(): Promise<IssyHost[]> {
  return Promise.resolve([...MOCK_ISSY_HOSTS]);
}
