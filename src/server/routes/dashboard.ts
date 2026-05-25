import type { FastifyInstance } from 'fastify';
import { getInstance, isUnlocked, listInstances } from '../storage/vault.js';
import { OmniClient } from '../omni/client.js';

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

export async function dashboardRoutes(app: FastifyInstance): Promise<void> {
  app.get('/api/dashboard/stats', async (_req, reply) => {
    if (!isUnlocked()) return reply.code(423).send({ error: 'vault locked' });

    const publicInstances = listInstances().filter(i => i.dashboardEnabled !== false);
    const results = await Promise.allSettled(
      publicInstances.map(async (pub): Promise<InstanceDashboardStats> => {
        const inst = getInstance(pub.id)!;
        const client = new OmniClient(inst);
        const [connections, models] = await Promise.all([
          client.listConnections(),
          client.listSchemaModels(),
        ]);

        const schemaModelByConnectionId = new Map(
          models
            .filter(m => !m.deletedAt)
            .map(m => [m.connectionId, m])
        );

        const connectionStats: ConnectionStat[] = connections
          .filter(c => !c.deletedAt)
          .map(c => {
            const model = schemaModelByConnectionId.get(c.id);
            const hasSchemaModel = !!model && model.createdAt !== model.updatedAt;
            return { id: c.id, name: c.name, dialect: c.dialect, database: c.database, hasSchemaModel, schemaModelId: model?.id ?? null, schemaModelUpdatedAt: model?.updatedAt ?? null };
          });

        return {
          instanceId: inst.id,
          instanceLabel: inst.label,
          instanceRole: inst.role,
          baseUrl: inst.baseUrl,
          totalConnections: connectionStats.length,
          connections: connectionStats,
        };
      })
    );

    const stats: InstanceDashboardStats[] = results.map((r, i) => {
      if (r.status === 'fulfilled') return r.value;
      const pub = publicInstances[i]!;
      return {
        instanceId: pub.id,
        instanceLabel: pub.label,
        instanceRole: pub.role,
        baseUrl: pub.baseUrl,
        totalConnections: 0,
        connections: [],
        error: r.reason instanceof Error ? r.reason.message : String(r.reason),
      };
    });

    return stats;
  });

  app.post('/api/dashboard/:instanceId/refresh-schema', async (req, reply) => {
    if (!isUnlocked()) return reply.code(423).send({ error: 'vault locked' });
    const { instanceId } = req.params as { instanceId: string };
    const { modelId } = req.body as { modelId: string };
    if (!modelId) return reply.code(400).send({ error: 'modelId required' });
    const inst = getInstance(instanceId);
    if (!inst) return reply.code(404).send({ error: 'instance not found' });
    const client = new OmniClient(inst);
    const result = await client.refreshSchemaModel(modelId);
    return result;
  });

  app.get('/api/dashboard/embed-users', async (_req, reply) => {
    if (!isUnlocked()) return reply.code(423).send({ error: 'vault locked' });

    const publicInstances = listInstances().filter(i => i.dashboardEnabled !== false);
    const results = await Promise.allSettled(
      publicInstances.map(async (pub): Promise<InstanceEmbedUserStats> => {
        const inst = getInstance(pub.id)!;
        const client = new OmniClient(inst);
        const users = await client.listEmbedUsers();
        return {
          instanceId: inst.id,
          instanceLabel: inst.label,
          instanceRole: inst.role,
          baseUrl: inst.baseUrl,
          users: users.map(u => ({
            id: u.id,
            displayName: u.displayName,
            userName: u.userName,
            active: u.active,
            embedExternalId: u.embedExternalId,
            groups: u.groups,
          })),
        };
      })
    );

    const stats: InstanceEmbedUserStats[] = results.map((r, i) => {
      if (r.status === 'fulfilled') return r.value;
      const pub = publicInstances[i]!;
      return {
        instanceId: pub.id,
        instanceLabel: pub.label,
        instanceRole: pub.role,
        baseUrl: pub.baseUrl,
        users: [],
        error: r.reason instanceof Error ? r.reason.message : String(r.reason),
      };
    });

    return stats;
  });
}
