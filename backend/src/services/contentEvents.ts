import EventEmitter from 'events';

/**
 * In-process event bus for content lifecycle events.
 * Lets route handlers signal each other without circular imports.
 *
 * Events:
 *   'archive:replaced' (contentId: string) — files replaced via PUT /:id/archive
 *   'content:deleted'  (contentId: string) — row deleted via DELETE /:id
 */
export const contentEvents = new EventEmitter();
