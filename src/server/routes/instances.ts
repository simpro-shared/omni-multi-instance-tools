import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { deleteInstance, getInstance, isUnlocked, listInstances, upsertInstance, setInstanceActions, setInstanceDashboardTabs, setInstanceDashboardFilter, changePassphrase } from '../storage/vault.js';

const instanceBody = z.object({
  id: z.string().uuid().optional(),
  label: z.string().min(1),
  role: z.enum(['source', 'destination']),
  baseUrl: z.string().url(),
  apiKey: z.string(),
  userId: z.string().default(''),
  modelId: z.string().default(''),
  folderId: z.string().default(''),
  folderPath: z.string().default(''),
  entityGroupSeparator: z.string().optional(),
});

function requireUnlocked(): void {
  if (!isUnlocked()) throw Object.assign(new Error('vault locked'), { statusCode: 423 });
}

export async function instanceRoutes(app: FastifyInstance): Promise<void> {
  app.get('/api/instances', async () => {
    requireUnlocked();
    return listInstances();
  });

  app.post('/api/instances', async req => {
    requireUnlocked();
    const body = instanceBody.parse(req.body);
    return upsertInstance(body);
  });

  app.put('/api/instances/:id', async req => {
    requireUnlocked();
    const { id } = z.object({ id: z.string().uuid() }).parse(req.params);
    const body = instanceBody.parse({ ...(req.body as object), id });
    return upsertInstance(body);
  });

  const actionSchema = z.object({
    method: z.string().min(1),
    url: z.string().url(),
    headers: z.record(z.string()).default({}),
    body: z.string().default(''),
  });

  app.put('/api/instances/:id/actions', async req => {
    requireUnlocked();
    const { id } = z.object({ id: z.string().uuid() }).parse(req.params);
    const actions = z.array(actionSchema).parse(req.body);
    setInstanceActions(id, actions);
    return { ok: true };
  });

  app.patch('/api/instances/:id/dashboard-tabs', async req => {
    requireUnlocked();
    const { id } = z.object({ id: z.string().uuid() }).parse(req.params);
    const { tabs } = z.object({ tabs: z.array(z.enum(['connections', 'users'])) }).parse(req.body);
    setInstanceDashboardTabs(id, tabs);
    return { ok: true };
  });

  const dashboardFilterSchema = z.object({
    databaseContains: z.array(z.string()).default([]),
    databaseExact: z.array(z.string()).default([]),
    externalIdContains: z.array(z.string()).default([]),
    externalIdExact: z.array(z.string()).default([]),
  });

  app.put('/api/instances/:id/dashboard-filter', async req => {
    requireUnlocked();
    const { id } = z.object({ id: z.string().uuid() }).parse(req.params);
    const raw = dashboardFilterSchema.parse(req.body);
    const trim = (arr: string[]) => arr.map(s => s.trim()).filter(Boolean);
    const filter = {
      databaseContains: trim(raw.databaseContains),
      databaseExact: trim(raw.databaseExact),
      externalIdContains: trim(raw.externalIdContains),
      externalIdExact: trim(raw.externalIdExact),
    };
    setInstanceDashboardFilter(id, filter);
    return { ok: true };
  });

  app.post('/api/settings/change-passphrase', async (req, reply) => {
    requireUnlocked();
    const { currentPassphrase, newPassphrase } = z.object({
      currentPassphrase: z.string().min(1),
      newPassphrase: z.string().min(1),
    }).parse(req.body);
    try {
      changePassphrase(currentPassphrase, newPassphrase);
    } catch (err) {
      const code = (err as { statusCode?: number }).statusCode ?? 500;
      return reply.code(code).send({ error: err instanceof Error ? err.message : 'failed' });
    }
    return { ok: true };
  });

  app.delete('/api/instances/:id', async req => {
    requireUnlocked();
    const { id } = z.object({ id: z.string().uuid() }).parse(req.params);
    deleteInstance(id);
    return { ok: true };
  });

  app.get('/api/instances/:id', async req => {
    requireUnlocked();
    const { id } = z.object({ id: z.string().uuid() }).parse(req.params);
    const inst = getInstance(id);
    if (!inst) return { error: 'not found' };
    const { apiKey: _apiKey, ...rest } = inst;
    void _apiKey;
    return { ...rest, apiKeyMasked: inst.apiKey ? `${inst.apiKey.slice(0, 4)}••••${inst.apiKey.slice(-4)}` : '' };
  });
}
