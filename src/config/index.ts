// Application configuration — all real values must come from environment variables.
// Copy .env.example to .env and fill in your values.

export const config = {
  appVersion: import.meta.env.VITE_APP_VERSION ?? 'dev',
};
