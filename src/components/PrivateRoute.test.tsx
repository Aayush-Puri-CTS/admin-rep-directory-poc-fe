import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { PrivateRoute } from './PrivateRoute';
import { useAuth } from '../hooks/useAuth';

// PrivateRoute (and the LandingPage it falls back to) both read Keycloak state through
// useAuth — mock it rather than exercising real Keycloak (no-live-data).
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

function renderPrivateRoute() {
  return render(
    <MemoryRouter initialEntries={['/']}>
      <Routes>
        <Route path="/" element={<PrivateRoute />}>
          <Route index element={<div>Protected content</div>} />
        </Route>
      </Routes>
    </MemoryRouter>,
  );
}

describe('PrivateRoute', () => {
  beforeEach(() => {
    vi.mocked(useAuth).mockReset();
  });

  it('shows a checking-session message while auth is not yet initialized', () => {
    vi.mocked(useAuth).mockReturnValue(makeAuthState({ initialized: false }));

    renderPrivateRoute();

    expect(screen.getByText(/Checking session/)).toBeInTheDocument();
    expect(screen.queryByText('Protected content')).not.toBeInTheDocument();
  });

  it('renders the landing page instead of the outlet when unauthenticated', () => {
    vi.mocked(useAuth).mockReturnValue(
      makeAuthState({ initialized: true, isAuthenticated: false }),
    );

    renderPrivateRoute();

    expect(screen.getByRole('heading', { name: 'Rep Directory' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Login' })).toBeInTheDocument();
    expect(screen.queryByText('Protected content')).not.toBeInTheDocument();
  });

  it('renders the nested outlet route when authenticated', () => {
    vi.mocked(useAuth).mockReturnValue(
      makeAuthState({ initialized: true, isAuthenticated: true }),
    );

    renderPrivateRoute();

    expect(screen.getByText('Protected content')).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'Rep Directory' })).not.toBeInTheDocument();
  });
});
