import React from 'react';
import { UserContext, ANONYMOUS_USER } from './useUser';

export function UserProvider({ children }: { children: React.ReactNode }) {
  return (
    <UserContext.Provider value={{ user: ANONYMOUS_USER }}>
      {children}
    </UserContext.Provider>
  );
}
