/** Shared TypeScript types used across the backend. */

declare module 'express-session' {
  interface SessionData {
    githubToken?: string;
    githubUser?: { login: string; avatar_url: string; name: string | null; isAdmin?: boolean; tier?: string };
  }
}

export interface AuthenticatedUser {
  login: string;
  displayName: string;
  isAdmin: boolean;
  tier: string;
}

/** Express Request extended with the decoded user. */
import type { Request } from 'express';

export interface AuthRequest extends Request {
  authUser: AuthenticatedUser;
}
