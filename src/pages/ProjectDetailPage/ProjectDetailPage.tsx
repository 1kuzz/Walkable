import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { getProject, incrementView, type Project } from '../../api/projectsClient';
import styles from './ProjectDetailPage.module.css';

const LANG_COLORS: Record<string, string> = {
  TypeScript: '#3178c6', JavaScript: '#f1e05a', Python: '#3572A5',
  Go: '#00ADD8', Rust: '#dea584', Java: '#b07219', 'C++': '#f34b7d',
  C: '#555555', 'C#': '#178600', Ruby: '#701516', PHP: '#4F5D95',
  Swift: '#F05138', Kotlin: '#A97BFF', Dart: '#00B4AB', Shell: '#89e051',
  HTML: '#e34c26', CSS: '#563d7c', Vue: '#41b883', Svelte: '#ff3e00',
};

export function ProjectDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [project, setProject] = useState<Project | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!id) return;
    getProject(id)
      .then((p) => {
        setProject(p);
        // Fire-and-forget view increment
        incrementView(id).catch(() => {});
      })
      .catch((e: Error) => setError(e.message))
      .finally(() => setLoading(false));
  }, [id]);

  if (loading) {
    return (
      <div className={styles.page}>
        <p className={styles.loading}>Loading…</p>
      </div>
    );
  }

  if (error || !project) {
    return (
      <div className={styles.page}>
        <button className={styles.backBtn} onClick={() => navigate('/gallery')}>
          ← Back to gallery
        </button>
        <p className={styles.errorMsg}>{error ?? 'Project not found.'}</p>
      </div>
    );
  }

  const langColor = project.language ? (LANG_COLORS[project.language] ?? '#6b7f8e') : null;
  const submittedDate = new Date(project.submitted_at).toLocaleDateString(undefined, {
    year: 'numeric', month: 'long', day: 'numeric',
  });

  return (
    <div className={styles.page}>
      <button className={styles.backBtn} onClick={() => navigate('/gallery')}>
        ← Back to gallery
      </button>

      <div className={styles.card}>
        <div className={styles.cardOwner}>
          {project.owner_avatar_url && (
            <img src={project.owner_avatar_url} alt="" className={styles.avatar} />
          )}
          <span className={styles.ownerLogin}>{project.owner_login}</span>
          <span className={styles.slash}>/</span>
          <span className={styles.repoName}>{project.name}</span>
        </div>

        {project.description && (
          <p className={styles.description}>{project.description}</p>
        )}

        <div className={styles.meta}>
          {project.language && langColor && (
            <span className={styles.metaItem}>
              <span className={styles.langDot} style={{ background: langColor }} />
              {project.language}
            </span>
          )}
          <span className={styles.metaItem}>⭐ {project.stars.toLocaleString()} stars</span>
          <span className={styles.metaItem}>👁 {project.views.toLocaleString()} views</span>
        </div>

        <div className={styles.actions}>
          <a
            href={project.github_url}
            target="_blank"
            rel="noopener noreferrer"
            className={styles.githubBtn}
          >
            View on GitHub ↗
          </a>
        </div>

        <p className={styles.submittedAt}>Submitted {submittedDate}</p>
      </div>
    </div>
  );
}
