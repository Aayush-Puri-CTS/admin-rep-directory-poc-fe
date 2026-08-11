import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import * as api from '../api/reps';
import type {
  CreateRepBodyDto,
  DirectoryQuery,
  LinkRepToGroupBodyDto,
  SearchRepsQuery,
  UpdateAccessControlBodyDto,
  UpdateBusinessInfoBodyDto,
  UpdatePersonalInfoBodyDto,
} from '../api/types';
import { useTenant } from '../context/TenantContext';

// Query keys are namespaced by tenantId so switching tenants never surfaces another
// tenant's cached Reps, and so a tenant switch cleanly invalidates just its own data.

export function useRepDirectory(query: DirectoryQuery) {
  const { tenantId } = useTenant();
  return useQuery({
    queryKey: ['reps', tenantId, 'directory', query],
    queryFn: () => api.getRepDirectory(query),
    placeholderData: (prev) => prev,
  });
}

export function useSearchReps(query: SearchRepsQuery, options?: { enabled?: boolean }) {
  const { tenantId } = useTenant();
  return useQuery({
    queryKey: ['reps', tenantId, 'search', query],
    queryFn: () => api.searchReps(query),
    enabled: options?.enabled ?? true,
  });
}

export function useRep(repId: string | undefined) {
  const { tenantId } = useTenant();
  return useQuery({
    queryKey: ['reps', tenantId, 'detail', repId],
    queryFn: () => api.getRepById(repId!),
    enabled: !!repId,
  });
}

export function useRepGroups(repId: string | undefined) {
  const { tenantId } = useTenant();
  return useQuery({
    queryKey: ['reps', tenantId, 'groups', repId],
    queryFn: () => api.getGroupsServicedByRep(repId!),
    enabled: !!repId,
  });
}

export function useCreateRep() {
  const queryClient = useQueryClient();
  const { tenantId } = useTenant();
  return useMutation({
    mutationFn: (body: CreateRepBodyDto) => api.createRep(body),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['reps', tenantId, 'directory'] });
      void queryClient.invalidateQueries({ queryKey: ['reps', tenantId, 'search'] });
    },
  });
}

function useInvalidateRep(repId: string) {
  const queryClient = useQueryClient();
  const { tenantId } = useTenant();
  return () => {
    void queryClient.invalidateQueries({ queryKey: ['reps', tenantId, 'detail', repId] });
    void queryClient.invalidateQueries({ queryKey: ['reps', tenantId, 'directory'] });
    void queryClient.invalidateQueries({ queryKey: ['reps', tenantId, 'search'] });
  };
}

export function useUpdatePersonalInfo(repId: string) {
  const invalidate = useInvalidateRep(repId);
  return useMutation({
    mutationFn: (body: UpdatePersonalInfoBodyDto) => api.updatePersonalInfo(repId, body),
    onSuccess: invalidate,
  });
}

export function useUpdateBusinessInfo(repId: string) {
  const invalidate = useInvalidateRep(repId);
  return useMutation({
    mutationFn: (body: UpdateBusinessInfoBodyDto) => api.updateBusinessInfo(repId, body),
    onSuccess: invalidate,
  });
}

export function useUpdateAccessControl(repId: string) {
  const invalidate = useInvalidateRep(repId);
  return useMutation({
    mutationFn: (body: UpdateAccessControlBodyDto) => api.updateAccessControl(repId, body),
    onSuccess: invalidate,
  });
}

export function useSoftDeleteRep(repId: string) {
  const invalidate = useInvalidateRep(repId);
  return useMutation({
    mutationFn: () => api.softDeleteRep(repId),
    onSuccess: invalidate,
  });
}

export function useRestoreRep(repId: string) {
  const invalidate = useInvalidateRep(repId);
  return useMutation({
    mutationFn: () => api.restoreRep(repId),
    onSuccess: invalidate,
  });
}

export function useLinkRepToGroup(repId: string) {
  const queryClient = useQueryClient();
  const { tenantId } = useTenant();
  return useMutation({
    mutationFn: (body: LinkRepToGroupBodyDto) => api.linkRepToGroup(repId, body),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['reps', tenantId, 'groups', repId] });
    },
  });
}
