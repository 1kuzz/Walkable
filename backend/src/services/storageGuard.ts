/**
 * Storage guard: checks available disk space and classifies requests as
 * OK, QUEUE (free-tier gets queued), or BLOCKED (critically low — everyone waits).
 *
 * Thresholds (configurable via env vars):
 *   STORAGE_CRITICAL_MB  default 400  — block all uploads
 *   STORAGE_LOW_MB       default 900  — queue free-tier, allow pro
 */

import * as fs from 'fs';
import { logger } from '../utils/logger';

const UPLOADS_PATH = process.env.UPLOADS_DIR ?? '/';
const CRITICAL_MB  = parseInt(process.env.STORAGE_CRITICAL_MB ?? '400', 10);
const LOW_MB       = parseInt(process.env.STORAGE_LOW_MB       ?? '900', 10);

export type StorageStatus = 'ok' | 'low' | 'critical';

export interface StorageInfo {
  status: StorageStatus;
  freeMB: number;
  totalMB: number;
  percentUsed: number;
}

export function getStorageInfo(): StorageInfo {
  try {
    const s = fs.statfsSync(UPLOADS_PATH);
    const freeMB  = Math.floor((s.bfree  * s.bsize) / 1024 / 1024);
    const totalMB = Math.floor((s.blocks * s.bsize) / 1024 / 1024);
    const percentUsed = Math.round(((totalMB - freeMB) / totalMB) * 100);

    let status: StorageStatus = 'ok';
    if (freeMB < CRITICAL_MB) status = 'critical';
    else if (freeMB < LOW_MB)  status = 'low';

    return { status, freeMB, totalMB, percentUsed };
  } catch (err) {
    logger.error('[storage] statfs failed — assuming low', { error: String(err) });
    return { status: 'low', freeMB: 0, totalMB: 0, percentUsed: 100 };
  }
}

/** Returns true if this upload should be allowed to proceed immediately. */
export function canUploadNow(tier: string, isAdmin: boolean): boolean {
  const { status } = getStorageInfo();
  if (status === 'critical') return false;
  if (status === 'low') return isAdmin || tier === 'pro';
  return true;
}

/** Express middleware — rejects or queues based on storage status and tier. */
export function storageCheck(mode: 'reject' | 'info' = 'reject') {
  return (_req: unknown, res: { status: (n: number) => { json: (b: unknown) => void } }, next: () => void): void => {
    const info = getStorageInfo();
    if (mode === 'info') return next();

    const req = _req as { authUser?: { tier?: string; isAdmin?: boolean; login?: string } };
    const tier    = req.authUser?.tier    ?? 'free';
    const isAdmin = req.authUser?.isAdmin ?? false;

    if (info.status === 'critical') {
      res.status(507).json({
        error: 'Server storage is critically full. New deployments are temporarily suspended.',
        storageStatus: 'critical',
        freeMB: info.freeMB,
      });
      return;
    }

    if (info.status === 'low' && !isAdmin && tier !== 'pro') {
      res.status(507).json({
        error: 'Storage is currently at capacity for free accounts.',
        storageStatus: 'low',
        freeMB: info.freeMB,
        queued: true,
        upgradeUrl: '/settings#pro',
      });
      return;
    }

    next();
  };
}
