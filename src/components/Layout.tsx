import { NavLink, Outlet } from 'react-router-dom';
import { TenantBadge } from './TenantBadge';
import { AuthButtons } from './AuthButtons';
import { useAuth } from '../hooks/useAuth';

export function Layout() {
  const { isAuthenticated } = useAuth();

  return (
    <div className="app-shell">
      <header className="app-header">
        <div className="app-header__brand">
          <span className="app-header__title">Rep Directory</span>
          {isAuthenticated && (
            <nav className="app-header__nav">
              <NavLink to="/" end>
                Directory
              </NavLink>
              <NavLink to="/reps/new">Create Rep</NavLink>
            </nav>
          )}
        </div>
        <div className="app-header__actions">
          {isAuthenticated && <TenantBadge />}
          <AuthButtons />
        </div>
      </header>
      <main className="app-main">
        <Outlet />
      </main>
    </div>
  );
}
