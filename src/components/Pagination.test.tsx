import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Pagination } from './Pagination';

describe('Pagination', () => {
  it('renders the current page, total pages, and total count', () => {
    render(<Pagination page={2} pageSize={10} total={45} onPageChange={vi.fn()} />);

    expect(screen.getByText(/Page 2 of 5/)).toBeInTheDocument();
    expect(screen.getByText(/45 total/)).toBeInTheDocument();
  });

  it('disables Previous on the first page', () => {
    render(<Pagination page={1} pageSize={10} total={45} onPageChange={vi.fn()} />);

    expect(screen.getByRole('button', { name: 'Previous' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Next' })).toBeEnabled();
  });

  it('disables Next on the last page', () => {
    render(<Pagination page={5} pageSize={10} total={45} onPageChange={vi.fn()} />);

    expect(screen.getByRole('button', { name: 'Next' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Previous' })).toBeEnabled();
  });

  it('treats an empty result set as a single page and disables both buttons', () => {
    render(<Pagination page={1} pageSize={10} total={0} onPageChange={vi.fn()} />);

    expect(screen.getByText(/Page 1 of 1/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Previous' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Next' })).toBeDisabled();
  });

  it('calls onPageChange with the previous page number when Previous is clicked', async () => {
    const onPageChange = vi.fn();
    const user = userEvent.setup();
    render(<Pagination page={3} pageSize={10} total={45} onPageChange={onPageChange} />);

    await user.click(screen.getByRole('button', { name: 'Previous' }));

    expect(onPageChange).toHaveBeenCalledTimes(1);
    expect(onPageChange).toHaveBeenCalledWith(2);
  });

  it('calls onPageChange with the next page number when Next is clicked', async () => {
    const onPageChange = vi.fn();
    const user = userEvent.setup();
    render(<Pagination page={3} pageSize={10} total={45} onPageChange={onPageChange} />);

    await user.click(screen.getByRole('button', { name: 'Next' }));

    expect(onPageChange).toHaveBeenCalledTimes(1);
    expect(onPageChange).toHaveBeenCalledWith(4);
  });

  it('does not call onPageChange when a disabled button is clicked', async () => {
    const onPageChange = vi.fn();
    const user = userEvent.setup();
    render(<Pagination page={1} pageSize={10} total={45} onPageChange={onPageChange} />);

    await user.click(screen.getByRole('button', { name: 'Previous' }));

    expect(onPageChange).not.toHaveBeenCalled();
  });
});
