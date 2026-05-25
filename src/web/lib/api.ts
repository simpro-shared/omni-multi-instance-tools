import type {
  InstancePublic,
  Instance,
  OmniDoc,
  OmniLabel,
  JobPlan,
  Job,
  JobWithItems,
  PostMigrationAction,
  PostMigrationActionResult,
} from '../../shared/types';

export interface ConnectionStat {
  id: string;
  name: string;
  dialect: string;
  database: string;
  hasSchemaModel: boolean;
  schemaModelId: string | null;
  schemaModelUpdatedAt: string | null;
}

export interface InstanceDashboardStats {
  instanceId: string;
  instanceLabel: string;
  instanceRole: string;
  baseUrl: string;
  totalConnections: number;
  connections: ConnectionStat[];
  error?: string;
}

export interface EmbedUserStat {
  id: string;
  displayName: string;
  userName: string;
  active: boolean;
  embedExternalId: string;
  groups: Array<{ display: string; value: string }>;
}

export interface InstanceEmbedUserStats {
  instanceId: string;
  instanceLabel: string;
  instanceRole: string;
  baseUrl: string;
  users: EmbedUserStat[];
  error?: string;
}

async function j<T>(res: Response): Promise<T> {
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`${res.status} ${text || res.statusText}`);
  }
  return await res.json() as T;
}

export const api = {
  unlockStatus: () => fetch('/api/unlock/status').then(j<{ unlocked: boolean; vaultExists: boolean }>),
  unlock: (passphrase: string) =>
    fetch('/api/unlock', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ passphrase }),
    }).then(j<{ ok: true }>),
  lock: () => fetch('/api/lock', { method: 'POST' }).then(j<{ ok: true }>),

  listInstances: () => fetch('/api/instances').then(j<InstancePublic[]>),
  createInstance: (body: Omit<Instance, 'id'>) =>
    fetch('/api/instances', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    }).then(j<InstancePublic>),
  updateInstance: (id: string, body: Omit<Instance, 'id'>) =>
    fetch(`/api/instances/${id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    }).then(j<InstancePublic>),
  deleteInstance: (id: string) =>
    fetch(`/api/instances/${id}`, { method: 'DELETE' }).then(j<{ ok: true }>),
  setInstanceDashboardEnabled: (id: string, enabled: boolean) =>
    fetch(`/api/instances/${id}/dashboard-enabled`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ enabled }),
    }).then(j<{ ok: true }>),
  saveInstanceActions: (id: string, actions: PostMigrationAction[]) =>
    fetch(`/api/instances/${id}/actions`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(actions),
    }).then(j<{ ok: true }>),

  listFolder: (instanceId: string) =>
    fetch(`/api/instances/${instanceId}/folder`).then(j<OmniDoc[]>),

  getDoc: (instanceId: string, docId: string) =>
    fetch(`/api/instances/${instanceId}/documents/${encodeURIComponent(docId)}`)
      .then(j<{ name: string; description: string | null }>),
  patchDoc: (instanceId: string, docId: string, body: { name?: string; description?: string | null; clearExistingDraft?: boolean }) =>
    fetch(`/api/instances/${instanceId}/documents/${encodeURIComponent(docId)}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    }).then(j<{ ok: true }>),

  listLabels: (instanceId: string) =>
    fetch(`/api/instances/${instanceId}/labels`).then(j<OmniLabel[]>),
  setDocumentLabels: (instanceId: string, docId: string, body: { add?: string[]; remove?: string[] }) =>
    fetch(`/api/instances/${instanceId}/documents/${encodeURIComponent(docId)}/labels`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    }).then(j<{ ok: true }>),

  previewJob: (body: { sourceId: string; destIds: string[]; docIds: string[]; emptyFirst: boolean }) =>
    fetch('/api/jobs/preview', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    }).then(j<JobPlan>),
  createJob: (body: { sourceId: string; destIds: string[]; docIds: string[]; emptyFirst: boolean; postMigrationActions?: PostMigrationAction[] }) =>
    fetch('/api/jobs', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    }).then(j<{ job: Job; plan: JobPlan }>),
  runActions: (actions: PostMigrationAction[]) =>
    fetch('/api/actions/run', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(actions),
    }).then(j<{ results: PostMigrationActionResult[] }>),
  retryJob: (id: string) =>
    fetch(`/api/jobs/${id}/retry`, { method: 'POST' }).then(j<{ job: Job }>),
  listJobs: () => fetch('/api/jobs').then(j<Job[]>),
  getJob: (id: string) => fetch(`/api/jobs/${id}`).then(j<JobWithItems & { running: boolean }>),

  getDashboardStats: () => fetch('/api/dashboard/stats').then(j<InstanceDashboardStats[]>),
  getEmbedUserStats: () => fetch('/api/dashboard/embed-users').then(j<InstanceEmbedUserStats[]>),

  refreshSchema: (instanceId: string, modelId: string) =>
    fetch(`/api/dashboard/${instanceId}/refresh-schema`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ modelId }),
    }).then(j<{ jobId: string; modelId: string; status: string }>),

};
