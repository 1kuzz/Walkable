import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import { getMe, logout as apiLogout, startGitHubLogin, type GitHubUser } from '../api/authClient';

interface AuthContextValue {
  user: GitHubUser | null;
  loading: boolean;
  login: () => void;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue>({
  user: null,
  loading: true,
  login: startGitHubLogin,
  logout: async () => {},
});

export function GitHubAuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<GitHubUser | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // Strip ?auth= param left by OAuth callback redirect
    const url = new URL(window.location.href);
    if (url.searchParams.has('auth')) {
      url.searchParams.delete('auth');
      window.history.replaceState({}, '', url.toString());
    }

    getMe().then(setUser).catch(() => setUser(null)).finally(() => setLoading(false));
  }, []);

  const logout = async () => {
    await apiLogout();
    setUser(null);
  };

  return (
    <AuthContext.Provider value={{ user, loading, login: startGitHubLogin, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useGitHubAuth() {
  return useContext(AuthContext);
}
