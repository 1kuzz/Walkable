import { apiFetch } from './apiClient';

export interface Project {
  id: string;
  github_url: string;
  name: string;
  description: string;
  language: string | null;
  stars: number;
  owner_login: string | null;
  owner_avatar_url: string | null;
  submitted_at: string;
  approved: boolean;
  github_synced_at: string | null;
  views: number;
}

export interface ProjectSummary {
  totalProjects: number;
  topByViews: Pick<Project, 'id' | 'name' | 'owner_login' | 'views'>[];
  topByStars: Pick<Project, 'id' | 'name' | 'owner_login' | 'stars'>[];
}

export function listProjects(): Promise<Project[]> {
  return apiFetch<Project[]>('/api/projects');
}

export function getProject(id: string): Promise<Project> {
  return apiFetch<Project>(`/api/projects/${id}`);
}

export function submitProject(github_url: string): Promise<Project> {
  return apiFetch<Project>('/api/projects', {
    method: 'POST',
    body: JSON.stringify({ github_url }),
  });
}

export function incrementView(id: string): Promise<void> {
  return apiFetch<void>(`/api/projects/${id}/view`, { method: 'POST' });
}

export function getProjectStats(): Promise<ProjectSummary> {
  return apiFetch<ProjectSummary>('/api/projects/stats/summary');
}

export function getPendingProjects(adminPassword: string): Promise<Project[]> {
  return apiFetch<Project[]>('/api/projects/pending', {
    headers: { Authorization: `Bearer ${adminPassword}` },
  });
}

export function setProjectApproved(id: string, approved: boolean, adminPassword: string): Promise<Project> {
  return apiFetch<Project>(`/api/projects/${id}`, {
    method: 'PATCH',
    headers: { Authorization: `Bearer ${adminPassword}` },
    body: JSON.stringify({ approved }),
  });
}
