import type { ReactNode } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderHook, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  useCreateRep,
  useLinkRepToGroup,
  useRep,
  useRepDirectory,
  useRepGroups,
  useRestoreRep,
  useSearchReps,
  useSoftDeleteRep,
  useUpdateAccessControl,
  useUpdateBusinessInfo,
  useUpdatePersonalInfo,
} from './useReps';
import * as api from '../api/reps';
import type {
  CreateRepBodyDto,
  CreateRepResponse,
  LinkRepToGroupBodyDto,
  LinkRepToGroupResponse,
  RepDetailView,
  RepDirectoryPage,
  RepSummaryView,
  ServicedGroupView,
  UpdateAccessControlBodyDto,
  UpdateBusinessInfoBodyDto,
  UpdatePersonalInfoBodyDto,
} from '../api/types';
import { TenantProvider } from '../context/TenantContext';
import type { TenantConfig } from '../tenant/resolveTenant';

vi.mock('../api/reps');

const mockedApi = vi.mocked(api);

// Fixture tenant config only — no real hostnames, realms, or PII.
const TENANT_CONFIG: TenantConfig = {
  tenantId: 'tenant-fixture-001',
  brand: 'Fixture Brand',
  keycloak: {
    url: 'https://keycloak.example.test',
    realm: 'fixture-realm',
    clientId: 'fixture-client',
  },
};

const REP_SUMMARY: RepSummaryView = {
  repId: 'rep-1',
  firstName: 'Ada',
  lastName: 'Lovelace',
  email: 'ada@example.test',
  repType: 'AGENT',
  status: 'ACTIVE',
  businessName: null,
  isEliteBlue: false,
  createdAt: '2026-01-01T00:00:00.000Z',
};

const REP_DETAIL: RepDetailView = {
  ...REP_SUMMARY,
  middleName: null,
  cellPhone: null,
  telephone: null,
  fax: null,
  num800: null,
  dateOfBirth: null,
  businessTaxId: null,
  businessEmail: null,
  bio: null,
  uplineRepId: null,
  platformAccess: [],
  updatedAt: '2026-01-02T00:00:00.000Z',
};

const REP_DIRECTORY_PAGE: RepDirectoryPage = {
  items: [REP_SUMMARY],
  total: 1,
  page: 1,
  pageSize: 20,
};

const SERVICED_GROUP: ServicedGroupView = {
  groupId: 'group-1',
  relationshipType: 'SERVICES_GROUP',
  startDate: '2026-01-01',
  endDate: null,
};

function createWrapper(queryClient: QueryClient) {
  return function Wrapper({ children }: { children: ReactNode }) {
    return (
      <TenantProvider config={TENANT_CONFIG}>
        <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
      </TenantProvider>
    );
  };
}

let queryClient: QueryClient;

beforeEach(() => {
  queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
      mutations: { retry: false },
    },
  });
});

afterEach(() => {
  vi.clearAllMocks();
});

describe('useRepDirectory', () => {
  it('returns the mocked resolved data on success', async () => {
    mockedApi.getRepDirectory.mockResolvedValueOnce(REP_DIRECTORY_PAGE);

    const { result } = renderHook(() => useRepDirectory({ page: 1, pageSize: 20 }), {
      wrapper: createWrapper(queryClient),
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toEqual(REP_DIRECTORY_PAGE);
    expect(mockedApi.getRepDirectory).toHaveBeenCalledWith({ page: 1, pageSize: 20 });
  });

  it('includes the active tenantId in the query key', () => {
    mockedApi.getRepDirectory.mockResolvedValueOnce(REP_DIRECTORY_PAGE);

    renderHook(() => useRepDirectory({ page: 1, pageSize: 20 }), {
      wrapper: createWrapper(queryClient),
    });

    const [query] = queryClient.getQueryCache().getAll();
    expect(query.queryKey).toEqual(['reps', TENANT_CONFIG.tenantId, 'directory', { page: 1, pageSize: 20 }]);
  });

  it('handles the empty-result case without throwing', async () => {
    const emptyPage: RepDirectoryPage = { items: [], total: 0, page: 1, pageSize: 20 };
    mockedApi.getRepDirectory.mockResolvedValueOnce(emptyPage);

    const { result } = renderHook(() => useRepDirectory({ page: 1, pageSize: 20 }), {
      wrapper: createWrapper(queryClient),
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toEqual(emptyPage);
  });

  it('surfaces a rejected API call as error state', async () => {
    mockedApi.getRepDirectory.mockRejectedValueOnce(new Error('directory fetch failed'));

    const { result } = renderHook(() => useRepDirectory({ page: 1, pageSize: 20 }), {
      wrapper: createWrapper(queryClient),
    });

    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(result.current.error).toBeInstanceOf(Error);
  });
});

describe('useSearchReps', () => {
  it('returns the mocked resolved data on success', async () => {
    mockedApi.searchReps.mockResolvedValueOnce([REP_SUMMARY]);

    const { result } = renderHook(() => useSearchReps({ name: 'Ada' }), {
      wrapper: createWrapper(queryClient),
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toEqual([REP_SUMMARY]);
    expect(mockedApi.searchReps).toHaveBeenCalledWith({ name: 'Ada' });
  });

  it('includes the active tenantId in the query key', () => {
    mockedApi.searchReps.mockResolvedValueOnce([REP_SUMMARY]);

    renderHook(() => useSearchReps({ name: 'Ada' }), {
      wrapper: createWrapper(queryClient),
    });

    const [query] = queryClient.getQueryCache().getAll();
    expect(query.queryKey).toEqual(['reps', TENANT_CONFIG.tenantId, 'search', { name: 'Ada' }]);
  });

  it('handles the empty-result case without throwing', async () => {
    mockedApi.searchReps.mockResolvedValueOnce([]);

    const { result } = renderHook(() => useSearchReps({ name: 'nobody' }), {
      wrapper: createWrapper(queryClient),
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toEqual([]);
  });

  it('surfaces a rejected API call as error state', async () => {
    mockedApi.searchReps.mockRejectedValueOnce(new Error('search failed'));

    const { result } = renderHook(() => useSearchReps({ name: 'Ada' }), {
      wrapper: createWrapper(queryClient),
    });

    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(result.current.error).toBeInstanceOf(Error);
  });
});

describe('useRep', () => {
  it('returns the mocked resolved data on success', async () => {
    mockedApi.getRepById.mockResolvedValueOnce(REP_DETAIL);

    const { result } = renderHook(() => useRep('rep-1'), {
      wrapper: createWrapper(queryClient),
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toEqual(REP_DETAIL);
    expect(mockedApi.getRepById).toHaveBeenCalledWith('rep-1');
  });

  it('includes the active tenantId in the query key', () => {
    mockedApi.getRepById.mockResolvedValueOnce(REP_DETAIL);

    renderHook(() => useRep('rep-1'), {
      wrapper: createWrapper(queryClient),
    });

    const [query] = queryClient.getQueryCache().getAll();
    expect(query.queryKey).toEqual(['reps', TENANT_CONFIG.tenantId, 'detail', 'rep-1']);
  });

  it('surfaces a rejected API call as error state', async () => {
    mockedApi.getRepById.mockRejectedValueOnce(new Error('not found'));

    const { result } = renderHook(() => useRep('rep-1'), {
      wrapper: createWrapper(queryClient),
    });

    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(result.current.error).toBeInstanceOf(Error);
  });
});

describe('useRepGroups', () => {
  it('returns the mocked resolved data on success', async () => {
    mockedApi.getGroupsServicedByRep.mockResolvedValueOnce([SERVICED_GROUP]);

    const { result } = renderHook(() => useRepGroups('rep-1'), {
      wrapper: createWrapper(queryClient),
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toEqual([SERVICED_GROUP]);
    expect(mockedApi.getGroupsServicedByRep).toHaveBeenCalledWith('rep-1');
  });

  it('includes the active tenantId in the query key', () => {
    mockedApi.getGroupsServicedByRep.mockResolvedValueOnce([SERVICED_GROUP]);

    renderHook(() => useRepGroups('rep-1'), {
      wrapper: createWrapper(queryClient),
    });

    const [query] = queryClient.getQueryCache().getAll();
    expect(query.queryKey).toEqual(['reps', TENANT_CONFIG.tenantId, 'groups', 'rep-1']);
  });

  it('surfaces a rejected API call as error state', async () => {
    mockedApi.getGroupsServicedByRep.mockRejectedValueOnce(new Error('groups fetch failed'));

    const { result } = renderHook(() => useRepGroups('rep-1'), {
      wrapper: createWrapper(queryClient),
    });

    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(result.current.error).toBeInstanceOf(Error);
  });
});

describe('useCreateRep', () => {
  const BODY: CreateRepBodyDto = {
    firstName: 'Grace',
    lastName: 'Hopper',
    email: 'grace@example.test',
  };
  const RESPONSE: CreateRepResponse = { repId: 'rep-2' };

  it('calls createRep with the correct arguments and invalidates directory/search on success', async () => {
    mockedApi.createRep.mockResolvedValueOnce(RESPONSE);
    const invalidateSpy = vi.spyOn(queryClient, 'invalidateQueries');

    const { result } = renderHook(() => useCreateRep(), {
      wrapper: createWrapper(queryClient),
    });

    result.current.mutate(BODY);

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(mockedApi.createRep).toHaveBeenCalledWith(BODY);
    expect(result.current.data).toEqual(RESPONSE);
    expect(invalidateSpy).toHaveBeenCalledWith({
      queryKey: ['reps', TENANT_CONFIG.tenantId, 'directory'],
    });
    expect(invalidateSpy).toHaveBeenCalledWith({
      queryKey: ['reps', TENANT_CONFIG.tenantId, 'search'],
    });
  });

  it('does not invalidate queries and surfaces error state on failure', async () => {
    mockedApi.createRep.mockRejectedValueOnce(new Error('create failed'));
    const invalidateSpy = vi.spyOn(queryClient, 'invalidateQueries');

    const { result } = renderHook(() => useCreateRep(), {
      wrapper: createWrapper(queryClient),
    });

    result.current.mutate(BODY);

    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(result.current.error).toBeInstanceOf(Error);
    expect(invalidateSpy).not.toHaveBeenCalled();
  });
});

describe('useUpdatePersonalInfo', () => {
  const REP_ID = 'rep-1';
  const BODY: UpdatePersonalInfoBodyDto = {
    firstName: 'Ada',
    lastName: 'Lovelace',
    email: 'ada@example.test',
  };

  it('calls updatePersonalInfo with the correct arguments and invalidates detail/directory/search on success', async () => {
    mockedApi.updatePersonalInfo.mockResolvedValueOnce(undefined);
    const invalidateSpy = vi.spyOn(queryClient, 'invalidateQueries');

    const { result } = renderHook(() => useUpdatePersonalInfo(REP_ID), {
      wrapper: createWrapper(queryClient),
    });

    result.current.mutate(BODY);

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(mockedApi.updatePersonalInfo).toHaveBeenCalledWith(REP_ID, BODY);
    expect(invalidateSpy).toHaveBeenCalledWith({
      queryKey: ['reps', TENANT_CONFIG.tenantId, 'detail', REP_ID],
    });
    expect(invalidateSpy).toHaveBeenCalledWith({
      queryKey: ['reps', TENANT_CONFIG.tenantId, 'directory'],
    });
    expect(invalidateSpy).toHaveBeenCalledWith({
      queryKey: ['reps', TENANT_CONFIG.tenantId, 'search'],
    });
  });

  it('does not invalidate queries and surfaces error state on failure', async () => {
    mockedApi.updatePersonalInfo.mockRejectedValueOnce(new Error('update failed'));
    const invalidateSpy = vi.spyOn(queryClient, 'invalidateQueries');

    const { result } = renderHook(() => useUpdatePersonalInfo(REP_ID), {
      wrapper: createWrapper(queryClient),
    });

    result.current.mutate(BODY);

    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(result.current.error).toBeInstanceOf(Error);
    expect(invalidateSpy).not.toHaveBeenCalled();
  });
});

describe('useUpdateBusinessInfo', () => {
  const REP_ID = 'rep-1';
  const BODY: UpdateBusinessInfoBodyDto = {
    businessInfo: { businessName: 'Analytical Engines Ltd' },
  };

  it('calls updateBusinessInfo with the correct arguments and invalidates detail/directory/search on success', async () => {
    mockedApi.updateBusinessInfo.mockResolvedValueOnce(undefined);
    const invalidateSpy = vi.spyOn(queryClient, 'invalidateQueries');

    const { result } = renderHook(() => useUpdateBusinessInfo(REP_ID), {
      wrapper: createWrapper(queryClient),
    });

    result.current.mutate(BODY);

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(mockedApi.updateBusinessInfo).toHaveBeenCalledWith(REP_ID, BODY);
    expect(invalidateSpy).toHaveBeenCalledWith({
      queryKey: ['reps', TENANT_CONFIG.tenantId, 'detail', REP_ID],
    });
    expect(invalidateSpy).toHaveBeenCalledWith({
      queryKey: ['reps', TENANT_CONFIG.tenantId, 'directory'],
    });
    expect(invalidateSpy).toHaveBeenCalledWith({
      queryKey: ['reps', TENANT_CONFIG.tenantId, 'search'],
    });
  });

  it('does not invalidate queries and surfaces error state on failure', async () => {
    mockedApi.updateBusinessInfo.mockRejectedValueOnce(new Error('update failed'));
    const invalidateSpy = vi.spyOn(queryClient, 'invalidateQueries');

    const { result } = renderHook(() => useUpdateBusinessInfo(REP_ID), {
      wrapper: createWrapper(queryClient),
    });

    result.current.mutate(BODY);

    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(result.current.error).toBeInstanceOf(Error);
    expect(invalidateSpy).not.toHaveBeenCalled();
  });
});

describe('useUpdateAccessControl', () => {
  const REP_ID = 'rep-1';
  const BODY: UpdateAccessControlBodyDto = {
    entries: [{ platform: 'ENROLLPRIME', accessType: 'ENABLED' }],
  };

  it('calls updateAccessControl with the correct arguments and invalidates detail/directory/search on success', async () => {
    mockedApi.updateAccessControl.mockResolvedValueOnce(undefined);
    const invalidateSpy = vi.spyOn(queryClient, 'invalidateQueries');

    const { result } = renderHook(() => useUpdateAccessControl(REP_ID), {
      wrapper: createWrapper(queryClient),
    });

    result.current.mutate(BODY);

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(mockedApi.updateAccessControl).toHaveBeenCalledWith(REP_ID, BODY);
    expect(invalidateSpy).toHaveBeenCalledWith({
      queryKey: ['reps', TENANT_CONFIG.tenantId, 'detail', REP_ID],
    });
    expect(invalidateSpy).toHaveBeenCalledWith({
      queryKey: ['reps', TENANT_CONFIG.tenantId, 'directory'],
    });
    expect(invalidateSpy).toHaveBeenCalledWith({
      queryKey: ['reps', TENANT_CONFIG.tenantId, 'search'],
    });
  });

  it('does not invalidate queries and surfaces error state on failure', async () => {
    mockedApi.updateAccessControl.mockRejectedValueOnce(new Error('update failed'));
    const invalidateSpy = vi.spyOn(queryClient, 'invalidateQueries');

    const { result } = renderHook(() => useUpdateAccessControl(REP_ID), {
      wrapper: createWrapper(queryClient),
    });

    result.current.mutate(BODY);

    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(result.current.error).toBeInstanceOf(Error);
    expect(invalidateSpy).not.toHaveBeenCalled();
  });
});

describe('useSoftDeleteRep', () => {
  const REP_ID = 'rep-1';

  it('calls softDeleteRep with the correct arguments and invalidates detail/directory/search on success', async () => {
    mockedApi.softDeleteRep.mockResolvedValueOnce(undefined);
    const invalidateSpy = vi.spyOn(queryClient, 'invalidateQueries');

    const { result } = renderHook(() => useSoftDeleteRep(REP_ID), {
      wrapper: createWrapper(queryClient),
    });

    result.current.mutate();

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(mockedApi.softDeleteRep).toHaveBeenCalledWith(REP_ID);
    expect(invalidateSpy).toHaveBeenCalledWith({
      queryKey: ['reps', TENANT_CONFIG.tenantId, 'detail', REP_ID],
    });
    expect(invalidateSpy).toHaveBeenCalledWith({
      queryKey: ['reps', TENANT_CONFIG.tenantId, 'directory'],
    });
    expect(invalidateSpy).toHaveBeenCalledWith({
      queryKey: ['reps', TENANT_CONFIG.tenantId, 'search'],
    });
  });

  it('does not invalidate queries and surfaces error state on failure', async () => {
    mockedApi.softDeleteRep.mockRejectedValueOnce(new Error('delete failed'));
    const invalidateSpy = vi.spyOn(queryClient, 'invalidateQueries');

    const { result } = renderHook(() => useSoftDeleteRep(REP_ID), {
      wrapper: createWrapper(queryClient),
    });

    result.current.mutate();

    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(result.current.error).toBeInstanceOf(Error);
    expect(invalidateSpy).not.toHaveBeenCalled();
  });
});

describe('useRestoreRep', () => {
  const REP_ID = 'rep-1';

  it('calls restoreRep with the correct arguments and invalidates detail/directory/search on success', async () => {
    mockedApi.restoreRep.mockResolvedValueOnce(undefined);
    const invalidateSpy = vi.spyOn(queryClient, 'invalidateQueries');

    const { result } = renderHook(() => useRestoreRep(REP_ID), {
      wrapper: createWrapper(queryClient),
    });

    result.current.mutate();

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(mockedApi.restoreRep).toHaveBeenCalledWith(REP_ID);
    expect(invalidateSpy).toHaveBeenCalledWith({
      queryKey: ['reps', TENANT_CONFIG.tenantId, 'detail', REP_ID],
    });
    expect(invalidateSpy).toHaveBeenCalledWith({
      queryKey: ['reps', TENANT_CONFIG.tenantId, 'directory'],
    });
    expect(invalidateSpy).toHaveBeenCalledWith({
      queryKey: ['reps', TENANT_CONFIG.tenantId, 'search'],
    });
  });

  it('does not invalidate queries and surfaces error state on failure', async () => {
    mockedApi.restoreRep.mockRejectedValueOnce(new Error('restore failed'));
    const invalidateSpy = vi.spyOn(queryClient, 'invalidateQueries');

    const { result } = renderHook(() => useRestoreRep(REP_ID), {
      wrapper: createWrapper(queryClient),
    });

    result.current.mutate();

    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(result.current.error).toBeInstanceOf(Error);
    expect(invalidateSpy).not.toHaveBeenCalled();
  });
});

describe('useLinkRepToGroup', () => {
  const REP_ID = 'rep-1';
  const BODY: LinkRepToGroupBodyDto = { groupId: 'group-1' };
  const RESPONSE: LinkRepToGroupResponse = { relationshipId: 'rel-1' };

  it('calls linkRepToGroup with the correct arguments and invalidates the rep groups key on success', async () => {
    mockedApi.linkRepToGroup.mockResolvedValueOnce(RESPONSE);
    const invalidateSpy = vi.spyOn(queryClient, 'invalidateQueries');

    const { result } = renderHook(() => useLinkRepToGroup(REP_ID), {
      wrapper: createWrapper(queryClient),
    });

    result.current.mutate(BODY);

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(mockedApi.linkRepToGroup).toHaveBeenCalledWith(REP_ID, BODY);
    expect(result.current.data).toEqual(RESPONSE);
    expect(invalidateSpy).toHaveBeenCalledWith({
      queryKey: ['reps', TENANT_CONFIG.tenantId, 'groups', REP_ID],
    });
  });

  it('does not invalidate queries and surfaces error state on failure', async () => {
    mockedApi.linkRepToGroup.mockRejectedValueOnce(new Error('link failed'));
    const invalidateSpy = vi.spyOn(queryClient, 'invalidateQueries');

    const { result } = renderHook(() => useLinkRepToGroup(REP_ID), {
      wrapper: createWrapper(queryClient),
    });

    result.current.mutate(BODY);

    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(result.current.error).toBeInstanceOf(Error);
    expect(invalidateSpy).not.toHaveBeenCalled();
  });
});
