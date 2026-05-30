import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useGitHubAuth } from '../../contexts/useGitHubAuth';
import styles from './LandingPage.module.css';

const FEATURES = [
  { icon: '⚡', title: 'Instant builds', body: 'npm install + npm run build — no config needed. Works with Vite, Next, CRA, anything.' },
  { icon: '🔗', title: 'Shareable links', body: 'Every deploy gets a private VIP link. Share with teammates, show clients, post anywhere.' },
  { icon: '🤖', title: 'AI-native', body: 'Works with Claude, Cursor, Copilot — just export a ZIP and paste the link in chat.' },
  { icon: '⚙️', title: 'Node backends', body: 'Bundle a Node.js server with portal.json and we run it alongside your frontend.' },
];

const STEPS = [
  { n: '01', title: 'Upload or import', body: 'Drop a ZIP file or paste your GitHub repo URL. We handle the rest.' },
  { n: '02', title: 'We build & deploy', body: 'Your app builds automatically and goes live on our infra in seconds.' },
  { n: '03', title: 'Share your link', body: 'Copy your VIP link and share it with anyone. No login required to view.' },
];

const FREE_FEATURES = ['1 deployment / day', '24-hour link lifetime', 'Automatic npm builds', 'Node.js backends', 'GitHub import'];
const PRO_FEATURES  = ['Unlimited deployments', 'Permanent links', 'Custom URL slugs', 'API access (CLI / Claude)', 'Priority support'];

export function LandingPage() {
  const { user, loading } = useGitHubAuth();
  const navigate = useNavigate();

  useEffect(() => {
    if (!loading && user) navigate('/deploy', { replace: true });
  }, [user, loading, navigate]);

  const handleLogin = () => {
    window.location.href = '/api/auth/github';
  };

  return (
    <div className={styles.page}>
      {/* ── Nav ── */}
      <nav className={styles.nav}>
        <span className={styles.navBrand}>VibePort</span>
        <div className={styles.navRight}>
          <a href="/apps" className={styles.navLink}>Gallery</a>
          <a href="/help" className={styles.navLink}>Docs</a>
          <button className={styles.navCta} onClick={handleLogin}>
            Deploy with GitHub →
          </button>
        </div>
      </nav>

      {/* ── Hero ── */}
      <section className={styles.hero}>
        <div className={styles.heroBadge}>Built for vibe coders</div>
        <h1 className={styles.heroTitle}>
          Your AI code,<br />live in 10 seconds.
        </h1>
        <p className={styles.heroSub}>
          Upload a ZIP or import from GitHub. VibePort builds and deploys it — no config, no DevOps, no waiting.
        </p>
        <div className={styles.heroCtas}>
          <button className={styles.ctaPrimary} onClick={handleLogin}>
            Deploy for free with GitHub
          </button>
          <a href="/apps" className={styles.ctaSecondary}>
            Browse live examples →
          </a>
        </div>
        <div className={styles.heroCode}>
          <span className={styles.codePrompt}>$</span>
          <span className={styles.codeText}>Upload ZIP → Instant live URL → Share with anyone</span>
        </div>
      </section>

      {/* ── How it works ── */}
      <section className={styles.section}>
        <h2 className={styles.sectionTitle}>How it works</h2>
        <div className={styles.steps}>
          {STEPS.map(s => (
            <div key={s.n} className={styles.step}>
              <span className={styles.stepNum}>{s.n}</span>
              <h3 className={styles.stepTitle}>{s.title}</h3>
              <p className={styles.stepBody}>{s.body}</p>
            </div>
          ))}
        </div>
      </section>

      {/* ── Features ── */}
      <section className={styles.section}>
        <h2 className={styles.sectionTitle}>Everything you need</h2>
        <div className={styles.features}>
          {FEATURES.map(f => (
            <div key={f.title} className={styles.featureCard}>
              <div className={styles.featureIcon}>{f.icon}</div>
              <h3 className={styles.featureTitle}>{f.title}</h3>
              <p className={styles.featureBody}>{f.body}</p>
            </div>
          ))}
        </div>
      </section>

      {/* ── Pricing ── */}
      <section className={styles.section} id="pricing">
        <h2 className={styles.sectionTitle}>Simple pricing</h2>
        <div className={styles.pricing}>
          <div className={styles.pricingCard}>
            <div className={styles.pricingName}>Free</div>
            <div className={styles.pricingPrice}>$0</div>
            <div className={styles.pricingPer}>forever</div>
            <ul className={styles.pricingList}>
              {FREE_FEATURES.map(f => (
                <li key={f} className={styles.pricingItem}><span className={styles.check}>✓</span>{f}</li>
              ))}
            </ul>
            <button className={styles.pricingBtn} onClick={handleLogin}>Get started free</button>
          </div>
          <div className={`${styles.pricingCard} ${styles.pricingCardPro}`}>
            <div className={styles.proBadge}>PRO</div>
            <div className={styles.pricingName}>Pro</div>
            <div className={styles.pricingPrice}>$7</div>
            <div className={styles.pricingPer}>per month</div>
            <ul className={styles.pricingList}>
              {PRO_FEATURES.map(f => (
                <li key={f} className={styles.pricingItem}><span className={styles.check}>✓</span>{f}</li>
              ))}
            </ul>
            <a href="mailto:pro@1kuzz.org?subject=VibePort Pro" className={`${styles.pricingBtn} ${styles.pricingBtnPro}`}>
              Upgrade to Pro
            </a>
          </div>
        </div>
      </section>

      {/* ── CTA banner ── */}
      <section className={styles.ctaBanner}>
        <h2 className={styles.ctaBannerTitle}>Ready to ship your vibe?</h2>
        <p className={styles.ctaBannerSub}>Free forever. No credit card. No config.</p>
        <button className={styles.ctaPrimary} onClick={handleLogin}>
          Start deploying →
        </button>
      </section>

      {/* ── Footer ── */}
      <footer className={styles.footer}>
        <span>VibePort © {new Date().getFullYear()}</span>
        <div className={styles.footerLinks}>
          <a href="/help" className={styles.footerLink}>Docs</a>
          <a href="https://github.com/1kuzz/Walkable" target="_blank" rel="noreferrer" className={styles.footerLink}>GitHub</a>
          <a href="/apps" className={styles.footerLink}>Gallery</a>
        </div>
      </footer>
    </div>
  );
}
