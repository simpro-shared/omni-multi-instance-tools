import Fastify from 'fastify';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import staticPlugin from '@fastify/static';
import rateLimit from '@fastify/rate-limit';
import { unlockRoutes } from './routes/unlock.js';
import { instanceRoutes } from './routes/instances.js';
import { folderRoutes } from './routes/folders.js';
import { jobRoutes } from './routes/jobs.js';
import { dashboardRoutes } from './routes/dashboard.js';
import { getDb } from './storage/db.js';

const HOST = '127.0.0.1';
const PORT = Number(process.env.PORT ?? 5174);

async function main(): Promise<void> {
  const app = Fastify({
    logger: { level: process.env.LOG_LEVEL ?? 'info' },
  });

  app.setErrorHandler((err: Error, _req, reply) => {
    const statusCode = (err as { statusCode?: number }).statusCode ?? 500;
    app.log.error({ err }, 'request failed');
    reply.code(statusCode).send({
      error: err.name || 'Error',
      message: err.message,
    });
  });

  // Generous global default; individual routes tighten this where it matters.
  await app.register(rateLimit, {
    global: true,
    max: 300,
    timeWindow: '1 minute',
  });

  getDb();

  await app.register(unlockRoutes);
  await app.register(instanceRoutes);
  await app.register(folderRoutes);
  await app.register(jobRoutes);
  await app.register(dashboardRoutes);

  const here = dirname(fileURLToPath(import.meta.url));
  const webDist = resolve(here, '../web');
  if (existsSync(webDist)) {
    await app.register(staticPlugin, { root: webDist, prefix: '/' });
    app.setNotFoundHandler((req, reply) => {
      if (req.url.startsWith('/api')) return reply.code(404).send({ error: 'not found' });
      return reply.sendFile('index.html');
    });
  }

  await app.listen({ host: HOST, port: PORT });
  app.log.info(`migrator server listening on http://${HOST}:${PORT}`);
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
