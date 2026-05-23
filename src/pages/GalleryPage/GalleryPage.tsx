import { useState, useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { listProjects, type Project } from '../../api/projectsClient';
import styles from './GalleryPage.module.css';

const LANG_COLORS: Record<string, string> = {
  TypeScript: '#3178c6', JavaScript: '#f1e05a', Python: '#3572A5',
  Go: '#00ADD8', Rust: '#dea584', Java: '#b07219', 'C++': '#f34b7d',
  C: '#555555', 'C#': '#178600', Ruby: '#701516', PHP: '#4F5D95',
  Swift: '#F05138', Kotlin: '#A97BFF', Dart: '#00B4AB', Shell: '#89e051',
  HTML: '#e34c26', CSS: '#563d7c', Vue: '#41b883', Svelte: '#ff3e00',
};

function LanguageBadge({ lang }: { lang: string | null }) {
  if (!lang) return null;
  const color = LANG_COLORS[lang] ?? '#6b7f8e';
  return (
    <span className={styles.langBadge}>
      <span className={styles.langDot} style={{ background: color }} />
      {lang}
    </span>
  );
}

function ProjectCard({ project, onClick }: { project: Project; onClick: () => void }) {
  return (
    <article className={styles.card} onClick={onClick} role="button" tabIndex={0}
      onKeyDown={(e) => e.key === 'Enter' && onClick()}>
      <div className={styles.cardHeader}>
        {project.owner_avatar_url && (
          <img src={project.owner_avatar_url} alt="" className={styles.avatar} loading="lazy" />
        )}
        <span className={styles.ownerName}>{project.owner_login}</span>
      </div>
      <h3 className={styles.cardTitle}>{project.name}</h3>
      {project.description && (
        <p className={styles.cardDesc}>{project.description}</p>
      )}
      <div className={styles.cardFooter}>
        <LanguageBadge lang={project.language} />
        <span className={styles.stat} title="GitHub stars">⭐ {project.stars.toLocaleString()}</span>
        <span className={styles.stat} title="Views">👁 {project.views.toLocaleString()}</span>
      </div>
    </article>
  );
}

export function GalleryPage() {
  const navigate = useNavigate();
  const [projects, setProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [langFilter, setLangFilter] = useState('');

  useEffect(() => {
    listProjects()
      .then(setProjects)
      .catch((e: Error) => setError(e.message))
      .finally(() => setLoading(false));
  }, []);

  const languages = useMemo(() => {
    const langs = [...new Set(projects.map((p) => p.language).filter(Boolean))] as string[];
    return langs.sort();
  }, [projects]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return projects.filter((p) => {
      if (langFilter && p.language !== langFilter) return false;
      if (q && !p.name.toLowerCase().includes(q) && !p.description.toLowerCase().includes(q)) return false;
      return true;
    });
  }, [projects, search, langFilter]);

  return (
    <div className={styles.page}>
      <div className={styles.pageHeader}>
        <div className={styles.pageHeaderRow}>
          <div>
            <h1 className={styles.pageTitle}>Project Showcase</h1>
            <p className={styles.pageSubtitle}>
              {loading ? 'Loading…' : `${projects.length} open source project${projects.length !== 1 ? 's' : ''}. Browse or submit yours.`}
            </p>
          </div>
          <button className={styles.submitBtn} onClick={() => navigate('/content')}>
            Submit a project →
          </button>
        </div>

        <div className={styles.filterBar}>
          <input
            className={styles.searchInput}
            type="search"
            placeholder="Search projects…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            aria-label="Search projects"
          />
          <select
            className={styles.langSelect}
            value={langFilter}
            onChange={(e) => setLangFilter(e.target.value)}
            aria-label="Filter by language"
          >
            <option value="">All languages</option>
            {languages.map((l) => <option key={l} value={l}>{l}</option>)}
          </select>
        </div>
      </div>

      {error && <p className={styles.errorMsg}>Failed to load projects: {error}</p>}

      {!loading && !error && filtered.length === 0 && (
        <div className={styles.empty}>
          {projects.length === 0
            ? <>No projects yet. <button className={styles.emptyLink} onClick={() => navigate('/content')}>Be the first to submit one!</button></>
            : 'No projects match your search.'}
        </div>
      )}

      <div className={styles.grid}>
        {filtered.map((p) => (
          <ProjectCard key={p.id} project={p} onClick={() => navigate(`/projects/${p.id}`)} />
        ))}
      </div>
    </div>
  );
}
