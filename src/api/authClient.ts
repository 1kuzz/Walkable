import { apiFetch } from './apiClient';

export interface GitHubUser {
  login: string;
  avatar_url: string;
  name: string | null;
  isAdmin?: boolean;
}

export function getMe(): Promise<GitHubUser | null> {
  return apiFetch<GitHubUser | null>('/api/auth/me');
}

export function logout(): Promise<void> {
  return apiFetch<void>('/api/auth/logout', { method: 'POST' });
}

export function startGitHubLogin(): void {
  window.location.href = '/api/auth/github';
}
