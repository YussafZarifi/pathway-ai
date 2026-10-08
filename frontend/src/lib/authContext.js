import { createContext, useContext } from "react";

// Filled by components/AuthProvider.jsx. The default is the signed-out,
// auth-off state, so a component outside the provider still renders.
export const AuthContext = createContext({
  enabled: false,
  loading: false,
  session: null,
  user: null,
  recovery: false,
  endRecovery: () => {},
});

/** { enabled, loading, session, user, recovery, endRecovery } for the current visitor. */
export function useAuth() {
  return useContext(AuthContext);
}
