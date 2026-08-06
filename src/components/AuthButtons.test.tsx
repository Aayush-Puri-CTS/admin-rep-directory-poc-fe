import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { AuthButtons } from './AuthButtons';
import { useAuth } from '../hooks/useAuth';

// Mock the Keycloak-backed auth hook rather than exercising real Keycloak —
// see docs/specs/component-tests-ui.md "Scope Notes" (no-live-data).
vi.mock('../hooks/useAuth');

type UseAuthReturn = ReturnType<typeof useAuth>;

function makeAuthState(overrides: Partial<UseAuthReturn> = {}): UseAuthReturn {
  return {
    initialized: true,
    isAuthenticated: false,
    username: undefined,
    email: undefined,
    persona: undefined,
    partyId: undefined,
    allowedApps: undefined,
    roles: [],
    hasRole: vi.fn(() => false),
    hasAnyRole: vi.fn(() => false),
    hasResourceRole: vi.fn(() => false),
    login: vi.fn(),
    register: vi.fn(),
    logout: vi.fn(),
    ...overrides,
  };
}

describe('AuthButtons', () => {
  beforeEach(() => {
    vi.mocked(useAuth).mockReset();
  });

  it('renders a checking-session placeholder while auth is not yet initialized', () => {
    vi.mocked(useAuth).mockReturnValue(makeAuthState({ initialized: false }));

    render(<AuthButtons />);

    expect(screen.getByText(/Checking session/)).toBeInTheDocument();
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
  });

  it('renders Register and Login buttons when unauthenticated', async () => {
    const login = vi.fn();
    const register = vi.fn();
    vi.mocked(useAuth).mockReturnValue(
      makeAuthState({ initialized: true, isAuthenticated: false, login, register }),
    );

    const user = userEvent.setup();
    render(<AuthButtons />);

    const registerButton = screen.getByRole('button', { name: 'Register' });
    const loginButton = screen.getByRole('button', { name: 'Login' });
    expect(registerButton).toBeInTheDocument();
    expect(loginButton).toBeInTheDocument();

    await user.click(registerButton);
    expect(register).toHaveBeenCalledTimes(1);

    await user.click(loginButton);
    expect(login).toHaveBeenCalledTimes(1);
  });

  it('renders the username and a working Logout button when authenticated', async () => {
    const logout = vi.fn();
    vi.mocked(useAuth).mockReturnValue(
      makeAuthState({ initialized: true, isAuthenticated: true, username: 'jane.doe', logout }),
    );

    const user = userEvent.setup();
    render(<AuthButtons />);

    expect(screen.getByText('jane.doe')).toBeInTheDocument();
    const logoutButton = screen.getByRole('button', { name: 'Logout' });

    await user.click(logoutButton);
    expect(logout).toHaveBeenCalledTimes(1);
  });
});
