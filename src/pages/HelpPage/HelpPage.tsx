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
        <h1 className={styles.pageTitle}>Upload Guide</h1>
        <p className={styles.pageSubtitle}>
          Requirements and checklist for submitting projects to the showcase.
        </p>
      </div>

      {/* How it works */}
      <div className={styles.section}>
        <h2 className={styles.sectionTitle}>How it works</h2>
        <div className={styles.steps}>
          <div className={styles.step}>
            <span className={styles.stepNum}>1</span>
            <div>
              <div className={styles.stepLabel}>Upload</div>
              <div className={styles.stepDesc}>ZIP archive or import directly from a GitHub repo. Your project is saved as a private draft.</div>
            </div>
          </div>
          <div className={styles.stepArrow}>→</div>
          <div className={styles.step}>
            <span className={styles.stepNum}>2</span>
            <div>
              <div className={styles.stepLabel}>Submit for review</div>
              <div className={styles.stepDesc}>Preview it first, then submit. An admin will approve or reject with feedback.</div>
            </div>
          </div>
          <div className={styles.stepArrow}>→</div>
          <div className={styles.step}>
            <span className={styles.stepNum}>3</span>
            <div>
              <div className={styles.stepLabel}>Goes live</div>
              <div className={styles.stepDesc}>Approved projects appear in the public gallery for everyone to try.</div>
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
            { text: 'Max number of files: 5,000' },
            { text: 'Must contain an index.html or index.htm', note: 'shallowest one is used as entry' },
            { text: '.git folders are stripped automatically' },
            { text: 'Other dot files (.gitignore, .env) are fine' },
          ]} />
        </div>

        <div className={styles.section}>
          <h2 className={styles.sectionTitle}>GitHub import</h2>
          <Checklist items={[
            { text: 'Public repos work without signing in' },
            { text: 'Private repos require GitHub sign-in', note: 'OAuth token is used automatically' },
            { text: 'Repo ZIP must be under 200 MB' },
            { text: 'Same index.html requirement applies' },
            { text: 'Enable "Build this project" for source repos', note: 'see build requirements below' },
          ]} />
        </div>

      </div>

      {/* Build option */}
      <div className={styles.section}>
        <h2 className={styles.sectionTitle}>Server-side build (optional)</h2>
        <p className={styles.sectionDesc}>
          Enable "Build this project" when uploading a source repo (React, Vue, Vite, etc.) that needs
          to be compiled before it can run. The server runs <code className={styles.code}>npm install</code> and{' '}
          <code className={styles.code}>npm run build</code> for you.
        </p>
        <Checklist items={[
          { text: 'package.json must be at the root of the ZIP / repo' },
          { text: 'A "build" script must be defined in package.json' },
          { text: 'Build output must go to dist/, build/, out/, or public/' },
          { text: 'Build output must include an index.html' },
          { text: 'Build must complete within 5 minutes' },
          { text: 'Test locally first: npm install && npm run build should succeed' },
        ]} />
        <p className={styles.tipBox}>
          <strong>Tip:</strong> If your build needs environment variables, hard-code a safe default or
          use <code className={styles.code}>import.meta.env.VITE_*</code> with a fallback —
          the build server has no access to your <code className={styles.code}>.env</code> file.
        </p>
      </div>

      {/* What works / what doesn't */}
      <div className={styles.sectionRow}>

        <div className={styles.section}>
          <h2 className={styles.sectionTitle}>What works</h2>
          <Checklist items={[
            { text: 'HTML + CSS + vanilla JavaScript' },
            { text: 'React / Vue / Svelte (built to static files)' },
            { text: 'Scripts from CDNs', note: 'unpkg, jsDelivr, cdnjs, etc.' },
            { text: 'Google Fonts and other external stylesheets' },
            { text: 'fetch() and XHR to external APIs' },
            { text: 'WebGL, Canvas, Web Audio API' },
            { text: 'Relative asset paths (./images/bg.png)' },
            { text: 'LocalStorage and SessionStorage' },
          ]} />
        </div>

        <div className={styles.section}>
          <h2 className={styles.sectionTitle}>What does not work</h2>
          <WarnList items={[
            'Server-side code (Node.js, PHP, Python, etc.) — static files only',
            'Hardcoded localhost URLs — they won\'t resolve for other users',
            'Projects that require a running backend or database',
            'WebSockets to a custom server (public WebSocket APIs are fine)',
            'Reading files from disk with the File System API in production',
            'Browser extensions or native app features',
          ]} />
        </div>

      </div>

      {/* Pre-upload checklist */}
      <div className={styles.section}>
        <h2 className={styles.sectionTitle}>Pre-upload checklist</h2>
        <p className={styles.sectionDesc}>Run through this before hitting Upload to avoid common rejections.</p>
        <Checklist items={[
          { text: 'Open index.html locally in a browser — the app loads and works' },
          { text: 'All asset paths are relative, not absolute', note: 'use ./style.css not /style.css' },
          { text: 'No hardcoded localhost or 127.0.0.1 URLs anywhere' },
          { text: 'External resources (CDN scripts, fonts) load over HTTPS, not HTTP' },
          { text: 'If built: npm run build succeeds with no errors locally' },
          { text: 'ZIP contains the built output, not just source files', note: 'unless using the Build option' },
          { text: 'Project has a clear name and description ready' },
          { text: 'A screenshot or thumbnail is prepared (optional, but helps)' },
        ]} />
      </div>

      {/* Common errors */}
      <div className={styles.section}>
        <h2 className={styles.sectionTitle}>Common errors</h2>
        <div className={styles.faqList}>

          <div className={styles.faqItem}>
            <div className={styles.faqQ}>App uploads but appears blank in the preview</div>
            <div className={styles.faqA}>
              Open the browser developer console (F12 → Console) while the preview is open.
              Look for 404 errors on assets — this usually means paths like <code className={styles.code}>/assets/app.js</code> are
              absolute and won't resolve. Change them to <code className={styles.code}>./assets/app.js</code> and re-upload.
            </div>
          </div>

          <div className={styles.faqItem}>
            <div className={styles.faqQ}>No index.html found in the archive</div>
            <div className={styles.faqA}>
              You uploaded source code without building it first. Either run{' '}
              <code className={styles.code}>npm run build</code> locally and ZIP the output folder,
              or enable "Build this project" in the GitHub import tab.
            </div>
          </div>

          <div className={styles.faqItem}>
            <div className={styles.faqQ}>Build failed</div>
            <div className={styles.faqA}>
              The build log is shown after a failed upload — read it carefully. The most common causes are:
              missing <code className={styles.code}>build</code> script in package.json, required environment
              variables not present, or a dependency that needs a native binary the server doesn't have.
              Always verify <code className={styles.code}>npm install &amp;&amp; npm run build</code> works
              on your own machine first.
            </div>
          </div>

          <div className={styles.faqItem}>
            <div className={styles.faqQ}>Build output not found after a successful build</div>
            <div className={styles.faqA}>
              The server looks for output in <code className={styles.code}>dist/</code>,{' '}
              <code className={styles.code}>build/</code>, <code className={styles.code}>out/</code>, or{' '}
              <code className={styles.code}>public/</code>. If your project outputs elsewhere, set the output
              directory in your build config (e.g., <code className={styles.code}>vite.config.js → build.outDir</code>)
              to one of those names.
            </div>
          </div>

          <div className={styles.faqItem}>
            <div className={styles.faqQ}>Project was rejected — what now?</div>
            <div className={styles.faqA}>
              The review note explains why. You can delete the rejected project, fix the issue, re-upload
              and submit again. There is no limit on resubmissions.
            </div>
          </div>

        </div>
      </div>

      <div className={styles.footer}>
        Ready?{' '}
        <Link to="/my-projects" className={styles.footerLink}>
          Go to My Projects to upload →
        </Link>
      </div>
    </div>
  );
}
