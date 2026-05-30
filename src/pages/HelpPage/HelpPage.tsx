import { Link } from 'react-router-dom';
import styles from './HelpPage.module.css';

interface CheckItem {
  text: string;
  note?: string;
}

function Checklist({ items }: { items: CheckItem[] }) {
  return (
    <ul className={styles.checklist}>
      {items.map((item, i) => (
        <li key={i} className={styles.checkItem}>
          <span className={styles.checkIcon}>✓</span>
          <span>
            {item.text}
            {item.note && <span className={styles.checkNote}> — {item.note}</span>}
          </span>
        </li>
      ))}
    </ul>
  );
}

function WarnList({ items }: { items: string[] }) {
  return (
    <ul className={styles.warnList}>
      {items.map((item, i) => (
        <li key={i} className={styles.warnItem}>
          <span className={styles.warnIcon}>✕</span>
          <span>{item}</span>
        </li>
      ))}
    </ul>
  );
}

export function HelpPage() {
  return (
    <div className={styles.page}>
      <div className={styles.pageHeader}>
        <h1 className={styles.pageTitle}>VibePort Docs</h1>
        <p className={styles.pageSubtitle}>
          Deploy your AI-generated code in seconds. No config, no DevOps.
        </p>
      </div>

      {/* How it works */}
      <div className={styles.section}>
        <h2 className={styles.sectionTitle}>How it works</h2>
        <div className={styles.steps}>
          <div className={styles.step}>
            <span className={styles.stepNum}>1</span>
            <div>
              <div className={styles.stepLabel}>Upload or import</div>
              <div className={styles.stepDesc}>Drop a ZIP or paste a GitHub URL. We extract and find your index.html automatically.</div>
            </div>
          </div>
          <div className={styles.stepArrow}>→</div>
          <div className={styles.step}>
            <span className={styles.stepNum}>2</span>
            <div>
              <div className={styles.stepLabel}>Instant deploy</div>
              <div className={styles.stepDesc}>Your app goes live immediately — no review, no waiting. Builds run automatically if enabled.</div>
            </div>
          </div>
          <div className={styles.stepArrow}>→</div>
          <div className={styles.step}>
            <span className={styles.stepNum}>3</span>
            <div>
              <div className={styles.stepLabel}>Share your link</div>
              <div className={styles.stepDesc}>Copy your VIP link and share with anyone. No login required to view.</div>
            </div>
          </div>
        </div>
      </div>

      {/* Tiers */}
      <div className={styles.section}>
        <h2 className={styles.sectionTitle}>Free vs Pro</h2>
        <div className={styles.sectionRow}>
          <div>
            <p className={styles.tierLabel}>Free</p>
            <Checklist items={[
              { text: '1 deployment per day' },
              { text: 'Links expire after 24 hours' },
              { text: 'npm builds included' },
              { text: 'Node.js backends (portal.json)' },
              { text: 'GitHub import' },
            ]} />
          </div>
          <div>
            <p className={styles.tierLabel}>Pro — $7/mo</p>
            <Checklist items={[
              { text: 'Unlimited deployments' },
              { text: 'Permanent links (no expiry)' },
              { text: 'API access (deploy from Claude / CLI)' },
              { text: 'All Free features' },
            ]} />
            <a href="mailto:pro@1kuzz.org?subject=VibePort Pro" className={styles.upgradeLink}>
              Upgrade to Pro →
            </a>
          </div>
        </div>
      </div>

      {/* Upload methods */}
      <div className={styles.sectionRow}>
        <div className={styles.section}>
          <h2 className={styles.sectionTitle}>ZIP upload</h2>
          <Checklist items={[
            { text: 'File must be a .zip archive', note: 'no .tar, .rar, .7z' },
            { text: 'Max ZIP size: 200 MB compressed' },
            { text: 'Max extracted size: 500 MB' },
            { text: 'Max number of files: 5,000' },
            { text: 'Must contain an index.html', note: 'shallowest one is used as entry' },
            { text: '.git folders are stripped automatically' },
          ]} />
        </div>

        <div className={styles.section}>
          <h2 className={styles.sectionTitle}>GitHub import</h2>
          <Checklist items={[
            { text: 'Public repos work without signing in' },
            { text: 'Private repos require GitHub sign-in', note: 'OAuth token used automatically' },
            { text: 'Repo ZIP must be under 200 MB' },
            { text: 'Same index.html requirement applies' },
            { text: 'Enable "Build" for source repos', note: 'React, Vue, Vite, etc.' },
          ]} />
        </div>
      </div>

      {/* Build option */}
      <div className={styles.section}>
        <h2 className={styles.sectionTitle}>Automatic builds (npm)</h2>
        <p className={styles.sectionDesc}>
          Enable "Build with npm" when your project needs to be compiled first.
          We run <code className={styles.code}>npm install</code> and{' '}
          <code className={styles.code}>npm run build</code> for you.
        </p>
        <Checklist items={[
          { text: 'package.json must be at the ZIP root' },
          { text: 'A "build" script must be defined in package.json' },
          { text: 'Output must go to dist/, build/, out/, or public/' },
          { text: 'Build must complete within 5 minutes' },
          { text: 'Test locally: npm install && npm run build should succeed' },
        ]} />
        <p className={styles.tipBox}>
          <strong>Tip:</strong> If your build needs env vars, VibePort will detect your <code className={styles.code}>.env.example</code> and prompt you to fill in the values before deploying.
        </p>
      </div>

      {/* Node backends */}
      <div className={styles.section}>
        <h2 className={styles.sectionTitle}>Node.js backends (portal.json)</h2>
        <p className={styles.sectionDesc}>
          Bundle a Node.js server alongside your frontend by adding a <code className={styles.code}>portal.json</code> file
          next to your <code className={styles.code}>index.html</code>:
        </p>
        <pre className={styles.codeBlock}>{`{
  "backend": {
    "entry": "server/server.js",
    "prefix": "/my-app",
    "static": ["assets"]
  }
}`}</pre>
        <Checklist items={[
          { text: 'entry — path to your Node.js entry file (relative to portal.json)' },
          { text: 'prefix — nginx location prefix for API calls (e.g. /my-app)' },
          { text: 'static — optional dirs to serve as static files' },
          { text: 'Server must listen on process.env.PORT' },
        ]} />
        <p className={styles.tipBox}>
          <strong>API path:</strong> Requests to <code className={styles.code}>{'{prefix}/api/'}</code> are proxied to your server.
        </p>
      </div>

      {/* API tokens */}
      <div className={styles.section}>
        <h2 className={styles.sectionTitle}>API deployment (Pro)</h2>
        <p className={styles.sectionDesc}>
          Generate an API token in{' '}
          <Link to="/settings" className={styles.inlineLink}>Settings</Link>{' '}
          and deploy from anywhere — your terminal, a Claude session, or a CI pipeline.
        </p>
        <pre className={styles.codeBlock}>{`# Deploy a ZIP via curl
curl -X POST https://1kuzz.org/api/content \\
  -H "Authorization: Bearer tok_your_token" \\
  -F "archive=@./myapp.zip" \\
  -F "name=My App" \\
  -F "build=true"`}</pre>
        <p className={styles.tipBox}>
          <strong>Response:</strong> Returns <code className={styles.code}>{"{ id, shareToken, envVarsRequired }"}</code>. Use <code className={styles.code}>shareToken</code> to construct the VIP link: <code className={styles.code}>https://1kuzz.org/vip/{'{shareToken}'}</code>
        </p>
      </div>

      {/* What works / what doesn't */}
      <div className={styles.sectionRow}>
        <div className={styles.section}>
          <h2 className={styles.sectionTitle}>What works</h2>
          <Checklist items={[
            { text: 'HTML + CSS + vanilla JavaScript' },
            { text: 'React / Vue / Svelte (built to static files)' },
            { text: 'Scripts from CDNs', note: 'unpkg, jsDelivr, etc.' },
            { text: 'Google Fonts and external stylesheets' },
            { text: 'fetch() to external APIs' },
            { text: 'WebGL, Canvas, Web Audio API' },
            { text: 'LocalStorage and SessionStorage' },
            { text: 'Node.js backends via portal.json' },
          ]} />
        </div>

        <div className={styles.section}>
          <h2 className={styles.sectionTitle}>What does not work</h2>
          <WarnList items={[
            'Server-side code without portal.json (Node.js, PHP, Python)',
            'Hardcoded localhost URLs — they won\'t resolve for other users',
            'WebSockets to a custom server without portal.json',
            'Reading files from disk with the File System API',
            'Browser extensions or native app features',
          ]} />
        </div>
      </div>

      {/* Common errors */}
      <div className={styles.section}>
        <h2 className={styles.sectionTitle}>Common errors</h2>
        <div className={styles.faqList}>
          <div className={styles.faqItem}>
            <div className={styles.faqQ}>App uploads but appears blank</div>
            <div className={styles.faqA}>
              Open the browser console (F12 → Console).
              Look for 404 errors on assets — paths like <code className={styles.code}>/assets/app.js</code> are
              absolute and won't resolve. Change them to <code className={styles.code}>./assets/app.js</code> and re-deploy.
            </div>
          </div>

          <div className={styles.faqItem}>
            <div className={styles.faqQ}>No index.html found in the archive</div>
            <div className={styles.faqA}>
              You uploaded source code without building it. Either run{' '}
              <code className={styles.code}>npm run build</code> locally and ZIP the output folder,
              or enable "Build with npm" during upload.
            </div>
          </div>

          <div className={styles.faqItem}>
            <div className={styles.faqQ}>Build failed</div>
            <div className={styles.faqA}>
              The build log is shown after a failed upload. Common causes: missing{' '}
              <code className={styles.code}>build</code> script in package.json, missing env vars,
              or a native dependency the build server doesn't support.
              Always verify <code className={styles.code}>npm install &amp;&amp; npm run build</code> works locally first.
            </div>
          </div>

          <div className={styles.faqItem}>
            <div className={styles.faqQ}>Link expired</div>
            <div className={styles.faqA}>
              Free tier links expire after 24 hours. Re-upload to get a new link, or upgrade to Pro for permanent links.
            </div>
          </div>
        </div>
      </div>

      <div className={styles.footer}>
        Ready to deploy?{' '}
        <Link to="/deploy" className={styles.footerLink}>
          Go to Deploy →
        </Link>
      </div>
    </div>
  );
}
