import { useEffect, useState } from 'react';
import ProtectedRoute from './components/ProtectedRoute/ProtectedRoute';
import AdminDashboard from './pages/AdminDashboard/AdminDashboard';
import AdminUsersPage from './pages/AdminUsers/AdminUsersPage';
import ClientManagementPage from './pages/ClientManagement/ClientManagementPage';
import ClientPreviewPage from './pages/ClientPreview/ClientPreviewPage';
import LoginPage from './pages/Login/LoginPage';

function ForbiddenPage() {
  return <main className="access-denied"><div><span className="dashboard-kicker">ACCESS DENIED</span><h1>You do not have permission to view this page.</h1><a href="/login">Return to sign in</a></div></main>;
}

const routes = {
  '/login': LoginPage,
  '/workspace': () => <ProtectedRoute><AdminDashboard /></ProtectedRoute>,
  '/clients': () => <ProtectedRoute><><AdminDashboard /><ClientManagementPage modal /></></ProtectedRoute>,
  '/clients/preview': () => <ProtectedRoute><ClientPreviewPage /></ProtectedRoute>,
  '/admin': () => <ProtectedRoute><AdminDashboard /></ProtectedRoute>,
  '/admin/users': () => <ProtectedRoute adminOnly><AdminUsersPage /></ProtectedRoute>,
  '/member': () => <ProtectedRoute><AdminDashboard /></ProtectedRoute>,
  '/forbidden': ForbiddenPage,
};

function App() {
  const [pathname, setPathname] = useState(window.location.pathname);

  useEffect(() => {
    function syncRoute() {
      const nextPath = routes[window.location.pathname] ? window.location.pathname : '/login';

      if (window.location.pathname !== nextPath) {
        window.history.replaceState({}, '', nextPath);
      }

      setPathname(nextPath);
    }

    window.addEventListener('popstate', syncRoute);
    syncRoute();
    return () => window.removeEventListener('popstate', syncRoute);
  }, []);

  const Page = routes[pathname] || LoginPage;
  return <Page />;
}

export default App;
