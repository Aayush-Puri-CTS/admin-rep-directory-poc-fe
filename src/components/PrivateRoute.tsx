import { Outlet } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth';
import { LandingPage } from '../pages/LandingPage';

/** Route guard: only checks authentication, not roles — see spec/KEYCLOAK_SSO.md "Known gaps". */
export function PrivateRoute() {
  const { initialized, isAuthenticated } = useAuth();

  if (!initialized) return <div className="page">Checking session&hellip;</div>;
  if (!isAuthenticated) return <LandingPage />;

  return <Outlet />;
}
