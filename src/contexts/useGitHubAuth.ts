import { createContext, useContext } from 'react';
import { startGitHubLogin, type GitHubUser } from '../api/authClient';

export interface AuthContextValue {
  user: GitHubUser | null;
  loading: boolean;
  login: () => void;
  logout: () => Promise<void>;
}

export const AuthContext = createContext<AuthContextValue>({
  user: null,
  loading: true,
  login: startGitHubLogin,
  logout: async () => {},
});

export function useGitHubAuth() {
  return useContext(AuthContext);
}
