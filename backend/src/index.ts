import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import path from 'path';
import rateLimit from 'express-rate-limit';
import session from 'express-session';
import connectPgSimple from 'connect-pg-simple';
import { pool, runMigrations } from './db/client';
import { logger } from './utils/logger';
import { requestTimeout } from './middleware/requestTimeout';
import type { AuthRequest } from './types';
import './types'; // load session type augmentation

import usageTrackerRouter from './routes/usageTracker';
import versionHistoryRouter from './routes/versionHistory';
import uploadedContentRouter from './routes/uploadedContent';
import promotedAppsRouter from './routes/promotedApps';
import appsRouter from './routes/apps';
import newsUpdatesRouter from './routes/newsUpdates';
import updatesRouter from './routes/updates';
import updateTagsRouter from './routes/updateTags';
import quickButtonsRouter from './routes/quickButtons';
import projectsRouter from './routes/projects';
import githubAuthRouter from './routes/githubAuth';
import githubProxyRouter from './routes/githubProxy';
import shareRouter from './routes/shareRouter';
import vipRouter from './routes/vipRouter';
import vipSessionRouter from './routes/vipSessionRouter';
import apiTokensRouter from './routes/apiTokens';
import uploadQueueRouter from './routes/uploadQueue';
import { startCleanupScheduler } from './services/contentCleanup';
import { createHash } from 'crypto';

if (
  process.env.NODE_ENV === 'production' &&
  (!process.env.SESSION_SECRET || process.env.SESSION_SECRET === 'dev-session-secret-change-in-production')
) {
  console.error('[FATAL] SESSION_SECRET must be set to a strong random value in production');
  process.exit(1);
}

const app = express();
app.set('trust proxy', 1);
const PORT = parseInt(process.env.PORT ?? '3001', 10);
const UPLOADS_DIR = process.env.UPLOADS_DIR ?? path.join(process.cwd(), 'uploads');

// ── Rate limiters ─────────────────────────────────────────────────────────────

const generalLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 300,
  standardHeaders: true,
  legacyHeaders: false,
});

// ── Middleware ────────────────────────────────────────────────────────────────

app.use(requestTimeout);

const PgStore = connectPgSimple(session);

const sessionStore = new PgStore({
  pool,
  tableName: 'session',
  createTableIfMissing: true,
  // Prune expired sessions every hour; errors are non-fatal
  pruneSessionInterval: 60 * 60,
  errorLog: (msg: string) => logger.warn('[session-store] ' + msg),
});

app.use(session({
  store: sessionStore,
  secret: process.env.SESSION_SECRET ?? 'dev-session-secret-change-in-production',
  resave: false,
  saveUninitialized: false,
  rolling: true,
  cookie: { httpOnly: true, sameSite: 'lax', secure: true, maxAge: 30 * 24 * 60 * 60 * 1000 },
}));

app.use(cors({
  origin: (origin, callback) => {
    const allowed = process.env.CORS_ORIGIN ?? '';
    if (!origin || allowed === '*' || allowed.split(',').map((s) => s.trim()).includes(origin)) {
      callback(null, true);
    } else {
      callback(new Error(`CORS policy: origin '${origin}' not allowed`));
    }
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
}));

app.use(express.json({ limit: '100mb' }));

// Populate req.authUser from session or API token Bearer header.
// tier and isAdmin are always re-read from DB so admin/tier changes take effect immediately.
app.use(async (req, _res, next) => {
  const githubUser = req.session?.githubUser;
  if (githubUser?.login) {
    try {
      const dbRow = await pool.query<{ is_admin: boolean; tier: string }>(
        `SELECT is_admin, tier FROM github_users WHERE login = $1`,
        [githubUser.login],
      );
      const isAdmin = dbRow.rows[0]?.is_admin ?? false;
      const tier = dbRow.rows[0]?.tier ?? 'free';
      // Keep session in sync so client-facing /api/auth/me reflects current values
      if (githubUser.isAdmin !== isAdmin || githubUser.tier !== tier) {
        req.session.githubUser = { ...githubUser, isAdmin, tier };
      }
      (req as unknown as AuthRequest).authUser = {
        login: githubUser.login,
        displayName: githubUser.name ?? githubUser.login,
        isAdmin,
        tier,
      };
    } catch {
      // DB unavailable — fall back to session values
      (req as unknown as AuthRequest).authUser = {
        login: githubUser.login,
        displayName: githubUser.name ?? githubUser.login,
        isAdmin: githubUser.isAdmin === true,
        tier: githubUser.tier ?? 'free',
      };
    }
    return next();
  }

  // API token auth: Bearer tok_xxx
  const bearer = req.headers.authorization;
  if (bearer?.startsWith('Bearer tok_')) {
    const raw = bearer.slice(7);
    const hash = createHash('sha256').update(raw).digest('hex');
    try {
      const tokRow = await pool.query<{ user_login: string; id: string }>(
        `SELECT id, user_login FROM api_tokens
         WHERE token_hash = $1 AND (expires_at IS NULL OR expires_at > NOW())`,
        [hash],
      );
      if (tokRow.rows.length > 0) {
        const { user_login, id } = tokRow.rows[0];
        const userRow = await pool.query<{ display_name: string; is_admin: boolean; tier: string }>(
          `SELECT display_name, is_admin, tier FROM github_users WHERE login = $1`,
          [user_login],
        );
        if (userRow.rows.length > 0) {
          const u = userRow.rows[0];
          (req as unknown as AuthRequest).authUser = {
            login: user_login,
            displayName: u.display_name,
            isAdmin: u.is_admin,
            tier: u.tier,
          };
          // fire-and-forget last_used_at update
          pool.query(`UPDATE api_tokens SET last_used_at = NOW() WHERE id = $1`, [id]).catch(() => {});
          return next();
        }
      }
    } catch { /* fall through to anonymous */ }
  }

  (req as unknown as AuthRequest).authUser = {
    login: 'anonymous',
    displayName: 'Anonymous',
    isAdmin: false,
    tier: 'free',
  };
  next();
});

app.use('/uploads', express.static(UPLOADS_DIR, {
  index: 'index.html',
  dotfiles: 'deny',
}));

// ── API routes ────────────────────────────────────────────────────────────────

app.use('/api/usage', generalLimiter, usageTrackerRouter);
app.use('/api/versions', generalLimiter, versionHistoryRouter);
app.use('/api/content', generalLimiter, uploadedContentRouter);
app.use('/api/promoted-apps', generalLimiter, promotedAppsRouter);
app.use('/api/apps', generalLimiter, appsRouter);
app.use('/api/news-updates', generalLimiter, newsUpdatesRouter);
app.use('/api/updates', generalLimiter, updatesRouter);
app.use('/api/update-tags', generalLimiter, updateTagsRouter);
app.use('/api/quick-buttons', generalLimiter, quickButtonsRouter);
app.use('/api/projects', generalLimiter, projectsRouter);
app.use('/api/auth', generalLimiter, githubAuthRouter);
app.use('/api/github', generalLimiter, githubProxyRouter);
app.use('/api/share', generalLimiter, shareRouter);
app.use('/vip',       generalLimiter, vipRouter);
app.use('/api/vs',    generalLimiter, vipSessionRouter);
app.use('/app',       generalLimiter, vipSessionRouter);
app.use('/api/tokens', generalLimiter, apiTokensRouter);
app.use('/api/queue',  generalLimiter, uploadQueueRouter);

// ── Health checks ─────────────────────────────────────────────────────────────

app.get('/api/health/live', (_req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

app.get('/api/health/ready', async (_req, res) => {
  const checks: Record<string, { status: string; detail?: string }> = {};

  try {
    const dbStart = Date.now();
    await pool.query('SELECT 1');
    checks.database = { status: 'ok', detail: `${Date.now() - dbStart}ms` };
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    checks.database = { status: 'fail', detail: message };
  }

  const mem = process.memoryUsage();
  const heapUsedMB = Math.round(mem.heapUsed / 1024 / 1024);
  const heapTotalMB = Math.round(mem.heapTotal / 1024 / 1024);
  checks.memory = {
    status: heapUsedMB / heapTotalMB < 0.95 ? 'ok' : 'warn',
    detail: `${heapUsedMB}/${heapTotalMB} MB`,
  };

  checks.dbPool = {
    status: pool.idleCount > 0 || pool.totalCount < pool.options.max! ? 'ok' : 'warn',
    detail: `total=${pool.totalCount} idle=${pool.idleCount} waiting=${pool.waitingCount}`,
  };

  const allOk = Object.values(checks).every((c) => c.status !== 'fail');
  res.status(allOk ? 200 : 503).json({
    status: allOk ? 'ok' : 'degraded',
    timestamp: new Date().toISOString(),
    checks,
  });
});

app.get('/health', (_req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

app.get('/api/health', async (_req, res) => {
  let dbOk = false;
  try {
    await pool.query('SELECT 1');
    dbOk = true;
  } catch {
    // DB check failed
  }
  const mem = process.memoryUsage();
  res.status(dbOk ? 200 : 503).json({
    status: dbOk ? 'ok' : 'degraded',
    timestamp: new Date().toISOString(),
    database: dbOk ? 'connected' : 'unreachable',
    uptime: Math.round(process.uptime()),
    memory: {
      heapUsedMB: Math.round(mem.heapUsed / 1024 / 1024),
      heapTotalMB: Math.round(mem.heapTotal / 1024 / 1024),
      rssMB: Math.round(mem.rss / 1024 / 1024),
    },
  });
});

app.use((_req, res) => {
  res.status(404).json({ error: 'Not found.' });
});

// ── Graceful shutdown ─────────────────────────────────────────────────────────

const SHUTDOWN_TIMEOUT_MS = parseInt(process.env.SHUTDOWN_TIMEOUT_MS ?? '10000', 10);

function setupGracefulShutdown(server: ReturnType<typeof app.listen>): void {
  let isShuttingDown = false;

  async function shutdown(signal: string): Promise<void> {
    if (isShuttingDown) return;
    isShuttingDown = true;
    logger.info(`[server] Received ${signal} — shutting down gracefully...`);

    const forceExit = setTimeout(() => {
      logger.error('[server] Graceful shutdown timed out — forcing exit.');
      process.exit(1);
    }, SHUTDOWN_TIMEOUT_MS);
    forceExit.unref();

    server.close(async () => {
      logger.info('[server] HTTP server closed.');
      try {
        await pool.end();
        logger.info('[server] Database pool closed.');
      } catch (err) {
        logger.error('[server] Error closing database pool', {
          error: err instanceof Error ? err.message : String(err),
        });
      }
      clearTimeout(forceExit);
      process.exit(0);
    });
  }

  process.on('SIGTERM', () => { void shutdown('SIGTERM'); });
  process.on('SIGINT', () => { void shutdown('SIGINT'); });
}

// ── Start ─────────────────────────────────────────────────────────────────────

/** Wait for PostgreSQL with exponential backoff — never fatal on transient errors. */
async function waitForDatabase(maxAttempts = 40): Promise<void> {
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      await pool.query('SELECT 1');
      return;
    } catch (err) {
      const delay = Math.min(1000 * Math.pow(1.4, attempt - 1), 30_000);
      logger.warn(`[server] DB not ready (attempt ${attempt}/${maxAttempts}), retrying in ${Math.round(delay / 1000)}s`, {
        error: err instanceof Error ? err.message : String(err),
      });
      await new Promise((r) => setTimeout(r, delay));
    }
  }
  throw new Error(`Database unavailable after ${maxAttempts} attempts`);
}

/** Log a memory snapshot — called periodically to catch leaks early. */
function logMemory(): void {
  const mem = process.memoryUsage();
  const heapMB = Math.round(mem.heapUsed / 1024 / 1024);
  const rssMB  = Math.round(mem.rss / 1024 / 1024);
  if (heapMB > 200) {
    logger.warn(`[server] High heap usage: ${heapMB} MB (RSS ${rssMB} MB)`);
  } else {
    logger.info(`[server] Memory OK: heap ${heapMB} MB / RSS ${rssMB} MB`);
  }
}

async function main(): Promise<void> {
  // ── Global unhandled error defence ─────────────────────────────────────────
  process.on('unhandledRejection', (reason: unknown) => {
    logger.error('[server] Unhandled promise rejection', {
      reason: reason instanceof Error ? reason.message : String(reason),
    });
    // Do NOT exit — let the process continue; PM2 will restart on real crashes
  });

  process.on('uncaughtException', (err: Error) => {
    logger.error('[server] Uncaught exception — shutting down', { error: err.message });
    // Exit so PM2 restarts cleanly (with backoff from ecosystem.config.cjs)
    process.exit(1);
  });

  // ── Database — wait instead of crashing immediately ─────────────────────────
  logger.info('[server] Connecting to database...');
  await waitForDatabase();
  logger.info('[server] Database connection OK.');
  await runMigrations();
  startCleanupScheduler();

  // ── HTTP server ─────────────────────────────────────────────────────────────
  const server = app.listen(PORT, () => {
    logger.info(`[server] Backend listening on port ${PORT}`);
  });

  setupGracefulShutdown(server);

  // ── Periodic memory logging (every 30 min) ──────────────────────────────────
  const memTimer = setInterval(logMemory, 30 * 60 * 1000);
  memTimer.unref(); // don't keep process alive just for this
}

main().catch((err: unknown) => {
  logger.error('[server] Fatal startup error — cannot recover, exiting', {
    error: err instanceof Error ? err.message : String(err),
  });
  process.exit(1);
});
