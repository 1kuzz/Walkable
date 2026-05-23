import { createContext, useContext } from 'react';

export interface User {
  displayName: string;
  avatar: string | null;
}

export interface UserContextValue {
  user: User;
}

export const ANONYMOUS_USER: User = {
  displayName: 'Anonymous',
  avatar: null,
};

export const UserContext = createContext<UserContextValue>({ user: ANONYMOUS_USER });

export function useUser(): UserContextValue {
  return useContext(UserContext);
}

export function getInitials(displayName: string): string {
  return displayName
    .split(' ')
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase() ?? '')
    .join('');
}
