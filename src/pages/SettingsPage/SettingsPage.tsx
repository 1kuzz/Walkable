import { useState, useEffect } from 'react';
import { getTheme, setTheme, type Theme } from '../../services/themeService';
import { LanguageSwitcher } from '../../components/LanguageSwitcher';
import { useGitHubAuth } from '../../contexts/useGitHubAuth';
import styles from './SettingsPage.module.css';

interface ApiToken {
  id: string;
  name: string;
  masked: string;
  created_at: string;
  last_used_at: string | null;
}

function ApiTokensSection() {
  const [tokens, setTokens] = useState<ApiToken[]>([]);
  const [loading, setLoading] = useState(true);
  const [newName, setNewName] = useState('');
  const [creating, setCreating] = useState(false);
  const [newToken, setNewToken] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const fetchTokens = async () => {
    try {
      const res = await fetch('/api/tokens', { credentials: 'include' });
      if (res.ok) setTokens(await res.json() as ApiToken[]);
    } finally { setLoading(false); }
  };

  useEffect(() => { void fetchTokens(); }, []);

  const handleCreate = async () => {
    if (!newName.trim()) return;
    setCreating(true);
    try {
      const res = await fetch('/api/tokens', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: newName.trim() }),
      });
      const data = await res.json() as { token?: string; error?: string };
      if (data.token) {
        setNewToken(data.token);
        setNewName('');
        void fetchTokens();
      }
    } finally { setCreating(false); }
  };

  const handleRevoke = async (id: string) => {
    if (!confirm('Revoke this token?')) return;
    await fetch(`/api/tokens/${id}`, { method: 'DELETE', credentials: 'include' });
    void fetchTokens();
  };

  const handleCopy = () => {
    if (!newToken) return;
    void navigator.clipboard.writeText(newToken).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  };

  return (
    <div id="pro" className={styles.section}>
      <h2 className={styles.sectionTitle}>API Tokens</h2>
      <p className={styles.sectionNote}>
        Use tokens to deploy via API, CLI, or from Claude sessions.{' '}
        <code className={styles.code}>Authorization: Bearer tok_xxx</code>
      </p>

      {newToken && (
        <div className={styles.tokenReveal}>
          <p className={styles.tokenRevealNote}>⚠️ Copy this token now — it will not be shown again.</p>
          <div className={styles.tokenRevealRow}>
            <code className={styles.tokenRevealValue}>{newToken}</code>
            <button className={`${styles.copyTokenBtn} ${copied ? styles.copied : ''}`} onClick={handleCopy}>
              {copied ? '✓ Copied' : 'Copy'}
            </button>
          </div>
          <button className={styles.dismissBtn} onClick={() => setNewToken(null)}>Done, I saved it</button>
        </div>
      )}

      <div className={styles.createTokenRow}>
        <input
          className={styles.tokenNameInput}
          placeholder="Token name (e.g. claude-deploy)"
          value={newName}
          onChange={e => setNewName(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && void handleCreate()}
        />
        <button className={styles.createBtn} onClick={() => void handleCreate()} disabled={creating || !newName.trim()}>
          {creating ? '…' : 'Generate'}
        </button>
      </div>

      {loading ? (
        <p className={styles.muted}>Loading…</p>
      ) : tokens.length === 0 ? (
        <p className={styles.muted}>No tokens yet.</p>
      ) : (
        <ul className={styles.tokenList}>
          {tokens.map(t => (
            <li key={t.id} className={styles.tokenItem}>
              <div>
                <span className={styles.tokenName}>{t.name}</span>
                <span className={styles.tokenMasked}>{t.masked}</span>
              </div>
              <div className={styles.tokenMeta}>
                {t.last_used_at ? `Last used ${new Date(t.last_used_at).toLocaleDateString()}` : 'Never used'}
              </div>
              <button className={styles.revokeBtn} onClick={() => void handleRevoke(t.id)}>Revoke</button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

export function SettingsPage() {
  const { user, logout } = useGitHubAuth();
  const [theme, setThemeState] = useState<Theme>(getTheme);
  const isPro = (user as (typeof user & { tier?: string }) | null)?.tier === 'pro';

  function handleThemeChange(next: Theme) {
    setTheme(next);
    setThemeState(next);
  }

  return (
    <div className={styles.page}>
      <div className={styles.pageHeader}>
        <h1 className={styles.pageTitle}>Settings</h1>
        <p className={styles.pageSubtitle}>Account and preferences</p>
      </div>

      {/* Account */}
      {user && (
        <div className={styles.section}>
          <h2 className={styles.sectionTitle}>Account</h2>
          <div className={styles.accountRow}>
            {user.avatar_url && (
              <img src={user.avatar_url} alt={user.login} className={styles.accountAvatar} />
            )}
            <div className={styles.accountInfo}>
              <div className={styles.accountLoginRow}>
                <span className={styles.accountLogin}>{user.login}</span>
                {isPro && <span className={styles.proBadge}>PRO</span>}
              </div>
              {user.name && <span className={styles.accountName}>{user.name}</span>}
              <span className={styles.accountProvider}>GitHub account</span>
            </div>
            <button className={styles.signOutBtn} onClick={() => void logout()}>
              Sign out
            </button>
          </div>
        </div>
      )}

      {/* Plan */}
      <div className={styles.section}>
        <h2 className={styles.sectionTitle}>Plan</h2>
        <div className={styles.planCard}>
          {isPro ? (
            <>
              <div className={styles.planName}>Pro <span className={styles.proBadge}>PRO</span></div>
              <p className={styles.planDesc}>Unlimited deployments · Permanent links · API access</p>
            </>
          ) : (
            <>
              <div className={styles.planName}>Free</div>
              <p className={styles.planDesc}>1 deployment/day · 24-hour links</p>
              <a href="mailto:pro@1kuzz.org?subject=VibePort Pro Upgrade" className={styles.upgradeBtn}>
                Upgrade to Pro — $7/mo →
              </a>
            </>
          )}
        </div>
      </div>

      {/* API Tokens */}
      <ApiTokensSection />

      {/* Theme */}
      <div className={styles.section}>
        <h2 className={styles.sectionTitle}>Theme</h2>
        <div className={styles.themeOptions}>
          {(['dark', 'light'] as const).map((t) => (
            <button
              key={t}
              className={`${styles.themeBtn} ${theme === t ? styles.themeBtnActive : ''}`}
              onClick={() => handleThemeChange(t)}
            >
              {t === 'light' ? '☀️ Light' : '🌙 Dark'}
            </button>
          ))}
        </div>
      </div>

      {/* Language */}
      <div className={styles.section}>
        <h2 className={styles.sectionTitle}>Language</h2>
        <LanguageSwitcher />
      </div>
    </div>
  );
}
