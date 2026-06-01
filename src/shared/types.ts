export type InstanceRole = 'source' | 'destination';

export interface DashboardFilter {
  databaseContains: string[];
  databaseExact: string[];
  externalIdContains: string[];
  externalIdExact: string[];
}

export interface PostMigrationAction {
  method: string;
  url: string;
  headers: Record<string, string>;
  body: string;
}

export interface PostMigrationActionResult {
  index: number;
  method: string;
  url: string;
  status: number | null;
  ok: boolean;
  error?: string;
  responseBody?: string;
}

export interface Instance {
  id: string;
  label: string;
  role: InstanceRole;
  baseUrl: string;
  apiKey: string;
  userId: string;
  modelId: string;
  folderId: string;
  folderPath: string;
  postMigrationActions?: PostMigrationAction[];
  dashboardTabs?: ('connections' | 'users')[];
  dashboardFilter?: DashboardFilter;
  entityGroupSeparator?: string;
}

export type InstancePublic = Omit<Instance, 'apiKey'> & { apiKeyMasked: string };

export interface OmniDoc {
  identifier: string;
  name: string;
  folderId?: string;
  type?: string;
  updatedAt?: string;
  description?: string | null;
  labels?: string[];
}

export interface OmniLabel {
  name: string;
  color?: string | null;
  description?: string | null;
  isVerified?: boolean;
  isHomepageSection?: boolean;
}

export type JobItemKind = 'delete' | 'export' | 'import' | 'meta';
export type JobItemStatus = 'pending' | 'running' | 'succeeded' | 'failed' | 'skipped';
export type JobStatus =
  | 'pending'
  | 'running'
  | 'succeeded'
  | 'partial'
  | 'failed'
  | 'canceled';

export interface JobItem {
  id: string;
  jobId: string;
  destId: string;
  kind: JobItemKind;
  docId: string | null;
  docName: string | null;
  status: JobItemStatus;
  error: string | null;
  startedAt: number | null;
  endedAt: number | null;
  exportHash: string | null;
}

export interface Job {
  id: string;
  sourceId: string;
  destIds: string[];
  docIds: string[];
  emptyFirst: boolean;
  status: JobStatus;
  createdAt: number;
  startedAt: number | null;
  endedAt: number | null;
  parentJobId: string | null;
  postMigrationActions: PostMigrationAction[];
}

export interface JobWithItems extends Job {
  items: JobItem[];
}

export interface JobPlanStep {
  destId: string;
  destLabel: string;
  kind: JobItemKind;
  docId: string | null;
  docName: string | null;
}

export interface JobPlan {
  sourceId: string;
  sourceLabel: string;
  destIds: string[];
  docIds: string[];
  emptyFirst: boolean;
  steps: JobPlanStep[];
}

export interface CreateJobInput {
  sourceId: string;
  destIds: string[];
  docIds: string[];
  emptyFirst: boolean;
  postMigrationActions?: PostMigrationAction[];
}

export interface JobEvent {
  jobId: string;
  itemId?: string;
  type: 'item' | 'job';
  status: JobItemStatus | JobStatus;
  error?: string;
  at: number;
}
