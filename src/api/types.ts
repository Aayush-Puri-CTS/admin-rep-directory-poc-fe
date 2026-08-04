// Mirrors spec/api-spec.md §§5-7 and spec/openapi.json exactly. Do not add fields the
// backend doesn't accept — it rejects unrecognized fields with 400 (whitelist: true).

export type RepStatus = 'PENDING_APPROVAL' | 'ACTIVE' | 'SUSPENDED' | 'SOFT_DELETED';
export type RepType = 'AGENT' | 'BROKER' | 'GA' | 'MGA' | 'SUPER_GA';
export type RepPlatform = 'ENROLLPRIME' | 'EXTRA_HEALTH' | 'ASSURE_HEALTH';
export type PlatformAccessType = 'ENABLED' | 'DISABLED';
export type PartyRelationshipType = 'SERVICES_GROUP';

export const REP_STATUSES: RepStatus[] = ['PENDING_APPROVAL', 'ACTIVE', 'SUSPENDED', 'SOFT_DELETED'];
export const REP_TYPES: RepType[] = ['AGENT', 'BROKER', 'GA', 'MGA', 'SUPER_GA'];
export const REP_PLATFORMS: RepPlatform[] = ['ENROLLPRIME', 'EXTRA_HEALTH', 'ASSURE_HEALTH'];

export interface CreateRepBodyDto {
  firstName: string;
  lastName: string;
  middleName?: string;
  email: string;
  cellPhone?: string;
  telephone?: string;
  fax?: string;
  num800?: string;
  dateOfBirth?: string;
  ssn?: string;
  businessName?: string;
  businessTaxId?: string;
  businessEmail?: string;
  uplineRepId?: string;
  repType?: RepType;
}

export interface DirectoryQuery {
  page?: number;
  pageSize?: number;
}

export interface SearchRepsQuery {
  name?: string;
  email?: string;
  status?: RepStatus;
  repType?: RepType;
  businessName?: string;
}

export interface LinkRepToGroupBodyDto {
  groupId: string;
  startDate?: string;
}

export interface PlatformAccessEntryDto {
  platform: RepPlatform;
  accessType: PlatformAccessType;
}

export interface UpdateAccessControlBodyDto {
  entries: PlatformAccessEntryDto[];
}

export interface BusinessInfoDto {
  businessName: string;
  businessTaxId?: string;
  businessEmail?: string;
}

export interface UpdateBusinessInfoBodyDto {
  businessInfo: BusinessInfoDto | null;
}

export interface UpdatePersonalInfoBodyDto {
  firstName: string;
  lastName: string;
  middleName?: string;
  email: string;
  cellPhone?: string;
  telephone?: string;
  fax?: string;
  num800?: string;
  dateOfBirth?: string;
  ssn?: string;
}

export interface RepSummaryView {
  repId: string;
  firstName: string;
  lastName: string;
  email: string;
  repType: RepType | null;
  status: RepStatus;
  businessName: string | null;
  isEliteBlue: boolean;
  createdAt: string;
}

export interface RepDetailView extends RepSummaryView {
  middleName: string | null;
  cellPhone: string | null;
  telephone: string | null;
  fax: string | null;
  num800: string | null;
  dateOfBirth: string | null;
  businessTaxId: string | null;
  businessEmail: string | null;
  bio: string | null;
  uplineRepId: string | null;
  platformAccess: PlatformAccessEntryDto[];
  updatedAt: string;
}

export interface RepDirectoryPage {
  items: RepSummaryView[];
  total: number;
  page: number;
  pageSize: number;
}

export interface ServicedGroupView {
  groupId: string;
  relationshipType: PartyRelationshipType;
  startDate: string;
  endDate: string | null;
}

export interface CreateRepResponse {
  repId: string;
}

export interface LinkRepToGroupResponse {
  relationshipId: string;
}
