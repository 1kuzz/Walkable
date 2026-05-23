/** Wraps async API calls and re-throws on failure. */
export async function withApiErrorLogging<T>(
  fn: () => Promise<T>,
  _context: string,
): Promise<T> {
  return fn();
}
