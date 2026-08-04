import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useRepDirectory, useSearchReps } from '../hooks/useReps';
import { StatusBadge } from '../components/StatusBadge';
import { Pagination } from '../components/Pagination';
import { REP_STATUSES, REP_TYPES, type RepStatus, type RepType, type RepSummaryView } from '../api/types';
import { extractErrorMessage } from '../api/client';

interface Filters {
  name: string;
  email: string;
  status: RepStatus | '';
  repType: RepType | '';
  businessName: string;
}

const EMPTY_FILTERS: Filters = { name: '', email: '', status: '', repType: '', businessName: '' };

export function RepDirectoryPage() {
  const [filters, setFilters] = useState<Filters>(EMPTY_FILTERS);
  const [appliedFilters, setAppliedFilters] = useState<Filters>(EMPTY_FILTERS);
  const [page, setPage] = useState(1);
  const pageSize = 20;

  const isSearching = Object.values(appliedFilters).some((v) => v !== '');

  const directoryQuery = useRepDirectory({ page, pageSize });
  const searchQuery = useSearchReps(
    {
      name: appliedFilters.name || undefined,
      email: appliedFilters.email || undefined,
      status: appliedFilters.status || undefined,
      repType: appliedFilters.repType || undefined,
      businessName: appliedFilters.businessName || undefined,
    },
    { enabled: isSearching },
  );

  const activeQuery = isSearching ? searchQuery : directoryQuery;
  const rows: RepSummaryView[] = isSearching ? (searchQuery.data ?? []) : (directoryQuery.data?.items ?? []);

  function applyFilters(e: React.FormEvent) {
    e.preventDefault();
    setAppliedFilters(filters);
    setPage(1);
  }

  function clearFilters() {
    setFilters(EMPTY_FILTERS);
    setAppliedFilters(EMPTY_FILTERS);
    setPage(1);
  }

  return (
    <div className="page">
      <div className="page__header">
        <h1>Reps</h1>
        <Link className="button button--primary" to="/reps/new">
          Create Rep
        </Link>
      </div>

      <form className="filters" onSubmit={applyFilters}>
        <input
          placeholder="Name"
          value={filters.name}
          onChange={(e) => setFilters({ ...filters, name: e.target.value })}
        />
        <input
          placeholder="Email"
          value={filters.email}
          onChange={(e) => setFilters({ ...filters, email: e.target.value })}
        />
        <input
          placeholder="Business name"
          value={filters.businessName}
          onChange={(e) => setFilters({ ...filters, businessName: e.target.value })}
        />
        <select
          value={filters.status}
          onChange={(e) => setFilters({ ...filters, status: e.target.value as RepStatus | '' })}
        >
          <option value="">Any status</option>
          {REP_STATUSES.map((s) => (
            <option key={s} value={s}>
              {s}
            </option>
          ))}
        </select>
        <select
          value={filters.repType}
          onChange={(e) => setFilters({ ...filters, repType: e.target.value as RepType | '' })}
        >
          <option value="">Any type</option>
          {REP_TYPES.map((t) => (
            <option key={t} value={t}>
              {t}
            </option>
          ))}
        </select>
        <button type="submit">Search</button>
        <button type="button" className="button--ghost" onClick={clearFilters}>
          Clear
        </button>
      </form>

      {activeQuery.isLoading && <p>Loading&hellip;</p>}
      {activeQuery.isError && <p className="error-text">{extractErrorMessage(activeQuery.error)}</p>}

      {!activeQuery.isLoading && !activeQuery.isError && (
        <>
          <table className="table">
            <thead>
              <tr>
                <th>Name</th>
                <th>Email</th>
                <th>Type</th>
                <th>Business</th>
                <th>Status</th>
                <th>Created</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((rep) => (
                <tr key={rep.repId}>
                  <td>
                    <Link to={`/reps/${rep.repId}`}>
                      {rep.firstName} {rep.lastName}
                    </Link>
                    {rep.isEliteBlue && <span className="pill">Elite Blue</span>}
                  </td>
                  <td>{rep.email}</td>
                  <td>{rep.repType ?? '—'}</td>
                  <td>{rep.businessName ?? '—'}</td>
                  <td>
                    <StatusBadge status={rep.status} />
                  </td>
                  <td>{new Date(rep.createdAt).toLocaleDateString()}</td>
                </tr>
              ))}
              {rows.length === 0 && (
                <tr>
                  <td colSpan={6} className="table__empty">
                    No Reps found.
                  </td>
                </tr>
              )}
            </tbody>
          </table>

          {!isSearching && directoryQuery.data && (
            <Pagination
              page={directoryQuery.data.page}
              pageSize={directoryQuery.data.pageSize}
              total={directoryQuery.data.total}
              onPageChange={setPage}
            />
          )}
        </>
      )}
    </div>
  );
}
