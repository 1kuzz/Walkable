/** Wraps async API calls and re-throws on failure. */
export async function withApiErrorLogging<T>(
  fn: () => Promise<T>,
  _context: string,
  _user = 'unknown',
): Promise<T> {
  return fn();
}
