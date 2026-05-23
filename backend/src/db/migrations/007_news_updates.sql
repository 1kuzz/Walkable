CREATE TABLE IF NOT EXISTS news_updates (
  id          TEXT        PRIMARY KEY,
  title       TEXT        NOT NULL,
  description TEXT        NOT NULL,
  date        TEXT        NOT NULL,
  created_by  TEXT        NOT NULL DEFAULT '',
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

INSERT INTO news_updates (id, title, description, date, created_by) VALUES
  ('nu_1', 'ISY agent update policy changed',
   'The ISY security agent policy has been updated to enforce real-time threat detection on all MOPS VMs. All teams must redeploy agents by 2026-04-01.',
   '2026-03-25', 'system'),
  ('nu_2', 'OpenStack Bobcat upgrade complete',
   'The OpenStack environment has been successfully upgraded to the Bobcat release. Nova, Cinder, and Neutron are all running on new versions. Review the release notes for API changes.',
   '2026-03-22', 'system'),
  ('nu_3', 'New QARA compliance checklist v2.1',
   'QARA has published compliance checklist version 2.1 with updated requirements for audit logging and secret rotation. All new services must pass v2.1 before production deployment.',
   '2026-03-19', 'system'),
  ('nu_4', 'TFS BugChain rule update',
   'BugChain escalation rules have been updated: P1 bugs now auto-escalate to the MOPS lead after 4 hours without acknowledgement. Cross-team transfers must include a severity justification.',
   '2026-03-14', 'system'),
  ('nu_5', 'Password policy enforcement tightened',
   'All service account passwords must now be rotated every 90 days via Vault. Personal accounts expire every 180 days. The lock-out threshold has been reduced from 10 to 5 failed attempts.',
   '2026-03-10', 'system'),
  ('nu_6', 'CI/CD pipeline template v3 released',
   'Pipeline template v3 adds a mandatory security scan stage using ISY Compliance Checker. All new pipelines should migrate to v3. Existing pipelines must be updated by end of Q2.',
   '2026-03-05', 'system')
ON CONFLICT (id) DO NOTHING;
