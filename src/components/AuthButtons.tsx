import { useAuth } from '../hooks/useAuth';

export function AuthButtons() {
  const { initialized, isAuthenticated, username, login, register, logout } = useAuth();

  if (!initialized) {
    return <span className="muted">Checking session&hellip;</span>;
  }

  if (!isAuthenticated) {
    return (
      <div className="auth-buttons">
        <button type="button" className="button--ghost" onClick={register}>
          Register
        </button>
        <button type="button" className="button button--primary" onClick={login}>
          Login
        </button>
      </div>
    );
  }

  return (
    <div className="auth-buttons">
      <span className="muted">{username}</span>
      <button type="button" onClick={logout}>
        Logout
      </button>
    </div>
  );
}
