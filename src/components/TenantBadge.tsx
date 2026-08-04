import { useTenant } from '../context/TenantContext';

// Read-only by design — see src/context/TenantContext.tsx and
// spec/tenant-domains-and-hipaa-isolation-team-brief.md §5 ("the browser never sets the
// tenant"). This replaces the old free-text tenant switcher; there is nothing to type here.
export function TenantBadge() {
  const { brand } = useTenant();

  return (
    <span className="tenant-badge" title="Resolved from this domain — see spec/tenant-domains-and-hipaa-isolation-team-brief.md">
      {brand}
    </span>
  );
}
