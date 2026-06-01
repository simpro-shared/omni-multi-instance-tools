export interface OmniExportPayload {
  exportVersion?: string;
  document?: { name?: string; ephemeral?: string };
  dashboard?: unknown;
  workbookModel?: unknown;
  queryModels?: Record<string, unknown>;
  fileUploads?: Record<string, unknown>;
  baseModelId?: string;
  identifier?: string;
  [key: string]: unknown;
}

export interface OmniImportResponse {
  documentId: string;
  identifier: string;
}

export interface OmniDocumentRecord {
  identifier: string;
  name: string;
  folderId?: string;
  type?: string;
  updatedAt?: string;
  description?: string | null;
  labels?: string[];
  [key: string]: unknown;
}

export interface OmniLabelRecord {
  name: string;
  color?: string | null;
  description?: string | null;
  isVerified?: boolean;
  isHomepageSection?: boolean;
}

export interface OmniLabelsListResponse {
  labels: OmniLabelRecord[];
}

export interface OmniPageInfo {
  nextCursor?: string | null;
  hasNextPage?: boolean;
}

export interface OmniListResponse {
  pageInfo: OmniPageInfo;
  records: OmniDocumentRecord[];
}

export interface OmniConnection {
  id: string;
  name: string;
  dialect: string;
  database: string;
  baseRole?: string;
  deletedAt?: string | null;
  defaultSchema?: string;
  [key: string]: unknown;
}

export interface OmniSchemaModel {
  id: string;
  connectionId: string;
  modelKind: string;
  name: string;
  createdAt: string;
  updatedAt: string;
  deletedAt?: string | null;
  [key: string]: unknown;
}

export interface ScimUserGroup {
  display: string;
  value: string;
}

export interface ScimUser {
  id: string;
  displayName: string;
  active: boolean;
  userName: string;
  embedEmail: string | null;
  embedEntity: string;
  embedExternalId: string;
  emails: Array<{ primary: boolean; value: string }>;
  groups: ScimUserGroup[];
  meta: { created: string; lastModified: string; resourceType: string };
  'urn:omni:params:scim:schemas:extension:user:2.0'?: { lastLogin?: string | null };
}

export interface ScimListResponse {
  Resources: ScimUser[];
  itemsPerPage: number;
  startIndex: number;
  totalResults: number;
}
