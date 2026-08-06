import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { Layout } from './Layout';
import { useAuth } from '../hooks/useAuth';
import { useTenant } from '../context/TenantContext';

// Layout composes AuthButtons (Keycloak-backed) and TenantBadge (tenant-context-backed) —
// mock both hooks rather than exercising real Keycloak/tenant resolution (no-live-data).
vi.mock('../hooks/useAuth');
vi.mock('../context/TenantContext');

type UseAuthReturn = ReturnType<typeof useAuth>;
type UseTenantReturn = ReturnType<typeof useTenant>;

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

function makeTenantState(overrides: Partial<UseTenantReturn> = {}): UseTenantReturn {
  return {
    tenantId: 'acme',
    brand: 'Acme Health',
    keycloak: { url: 'https://example.invalid/auth', realm: 'acme', clientId: 'admin-poc-fe' },
    ...overrides,
  };
}

function renderLayout() {
  return render(
    <MemoryRouter initialEntries={['/']}>
      <Routes>
        <Route path="/" element={<Layout />}>
          <Route index element={<div>Directory content</div>} />
          <Route path="reps/new" element={<div>Create rep content</div>} />
        </Route>
      </Routes>
    </MemoryRouter>,
  );
}

describe('Layout', () => {
  beforeEach(() => {
    vi.mocked(useAuth).mockReset();
    vi.mocked(useTenant).mockReset();
    vi.mocked(useTenant).mockReturnValue(makeTenantState());
  });

  it('hides navigation and the tenant badge when unauthenticated', () => {
    vi.mocked(useAuth).mockReturnValue(makeAuthState({ isAuthenticated: false }));

    renderLayout();

    expect(screen.queryByRole('navigation')).not.toBeInTheDocument();
    expect(screen.queryByText('Acme Health')).not.toBeInTheDocument();
    expect(screen.getByText('Directory content')).toBeInTheDocument();
  });

  it('shows navigation links and the tenant badge when authenticated', () => {
    vi.mocked(useAuth).mockReturnValue(
      makeAuthState({ isAuthenticated: true, username: 'jane.doe' }),
    );

    renderLayout();

    expect(screen.getByRole('link', { name: 'Directory' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Create Rep' })).toBeInTheDocument();
    expect(screen.getByText('Acme Health')).toBeInTheDocument();
    expect(screen.getByText('jane.doe')).toBeInTheDocument();
  });

  it('renders the routed child (Outlet) content', () => {
    vi.mocked(useAuth).mockReturnValue(makeAuthState({ isAuthenticated: true }));

    renderLayout();

    expect(screen.getByText('Directory content')).toBeInTheDocument();
  });
});
