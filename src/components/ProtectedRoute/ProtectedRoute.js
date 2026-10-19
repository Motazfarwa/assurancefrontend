import { useEffect } from 'react';
import { useAuth } from '../../auth/AuthContext';

export default function ProtectedRoute({ allowedRole, adminOnly, children }) {
  const { user, isLoading } = useAuth();
  const isAllowed = user && (!allowedRole || user.role === allowedRole) && (!adminOnly || user.isAdmin);

  useEffect(() => {
    if (!isLoading && !user) {
      window.history.replaceState({}, '', '/login');
      window.dispatchEvent(new PopStateEvent('popstate'));
    } else if (!isLoading && user && !isAllowed) {
      window.history.replaceState({}, '', '/forbidden');
      window.dispatchEvent(new PopStateEvent('popstate'));
    }
  }, [isAllowed, isLoading, user]);

  if (isLoading) return <main className="auth-loading" aria-live="polite">Verification de votre session...</main>;
  if (!isAllowed) return null;
  return children;
}
