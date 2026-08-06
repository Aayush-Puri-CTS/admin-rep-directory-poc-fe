import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { TenantBadge } from './TenantBadge';
import { useTenant } from '../context/TenantContext';

// TenantBadge is read-only and reads from tenant context (resolved from the hostname in the
// real app) — mock the hook rather than exercising the real tenant-resolution flow
// (no-live-data).
vi.mock('../context/TenantContext');

type UseTenantReturn = ReturnType<typeof useTenant>;

function makeTenantState(overrides: Partial<UseTenantReturn> = {}): UseTenantReturn {
  return {
    tenantId: 'acme',
    brand: 'Acme Health',
    keycloak: { url: 'https://example.invalid/auth', realm: 'acme', clientId: 'admin-poc-fe' },
    ...overrides,
  };
}

describe('TenantBadge', () => {
  beforeEach(() => {
    vi.mocked(useTenant).mockReset();
  });

  it('renders the resolved tenant brand from context', () => {
    vi.mocked(useTenant).mockReturnValue(makeTenantState({ brand: 'Acme Health' }));

    render(<TenantBadge />);

    expect(screen.getByText('Acme Health')).toBeInTheDocument();
  });

  it('re-renders with a different brand for a different tenant', () => {
    vi.mocked(useTenant).mockReturnValue(makeTenantState({ brand: 'Other Tenant Co' }));

    render(<TenantBadge />);

    expect(screen.getByText('Other Tenant Co')).toBeInTheDocument();
    expect(screen.queryByText('Acme Health')).not.toBeInTheDocument();
  });

  it('exposes the resolution explanation via a title attribute', () => {
    vi.mocked(useTenant).mockReturnValue(makeTenantState());

    render(<TenantBadge />);

    expect(screen.getByTitle(/Resolved from this domain/)).toBeInTheDocument();
  });
});
