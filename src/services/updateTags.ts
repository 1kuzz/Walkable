import { useState, useEffect } from 'react';
import { apiFetch } from '../api/apiClient';

export interface UpdateTag {
  id: string;
  label: string;
  color: string;
  createdBy: string;
}

/** 16-color preset palette */
export const TAG_COLORS: Record<string, { hex: string; name: string }> = {
  teal:    { hex: '#29ccb1', name: 'Teal' },
  green:   { hex: '#22c55e', name: 'Green' },
  emerald: { hex: '#10b981', name: 'Emerald' },
  cyan:    { hex: '#06b6d4', name: 'Cyan' },
  sky:     { hex: '#0ea5e9', name: 'Sky' },
  blue:    { hex: '#3b82f6', name: 'Blue' },
  indigo:  { hex: '#6366f1', name: 'Indigo' },
  violet:  { hex: '#8b5cf6', name: 'Violet' },
  purple:  { hex: '#a855f7', name: 'Purple' },
  pink:    { hex: '#ec4899', name: 'Pink' },
  rose:    { hex: '#f43f5e', name: 'Rose' },
  red:     { hex: '#ef4444', name: 'Red' },
  orange:  { hex: '#f97316', name: 'Orange' },
  amber:   { hex: '#f59e0b', name: 'Amber' },
  yellow:  { hex: '#eab308', name: 'Yellow' },
  slate:   { hex: '#64748b', name: 'Slate' },
};

export function colorHex(color: string): string {
  return TAG_COLORS[color]?.hex ?? '#64748b';
}

/** rgba(hex, alpha) helper for chip styles */
export function hexRgba(hex: string, alpha: number): string {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return `rgba(${r},${g},${b},${alpha})`;
}

export function generateTagId(): string {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) return `tag_${crypto.randomUUID()}`;
  return `tag_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
}

export async function getUpdateTags(): Promise<UpdateTag[]> {
  return apiFetch<UpdateTag[]>('/api/update-tags');
}

export async function createUpdateTag(tag: Omit<UpdateTag, 'createdBy'>): Promise<void> {
  await apiFetch<{ id: string }>('/api/update-tags', {
    method: 'POST',
    body: JSON.stringify(tag),
  });
}

export async function editUpdateTag(id: string, fields: Pick<UpdateTag, 'label' | 'color'>): Promise<void> {
  await apiFetch<{ success: boolean }>(`/api/update-tags/${id}`, {
    method: 'PUT',
    body: JSON.stringify(fields),
  });
}

export async function deleteUpdateTag(id: string): Promise<void> {
  await apiFetch<{ success: boolean }>(`/api/update-tags/${id}`, { method: 'DELETE' });
}

export function useUpdateTags(): { tags: UpdateTag[]; reload: () => void } {
  const [tags, setTags] = useState<UpdateTag[]>([]);
  const [tick, setTick] = useState(0);

  useEffect(() => {
    let cancelled = false;
    getUpdateTags().then((d) => { if (!cancelled) setTags(d); }).catch(() => {});
    return () => { cancelled = true; };
  }, [tick]);

  return { tags, reload: () => setTick((t) => t + 1) };
}
