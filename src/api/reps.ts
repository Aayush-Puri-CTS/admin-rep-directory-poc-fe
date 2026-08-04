import { apiClient } from './client';
import type {
  CreateRepBodyDto,
  CreateRepResponse,
  DirectoryQuery,
  LinkRepToGroupBodyDto,
  LinkRepToGroupResponse,
  RepDetailView,
  RepDirectoryPage,
  RepSummaryView,
  SearchRepsQuery,
  ServicedGroupView,
  UpdateAccessControlBodyDto,
  UpdateBusinessInfoBodyDto,
  UpdatePersonalInfoBodyDto,
} from './types';

export async function createRep(body: CreateRepBodyDto): Promise<CreateRepResponse> {
  const { data } = await apiClient.post<CreateRepResponse>('/reps', body);
  return data;
}

export async function getRepDirectory(query: DirectoryQuery): Promise<RepDirectoryPage> {
  const { data } = await apiClient.get<RepDirectoryPage>('/reps', { params: query });
  return data;
}

export async function searchReps(query: SearchRepsQuery): Promise<RepSummaryView[]> {
  const { data } = await apiClient.get<RepSummaryView[]>('/reps/search', { params: query });
  return data;
}

export async function getRepById(repId: string): Promise<RepDetailView> {
  const { data } = await apiClient.get<RepDetailView>(`/reps/${repId}`);
  return data;
}

export async function updatePersonalInfo(repId: string, body: UpdatePersonalInfoBodyDto): Promise<void> {
  await apiClient.patch(`/reps/${repId}/personal-info`, body);
}

export async function updateBusinessInfo(repId: string, body: UpdateBusinessInfoBodyDto): Promise<void> {
  await apiClient.patch(`/reps/${repId}/business-info`, body);
}

export async function updateAccessControl(repId: string, body: UpdateAccessControlBodyDto): Promise<void> {
  await apiClient.patch(`/reps/${repId}/access-control`, body);
}

export async function softDeleteRep(repId: string): Promise<void> {
  await apiClient.delete(`/reps/${repId}`);
}

export async function restoreRep(repId: string): Promise<void> {
  await apiClient.post(`/reps/${repId}/restore`);
}

export async function linkRepToGroup(repId: string, body: LinkRepToGroupBodyDto): Promise<LinkRepToGroupResponse> {
  const { data } = await apiClient.post<LinkRepToGroupResponse>(`/reps/${repId}/groups`, body);
  return data;
}

export async function getGroupsServicedByRep(repId: string): Promise<ServicedGroupView[]> {
  const { data } = await apiClient.get<ServicedGroupView[]>(`/reps/${repId}/groups`);
  return data;
}
