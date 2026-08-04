import { useEffect } from 'react';
import { getKeycloak } from '../keycloak';

// Front-channel logout target: Keycloak calls this URL (configured as the client's
// Front-channel logout URL) when the session ends elsewhere — another app sharing the
// realm, or an admin action. See spec/KEYCLOAK_SSO.md §3.
export function LogoutCallback() {
  useEffect(() => {
    getKeycloak().clearToken();
    window.location.replace('/');
  }, []);

  return <div className="page">Signing out&hellip;</div>;
}
