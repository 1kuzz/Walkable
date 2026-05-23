-- Migration 003: infrastructure VMs/images/SGs, app catalog, user preferences (kb recent articles)

-- Infrastructure: Virtual Machines
CREATE TABLE IF NOT EXISTS infra_vms (
  id           TEXT        PRIMARY KEY,
  name         TEXT        NOT NULL,
  status       TEXT        NOT NULL DEFAULT 'ACTIVE',
  flavor       TEXT        NOT NULL DEFAULT '',
  image        TEXT        NOT NULL DEFAULT '',
  network      TEXT        NOT NULL DEFAULT '',
  ip_address   TEXT        NOT NULL DEFAULT '',
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  metadata     JSONB       NOT NULL DEFAULT '{}'
);

-- Infrastructure: Images
CREATE TABLE IF NOT EXISTS infra_images (
  id           TEXT        PRIMARY KEY,
  name         TEXT        NOT NULL,
  status       TEXT        NOT NULL DEFAULT 'active',
  size_bytes   BIGINT      NOT NULL DEFAULT 0,
  min_disk_gb  INTEGER     NOT NULL DEFAULT 0,
  min_ram_mb   INTEGER     NOT NULL DEFAULT 0,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Infrastructure: Security Groups
CREATE TABLE IF NOT EXISTS infra_security_groups (
  id           TEXT        PRIMARY KEY,
  name         TEXT        NOT NULL,
  description  TEXT        NOT NULL DEFAULT '',
  rules        JSONB       NOT NULL DEFAULT '[]'
);

-- App catalog (replaces MOCK_APPS in the frontend bundle)
CREATE TABLE IF NOT EXISTS apps (
  id          SERIAL      PRIMARY KEY,
  name        TEXT        NOT NULL,
  description TEXT        NOT NULL DEFAULT '',
  category    TEXT        NOT NULL DEFAULT 'DevTools',
  color       TEXT        NOT NULL DEFAULT '#4a90d9',
  promoted    BOOLEAN     NOT NULL DEFAULT false,
  url         TEXT        NOT NULL DEFAULT '',
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_apps_category ON apps (category);

-- Seed the app catalog from the former MOCK_APPS list (idempotent)
INSERT INTO apps (id, name, description, category, color, promoted) VALUES
  (1,  'KL Build Dashboard',       'Monitor CI/CD pipelines, build status, and deployment history for all Kaspersky MOPS projects in one place.',                         'DevTools',      '#4a90d9', false),
  (2,  'Prometheus Monitor',        'Real-time metrics collection and alerting for all MOPS infrastructure services. Visualize CPU, memory, and request rates.',             'Monitoring',    '#e67e22', false),
  (3,  'ISY Compliance Checker',    'Automated ISY security policy compliance scanner. Validates servers against Kaspersky internal security baselines.',                    'Security',      '#e74c3c', false),
  (4,  'OpenStack Manager',         'Provision and manage OpenStack VM instances, networks, and storage volumes for the MOPS team infrastructure.',                          'Infrastructure','#8e44ad', false),
  (5,  'Code Review Tool',          'Lightweight code review utility integrated with Kaspersky internal source hosting. Review merge requests and track merge status.',      'DevTools',      '#27ae60', false),
  (6,  'Grafana Dashboards',        'Pre-built Grafana dashboards for MOPS service health, error rates, latency histograms, and SLA compliance.',                           'Monitoring',    '#f39c12', false),
  (7,  'Vault Secrets Manager',     'Centralized secrets and credentials management for MOPS services. Rotate keys and manage access policies.',                             'Security',      '#c0392b', false),
  (8,  'Network Topology Viewer',   'Interactive visualization of MOPS network segments, VLANs, firewall rules, and service connectivity maps.',                             'Infrastructure','#2980b9', false),
  (9,  'TFS Project Tracker',       'Track TFS work items, sprints, and project milestones. Synced with the MOPS team backlog and release plans.',                          'DevTools',      '#16a085', false),
  (10, 'Log Aggregator',            'Centralized log viewer for all MOPS services. Search, filter, and correlate logs across distributed components.',                       'Monitoring',    '#d35400', false)
ON CONFLICT (id) DO NOTHING;

-- Reset auto-increment sequence so new rows don't collide with seeded IDs
SELECT setval('apps_id_seq', COALESCE((SELECT MAX(id) FROM apps), 1));

-- User preferences: generic key/value store per user (used for kb recent articles)
CREATE TABLE IF NOT EXISTS user_preferences (
  user_login  TEXT        NOT NULL,
  key         TEXT        NOT NULL,
  value       TEXT        NOT NULL DEFAULT '',
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (user_login, key)
);

CREATE INDEX IF NOT EXISTS idx_user_preferences_user ON user_preferences (user_login);
