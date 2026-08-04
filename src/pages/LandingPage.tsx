import { useAuth } from '../hooks/useAuth';

export function LandingPage() {
  const { login } = useAuth();

  return (
    <div className="page landing">
      <h1>Rep Directory</h1>
      <p className="muted">Sign in with your Corenroll SSO account to manage Reps.</p>
      <button type="button" className="button button--primary" onClick={login}>
        Login
      </button>
    </div>
  );
}
