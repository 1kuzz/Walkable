-- Seed Walkable as the first approved project in the showcase.
-- Stars / metadata will be refreshed from GitHub on first admin refresh.
INSERT INTO projects (github_url, name, description, language, stars, owner_login, approved)
VALUES (
  'https://github.com/1kuzz/Walkable',
  'Walkable',
  'Walking route discovery and community platform. Explore park routes, build custom walks, check trail conditions and weather.',
  'TypeScript',
  0,
  '1kuzz',
  TRUE
)
ON CONFLICT (github_url) DO NOTHING;

INSERT INTO project_stats (project_id)
SELECT id FROM projects WHERE github_url = 'https://github.com/1kuzz/Walkable'
ON CONFLICT DO NOTHING;
