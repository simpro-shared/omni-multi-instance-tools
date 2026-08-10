import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { isUnlocked, lock, unlock, vaultExists } from '../storage/vault.js';

export async function unlockRoutes(app: FastifyInstance): Promise<void> {
  app.get(
    '/api/unlock/status',
    { config: { rateLimit: { max: 60, timeWindow: '1 minute' } } },
    async () => ({
      unlocked: isUnlocked(),
      vaultExists: vaultExists(),
    }),
  );

  // Passphrase check: keep this tight so the vault can't be brute-forced.
  app.post('/api/unlock', {
    config: { rateLimit: { max: 10, timeWindow: '5 minutes' } },
  }, async (req, reply) => {
    const body = z.object({ passphrase: z.string().min(1) }).parse(req.body);
    try {
      unlock(body.passphrase);
      return { ok: true };
    } catch (err) {
      return reply.code(401).send({
        error: 'unlock failed',
        detail: err instanceof Error ? err.message : String(err),
      });
    }
  });

  app.post('/api/lock', {
    config: { rateLimit: { max: 30, timeWindow: '1 minute' } },
  }, async () => {
    lock();
    return { ok: true };
  });
}
