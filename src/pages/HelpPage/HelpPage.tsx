import { useState } from 'react';
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

function CopyPrompt({ label, text }: { label: string; text: string }) {
  const [copied, setCopied] = useState(false);
  const handleCopy = () => {
    void navigator.clipboard.writeText(text).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  };
  return (
    <div className={styles.promptBlock}>
      <div className={styles.promptHeader}>
        <span className={styles.promptLabel}>{label}</span>
        <button className={`${styles.copyBtn} ${copied ? styles.copyBtnDone : ''}`} onClick={handleCopy}>
          {copied ? '✓ Copied' : 'Copy'}
        </button>
      </div>
      <pre className={styles.promptText}>{text}</pre>
    </div>
  );
}

export function HelpPage() {
  return (
    <div className={styles.page}>
      <div className={styles.pageHeader}>
        <h1 className={styles.pageTitle}>VibePort Docs</h1>
        <p className={styles.pageSubtitle}>
          A self-hosted platform for deploying AI-generated projects instantly — static frontends, npm builds, and full-stack Node.js apps with backends.
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
              <div className={styles.stepDesc}>Drop a ZIP or pick a GitHub repo. We extract it and find your <code className={styles.code}>index.html</code> automatically.</div>
            </div>
          </div>
          <div className={styles.stepArrow}>→</div>
          <div className={styles.step}>
            <span className={styles.stepNum}>2</span>
            <div>
              <div className={styles.stepLabel}>Build (optional)</div>
              <div className={styles.stepDesc}>Enable "npm build" and we run <code className={styles.code}>npm install &amp;&amp; npm run build</code> for you — no local setup needed.</div>
            </div>
          </div>
          <div className={styles.stepArrow}>→</div>
          <div className={styles.step}>
            <span className={styles.stepNum}>3</span>
            <div>
              <div className={styles.stepLabel}>Live instantly</div>
              <div className={styles.stepDesc}>Your app goes live with a shareable VIP link. Backends start automatically if configured.</div>
            </div>
          </div>
        </div>
      </div>

      {/* Prompts to normalize projects */}
      <div className={styles.section}>
        <h2 className={styles.sectionTitle}>Prompts to make your project portal-ready</h2>
        <p className={styles.sectionDesc}>
          Give these prompts to Claude (or any AI) to prepare your project for VibePort. Copy the one that matches your project type.
        </p>

        <p className={styles.subheading}>Static / SPA project (React, Vue, Vite, Svelte…)</p>
        <CopyPrompt
          label="Fix paths and make it deployable"
          text={`Make this project deployable as a static web app on VibePort.

Requirements:
1. npm run build must output index.html + assets to dist/
2. All asset paths must be relative — use ./assets/... not /assets/...
3. No hardcoded localhost URLs — replace http://localhost:PORT/api/... with /api/...
4. fetch() calls must use relative paths, not absolute URLs
5. index.html must be at the project root or inside dist/

If the project uses Vite, make sure vite.config.ts has base: './' or base: '/' (not a custom hostname).`}
        />

        <p className={styles.subheading} style={{ marginTop: 20 }}>Full-stack project (frontend + Node.js backend)</p>
        <CopyPrompt
          label="Prepare for VibePort with backend"
          text={`Prepare this full-stack project for VibePort deployment.

1. Frontend
   - npm run build must output to dist/ with index.html at the root of dist/
   - All asset paths relative (./assets/... not /assets/...)
   - API calls use relative URLs: fetch('/api/...') not fetch('http://localhost:3001/api/...')

2. Backend
   - Server must listen on process.env.PORT (fall back to 3001 for local dev)
   - All API routes must be prefixed with /api/ (e.g. app.get('/api/users', ...))
   - No hardcoded database connection strings — read from process.env.DATABASE_URL

3. Create portal.json at the project root:
{
  "backend": {
    "entry": "backend/dist/index.js",
    "prefix": "/apps/my-project-name",
    "db": false
  }
}
   - entry: relative path from project root to the compiled server entry file
   - prefix: a unique URL slug, e.g. /apps/my-app (no spaces, letters/digits/hyphens only)
   - db: set true if the app needs PostgreSQL — a database will be auto-provisioned

4. Create .env.example listing every required env var with placeholder values:
DATABASE_URL=postgresql://user:password@host/dbname
SESSION_SECRET=replace-with-32-char-random-string
GITHUB_CLIENT_ID=your_github_app_client_id

5. TypeScript backend: compile to dist/ before the entry file is referenced.
   portal.json entry should point to the compiled .js file, not .ts.`}
        />

        <p className={styles.subheading} style={{ marginTop: 20 }}>Project with environment variables only</p>
        <CopyPrompt
          label="Create .env.example"
          text={`Create a .env.example file that documents all environment variables this project needs.

Rules:
- One variable per line: KEY=placeholder_description
- Add a comment line above each variable explaining what it is and where to get it
- Never put real values — use placeholders like "your_api_key_here" or "auto-generated"
- Include every variable the app reads from process.env (or import.meta.env for Vite)

Example format:
# GitHub OAuth — create at github.com/settings/developers
GITHUB_CLIENT_ID=your_github_oauth_app_client_id
GITHUB_CLIENT_SECRET=your_github_oauth_app_client_secret

# Database — connection string for PostgreSQL
DATABASE_URL=postgresql://user:password@localhost:5432/mydb

# Session signing — generate with: openssl rand -hex 32
SESSION_SECRET=replace_with_64_char_hex_string`}
        />

        <p className={styles.subheading} style={{ marginTop: 20 }}>Fix hardcoded paths (common issue)</p>
        <CopyPrompt
          label="Fix all absolute and localhost paths"
          text={`Audit and fix all path issues in this project so it works when deployed on a subdomain or path prefix.

Find and fix:
1. Absolute asset paths — change /assets/app.js → ./assets/app.js (or use a bundler base URL setting)
2. Hardcoded localhost URLs — change http://localhost:3001/api → /api (relative, no origin)
3. Hardcoded port numbers in frontend code — remove entirely, use relative paths
4. import.meta.env.VITE_API_URL that points to localhost — change default to '' (empty string = same origin)
5. WebSocket URLs like ws://localhost:3001 — change to use window.location.host:
   new WebSocket(\`ws://\${window.location.host}/ws\`)

After fixing, run the build locally and check the browser console for any remaining 404 errors on assets.`}
        />

        <p className={styles.tipBox}>
          <strong>Tip:</strong> After deploying, if your app appears blank, open the browser console (F12 → Console) and look for 404 errors — these are almost always path issues that the prompts above will fix.
        </p>
      </div>

      {/* portal.json reference */}
      <div className={styles.section}>
        <h2 className={styles.sectionTitle}>Node.js backends — portal.json</h2>
        <p className={styles.sectionDesc}>
          Add a <code className={styles.code}>portal.json</code> file to your project to have VibePort automatically start your Node.js server, proxy API calls through nginx, and optionally provision a PostgreSQL database.
        </p>

        <pre className={styles.codeBlock}>{`{
  "backend": {
    "entry":    "backend/dist/index.js",   // relative path to your server entry (compiled JS)
    "prefix":   "/apps/my-project",        // unique URL prefix — no conflicts with /api, /uploads, etc.
    "static":   ["sounds", "uploads"],     // optional: dirs served as static files at {prefix}/{dir}/
    "apiRoutes": ["/api/my-routes"],       // optional: additional root-level paths proxied to this server
    "serveApp": "/app",                    // optional: if server also serves the frontend at this path
    "db":       true                       // optional: auto-provision a PostgreSQL database
  }
}`}</pre>

        <div className={styles.sectionRow}>
          <div>
            <p className={styles.subheading}>What VibePort injects automatically</p>
            <Checklist items={[
              { text: 'PORT — the port your server must listen on' },
              { text: 'LOCAL_JWT_SECRET — a strong random secret for signing tokens' },
              { text: "CORS_ORIGIN — set to the portal's public URL" },
              { text: 'DATABASE_URL — if db: true, points to an auto-provisioned Postgres DB' },
              { text: 'Any variables you set in the env form after upload' },
            ]} />
          </div>
          <div>
            <p className={styles.subheading}>Server requirements</p>
            <Checklist items={[
              { text: 'Listen on process.env.PORT (required)' },
              { text: 'Entry file must be compiled JavaScript (.js), not TypeScript' },
              { text: 'package.json in same dir as entry — npm install runs automatically' },
              { text: 'API routes under /api/ are proxied at {prefix}/api/' },
              { text: 'Server must start within ~30 seconds' },
            ]} />
          </div>
        </div>

        <p className={styles.tipBox}>
          <strong>No portal.json?</strong> If VibePort detects a <code className={styles.code}>backend/</code> directory or common server entry files in your project, it will offer a "Configure backend" step after import — letting you set the entry point and URL prefix through the UI without modifying your project files.
        </p>
      </div>

      {/* Configure backend wizard */}
      <div className={styles.section}>
        <h2 className={styles.sectionTitle}>Configure backend wizard</h2>
        <p className={styles.sectionDesc}>
          When you import a project that has a backend but no <code className={styles.code}>portal.json</code>, VibePort detects it automatically and shows a setup step after upload. You can:
        </p>
        <Checklist items={[
          { text: 'Confirm or change the detected entry point', note: 'e.g. backend/dist/index.js' },
          { text: 'Set the URL prefix', note: 'e.g. /apps/my-project — must be unique' },
          { text: 'Toggle auto-provisioned PostgreSQL database' },
          { text: 'Skip the wizard and start the backend manually later' },
        ]} />
        <p className={styles.sectionDesc} style={{ marginTop: 12 }}>
          When you confirm, VibePort writes <code className={styles.code}>portal.json</code> for you, runs{' '}
          <code className={styles.code}>npm install</code> in the backend directory, starts the server via PM2, and configures nginx — all automatically.
          You can stop, restart, or reconfigure the backend from your deployments list.
        </p>
        <p className={styles.tipBox}>
          <strong>Pre-requisite:</strong> The backend entry file must exist on disk when the wizard runs. If your backend needs compiling first (TypeScript → JavaScript), either run <code className={styles.code}>npm run build</code> before uploading, or add a <code className={styles.code}>portal.json</code> manually — VibePort will compile TypeScript automatically when it finds a <code className={styles.code}>tsconfig.json</code>.
        </p>
      </div>

      {/* Environment variables */}
      <div className={styles.section}>
        <h2 className={styles.sectionTitle}>Environment variables</h2>
        <p className={styles.sectionDesc}>
          VibePort detects <code className={styles.code}>.env.example</code> files in your project (both at the root and alongside <code className={styles.code}>index.html</code>) and prompts you to fill in the values before going live.
        </p>
        <div className={styles.steps} style={{ flexDirection: 'column', gap: 12 }}>
          <div className={styles.faqItem}>
            <div className={styles.faqQ}>During upload (ZIP or GitHub import)</div>
            <div className={styles.faqA}>If a <code className={styles.code}>.env.example</code> is found, an env form appears in the deploy flow. Fill in the values and click "Set & go live." You can skip and set them later.</div>
          </div>
          <div className={styles.faqItem}>
            <div className={styles.faqQ}>After deploy</div>
            <div className={styles.faqA}>Use the API: <code className={styles.code}>POST /api/content/{'{id}'}/env</code> with a JSON body of key-value pairs. The values are written to the portal-data directory and injected into the PM2 process environment on next restart.</div>
          </div>
          <div className={styles.faqItem}>
            <div className={styles.faqQ}>Vite frontend env vars</div>
            <div className={styles.faqA}>
              Frontend env vars (prefixed <code className={styles.code}>VITE_</code>) are baked in at build time. Set them before running the build — they cannot be changed after.
              Backend env vars are injected at runtime and take effect on server restart.
            </div>
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
            { text: 'node_modules stripped automatically' },
            { text: 'Must contain an index.html' },
            { text: 'ZIP with 20k+ files triggers a directory filter step' },
          ]} />
        </div>

        <div className={styles.section}>
          <h2 className={styles.sectionTitle}>GitHub import</h2>
          <Checklist items={[
            { text: 'Public repos work without signing in' },
            { text: 'Private repos require GitHub sign-in', note: 'OAuth token used automatically' },
            { text: 'Repo ZIP must be under 200 MB' },
            { text: 'Enable "Build" for source repos', note: 'React, Vue, Vite, etc.' },
            { text: '.env.example and backend detection are automatic' },
            { text: 'Free tier: queued when storage is low' },
          ]} />
        </div>
      </div>

      {/* index.html selection */}
      <div className={styles.section}>
        <h2 className={styles.sectionTitle}>How VibePort picks your entry file</h2>
        <p className={styles.sectionDesc}>
          When a project has multiple <code className={styles.code}>index.html</code> files, VibePort selects one using this priority order:
        </p>
        <ol className={styles.orderedList}>
          <li><strong>portal.json nearby</strong> — the <code className={styles.code}>index.html</code> in the same directory as <code className={styles.code}>portal.json</code> wins</li>
          <li><strong>Source project root</strong> — <code className={styles.code}>index.html</code> at the root or one level deep alongside <code className={styles.code}>package.json</code> (not a built output)</li>
          <li><strong>Built output</strong> — an <code className={styles.code}>index.html</code> that references hashed assets (<code className={styles.code}>/assets/app-abc123.js</code>) or uses <code className={styles.code}>modulepreload</code></li>
          <li><strong>Build directory</strong> — inside <code className={styles.code}>dist/</code>, <code className={styles.code}>build/</code>, <code className={styles.code}>out/</code>, <code className={styles.code}>public/</code>, etc.</li>
          <li><strong>Shallowest depth</strong> — if all else is equal, the closest to the root wins</li>
        </ol>
        <p className={styles.tipBox}>
          <strong>If the wrong file is selected:</strong> ZIP only the directory you want to serve, or add a <code className={styles.code}>portal.json</code> file next to the correct <code className={styles.code}>index.html</code>.
        </p>
      </div>

      {/* Build option */}
      <div className={styles.section}>
        <h2 className={styles.sectionTitle}>Automatic builds (npm)</h2>
        <p className={styles.sectionDesc}>
          Enable "npm build" when uploading source code (React, Vue, Vite, etc.). VibePort runs{' '}
          <code className={styles.code}>npm install</code> then <code className={styles.code}>npm run build</code> on the server.
        </p>
        <Checklist items={[
          { text: 'package.json must be at the ZIP/repo root' },
          { text: 'A "build" script must exist in package.json' },
          { text: 'Output directory: dist/, build/, out/, or public/' },
          { text: 'Build timeout: 5 minutes' },
          { text: 'Build log shown after success or failure' },
          { text: 'Always test locally first: npm install && npm run build' },
        ]} />
      </div>

      {/* VIP links */}
      <div className={styles.section}>
        <h2 className={styles.sectionTitle}>VIP links</h2>
        <p className={styles.sectionDesc}>
          Every deployment gets a unique VIP link: <code className={styles.code}>https://1kuzz.org/vip/{'{share-token}'}</code>.
          Anyone with the link can view your app — no login required.
        </p>
        <div className={styles.sectionRow}>
          <Checklist items={[
            { text: 'Shareable with anyone — no account needed to view' },
            { text: 'Free tier: link expires after 24 hours' },
            { text: 'Pro tier: permanent links (no expiry)' },
            { text: 'Copy from Deploy page or from your deployments list' },
            { text: 'Backends remain accessible via the VIP link too' },
          ]} />
          <Checklist items={[
            { text: 'Re-upload replaces files but keeps the same link' },
            { text: 'Link becomes invalid when content is deleted' },
            { text: 'Free tier cleanup runs every 6 hours' },
            { text: 'Upgrade to Pro to make any link permanent' },
          ]} />
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
              { text: 'Backend configure wizard' },
              { text: 'Auto-provisioned PostgreSQL' },
            ]} />
          </div>
          <div>
            <p className={styles.tierLabel}>Pro — $7/mo</p>
            <Checklist items={[
              { text: 'Unlimited deployments' },
              { text: 'Permanent links (no expiry)' },
              { text: 'API access (deploy from Claude / CLI)' },
              { text: 'Instant deploy even when storage is low' },
              { text: 'All Free features' },
            ]} />
            <a href="mailto:pro@1kuzz.org?subject=VibePort Pro" className={styles.upgradeLink}>
              Upgrade to Pro →
            </a>
          </div>
        </div>
      </div>

      {/* API access */}
      <div className={styles.section}>
        <h2 className={styles.sectionTitle}>API deployment (Pro)</h2>
        <p className={styles.sectionDesc}>
          Generate an API token in{' '}
          <Link to="/settings" className={styles.inlineLink}>Settings</Link>{' '}
          and deploy from anywhere — a terminal, a Claude session, or a CI pipeline.
        </p>
        <pre className={styles.codeBlock}>{`# Deploy a ZIP
curl -X POST https://1kuzz.org/api/content \\
  -H "Authorization: Bearer tok_your_token" \\
  -F "archive=@./myapp.zip" \\
  -F "name=My App" \\
  -F "build=true"

# Import from GitHub
curl -X POST https://1kuzz.org/api/content/github \\
  -H "Authorization: Bearer tok_your_token" \\
  -H "Content-Type: application/json" \\
  -d '{"gitUrl":"https://github.com/you/repo","name":"My App","build":true}'

# Response: { "id": "...", "shareToken": "uuid", "envVarsRequired": ["KEY1", "KEY2"] }
# VIP link: https://1kuzz.org/vip/{shareToken}

# Set env vars after deploy
curl -X POST https://1kuzz.org/api/content/{id}/env \\
  -H "Authorization: Bearer tok_your_token" \\
  -H "Content-Type: application/json" \\
  -d '{"DATABASE_URL":"postgresql://...","SESSION_SECRET":"..."}'`}</pre>

        <p className={styles.subheading} style={{ marginTop: 0 }}>Deploy from a Claude session</p>
        <CopyPrompt
          label="Prompt for Claude (with your token)"
          text={`Deploy my project to VibePort using the API token tok_YOUR_TOKEN_HERE.

Steps:
1. ZIP the dist/ directory (or run npm run build first if it's a source project)
2. POST to https://1kuzz.org/api/content with the archive, name, and build=true if needed
3. If the response includes envVarsRequired, ask me for the values and POST them to /api/content/{id}/env
4. Return the VIP link: https://1kuzz.org/vip/{shareToken}`}
        />
      </div>

      {/* What works / what doesn't */}
      <div className={styles.sectionRow}>
        <div className={styles.section}>
          <h2 className={styles.sectionTitle}>What works</h2>
          <Checklist items={[
            { text: 'HTML + CSS + vanilla JavaScript' },
            { text: 'React, Vue, Svelte, Angular (built to static)' },
            { text: 'Scripts from CDNs', note: 'unpkg, jsDelivr, etc.' },
            { text: 'Google Fonts and external stylesheets' },
            { text: 'fetch() to external APIs' },
            { text: 'WebGL, Canvas, Web Audio API' },
            { text: 'LocalStorage and SessionStorage' },
            { text: 'Node.js backends via portal.json' },
            { text: 'WebSockets through portal.json backends' },
            { text: 'PostgreSQL via auto-provisioned DB' },
          ]} />
        </div>

        <div className={styles.section}>
          <h2 className={styles.sectionTitle}>What does not work</h2>
          <WarnList items={[
            'Server-side code without portal.json (Node.js, PHP, Python)',
            'Hardcoded localhost URLs — they won\'t resolve for other users',
            'Absolute asset paths (/assets/...) without a base URL set',
            'WebSockets to a custom server without portal.json',
            'Reading files from disk with the File System API',
            'Browser extensions or native app features',
            'Docker / docker-compose (use portal.json instead)',
            'Non-Node runtimes (Python, Go, Rust) as backends',
          ]} />
        </div>
      </div>

      {/* Common errors */}
      <div className={styles.section}>
        <h2 className={styles.sectionTitle}>Common errors</h2>
        <div className={styles.faqList}>
          <div className={styles.faqItem}>
            <div className={styles.faqQ}>App uploads but appears blank or broken</div>
            <div className={styles.faqA}>
              Open the browser console (F12 → Console) and look for 404 errors on assets.
              Paths like <code className={styles.code}>/assets/app.js</code> are absolute and won't resolve under a sub-path.
              Change them to <code className={styles.code}>./assets/app.js</code>, or use the "Fix paths" prompt above and re-deploy.
            </div>
          </div>

          <div className={styles.faqItem}>
            <div className={styles.faqQ}>No index.html found in the archive</div>
            <div className={styles.faqA}>
              You uploaded source code without building it first. Either run{' '}
              <code className={styles.code}>npm run build</code> locally and ZIP the output folder,
              or enable "npm build" during upload so VibePort builds it for you.
            </div>
          </div>

          <div className={styles.faqItem}>
            <div className={styles.faqQ}>Build failed</div>
            <div className={styles.faqA}>
              The full build log is shown after failure. Common causes: missing <code className={styles.code}>build</code> script
              in package.json, env vars required at build time (set them in the env form first),
              or a native dependency the build server doesn't support.
              Always verify <code className={styles.code}>npm install &amp;&amp; npm run build</code> succeeds locally.
            </div>
          </div>

          <div className={styles.faqItem}>
            <div className={styles.faqQ}>Backend not starting / "portal.json not found"</div>
            <div className={styles.faqA}>
              Make sure <code className={styles.code}>portal.json</code> is at the project root (same level as your top-level <code className={styles.code}>package.json</code>)
              and the <code className={styles.code}>entry</code> path points to an existing compiled <code className={styles.code}>.js</code> file.
              If no portal.json exists, use the configure-backend wizard that appears after import.
              Check PM2 logs if the process starts but crashes: <code className={styles.code}>pm2 logs portal-{'{id}'}</code>.
            </div>
          </div>

          <div className={styles.faqItem}>
            <div className={styles.faqQ}>API calls from frontend return 404</div>
            <div className={styles.faqA}>
              Your frontend must call <code className={styles.code}>{'{prefix}/api/endpoint'}</code> — not <code className={styles.code}>/api/endpoint</code>.
              The prefix is the value you set in <code className={styles.code}>portal.json</code> (e.g. <code className={styles.code}>/apps/my-project</code>).
              So API calls become: <code className={styles.code}>fetch('/apps/my-project/api/users')</code>.
              Set <code className={styles.code}>VITE_API_PREFIX=/apps/my-project</code> in .env and use it in your fetch calls.
            </div>
          </div>

          <div className={styles.faqItem}>
            <div className={styles.faqQ}>Link expired</div>
            <div className={styles.faqA}>
              Free tier links expire after 24 hours. Re-upload to get a new link,
              or <a href="mailto:pro@1kuzz.org?subject=VibePort Pro" className={styles.inlineLink}>upgrade to Pro</a> for permanent links.
            </div>
          </div>

          <div className={styles.faqItem}>
            <div className={styles.faqQ}>Storage is at capacity — deployment queued</div>
            <div className={styles.faqA}>
              Free tier deployments are queued when server storage is low. Your project will deploy automatically
              when space frees up (usually within 24 hours as other free-tier links expire).
              Pro users bypass the queue and always deploy instantly.
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
