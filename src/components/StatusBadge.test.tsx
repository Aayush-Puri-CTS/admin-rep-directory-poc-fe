import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { StatusBadge } from './StatusBadge';
import { REP_STATUSES, type RepStatus } from '../api/types';

const EXPECTED_LABELS: Record<RepStatus, string> = {
  PENDING_APPROVAL: 'Pending Approval',
  ACTIVE: 'Active',
  SUSPENDED: 'Suspended',
  SOFT_DELETED: 'Deleted',
};

describe('StatusBadge', () => {
  it.each(REP_STATUSES)('renders the correct label and modifier class for %s', (status) => {
    render(<StatusBadge status={status} />);

    const badge = screen.getByText(EXPECTED_LABELS[status]);
    expect(badge).toBeInTheDocument();
    expect(badge).toHaveClass('badge');
    expect(badge).toHaveClass(`badge--${status.toLowerCase()}`);
  });
});
