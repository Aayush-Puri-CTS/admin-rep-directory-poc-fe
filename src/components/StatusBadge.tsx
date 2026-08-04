import type { RepStatus } from '../api/types';

const LABELS: Record<RepStatus, string> = {
  PENDING_APPROVAL: 'Pending Approval',
  ACTIVE: 'Active',
  SUSPENDED: 'Suspended',
  SOFT_DELETED: 'Deleted',
};

export function StatusBadge({ status }: { status: RepStatus }) {
  return <span className={`badge badge--${status.toLowerCase()}`}>{LABELS[status]}</span>;
}
