import { createHash } from 'node:crypto';
import type { Job, JobItem, JobStatus, OmniLabel } from '../../shared/types.js';
import { getInstance } from '../storage/vault.js';
import { OmniClient, OmniError } from '../omni/client.js';
import type { OmniExportPayload } from '../omni/types.js';
import { getItems, updateItem, updateJob } from '../storage/repo.js';
import { publish } from './events.js';
import { runPostMigrationActions } from './postMigration.js';

interface SourceMeta {
  description: string | null;
  labels: string[];
}

const running = new Set<string>();

export function isRunning(jobId: string): boolean {
  return running.has(jobId);
}

export async function runJob(job: Job): Promise<void> {
  if (running.has(job.id)) return;
  running.add(job.id);
  try {
    await executeJob(job);
  } finally {
    running.delete(job.id);
  }
}

async function executeJob(job: Job): Promise<void> {
  const source = getInstance(job.sourceId);
  if (!source) {
    markJobFailed(job.id, 'source instance missing');
    return;
  }
  const sourceClient = new OmniClient(source);
  const items = getItems(job.id);

  const startedAt = Date.now();
  updateJob(job.id, { status: 'running', startedAt });
  publish({ jobId: job.id, type: 'job', status: 'running', at: startedAt });

  const byDest = new Map<string, JobItem[]>();
  for (const item of items) {
    const list = byDest.get(item.destId) ?? [];
    list.push(item);
    byDest.set(item.destId, list);
  }

  const exportCache = new Map<string, { payload: OmniExportPayload; hash: string }>();

  const sourceMeta = new Map<string, SourceMeta>();
  const sourceLabelDefs = new Map<string, OmniLabel>();
  try {
    const docs = await sourceClient.listFolder(source.folderId, { includeLabels: true });
    for (const d of docs) {
      sourceMeta.set(d.identifier, {
        description: d.description ?? null,
        labels: Array.isArray(d.labels) ? d.labels : [],
      });
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.warn(`[migrator] failed to list source folder with labels: ${msg}`);
  }
  try {
    const allLabels = await sourceClient.listLabels();
    for (const l of allLabels) sourceLabelDefs.set(l.name, l);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.warn(`[migrator] failed to list source labels: ${msg}`);
  }

  await Promise.all(
    Array.from(byDest.entries()).map(([destId, destItems]) =>
      runDestination(job.id, destId, destItems, sourceClient, exportCache, sourceMeta, sourceLabelDefs),
    ),
  );

  const refreshed = getItems(job.id);
  const finalStatus = computeStatus(refreshed);
  const endedAt = Date.now();
  updateJob(job.id, { status: finalStatus, endedAt });
  publish({ jobId: job.id, type: 'job', status: finalStatus, at: endedAt });

  if (job.postMigrationActions?.length) {
    publish({ jobId: job.id, type: 'post-migration', status: 'running', at: Date.now() });
    try {
      const actionResults = await runPostMigrationActions(job.postMigrationActions);
      for (const r of actionResults) {
        const tag = r.ok ? '[ok]' : '[fail]';
        console.log(`[post-migration] ${tag} ${r.method} ${r.url} → ${r.status ?? 'network error'}`);
        if (r.responseBody) console.log(`[post-migration] response:\n${r.responseBody}`);
        if (r.error) console.log(`[post-migration] error: ${r.error}`);
      }
      updateJob(job.id, { postMigrationResults: actionResults });
    } catch (err) {
      console.warn(`[migrator] post-migration actions failed for job ${job.id}:`, err);
    }
    publish({ jobId: job.id, type: 'post-migration', status: 'done', at: Date.now() });
  }
}

async function runDestination(
  jobId: string,
  destId: string,
  items: JobItem[],
  sourceClient: OmniClient,
  exportCache: Map<string, { payload: OmniExportPayload; hash: string }>,
  sourceMeta: Map<string, SourceMeta>,
  sourceLabelDefs: Map<string, OmniLabel>,
): Promise<void> {
  const dest = getInstance(destId);
  if (!dest) {
    for (const item of items) fail(jobId, item.id, 'destination instance missing');
    return;
  }
  const destClient = new OmniClient(dest);
  let destLabelsLoaded = false;
  const destLabels = new Set<string>();
  const ensureDestLabels = async (): Promise<void> => {
    if (destLabelsLoaded) return;
    const list = await destClient.listLabels();
    for (const l of list) destLabels.add(l.name);
    destLabelsLoaded = true;
  };
  const importedIdBySourceDoc = new Map<string, string>();

  for (const item of items) {
    const startedAt = Date.now();
    updateItem(item.id, { status: 'running', startedAt });
    publish({ jobId, itemId: item.id, type: 'item', status: 'running', at: startedAt });
    try {
      if (item.kind === 'delete') {
        if (!item.docId) throw new Error('delete item missing docId');
        await destClient.deleteDoc(item.docId);
      } else if (item.kind === 'export') {
        if (!item.docId) throw new Error('export item missing docId');
        let cached = exportCache.get(item.docId);
        if (!cached) {
          const payload = await sourceClient.exportDoc(item.docId);
          const hash = hashPayload(payload);
          cached = { payload, hash };
          exportCache.set(item.docId, cached);
        }
        updateItem(item.id, { exportHash: cached.hash });
      } else if (item.kind === 'import') {
        if (!item.docId) throw new Error('import item missing docId');
        const cached = exportCache.get(item.docId);
        if (!cached) throw new Error('export missing for import step (planner invariant violated)');
        const docName = item.docName ?? cached.payload.document?.name ?? 'Untitled';
        const imported = await destClient.importDoc({
          exportPayload: cached.payload,
          baseModelId: dest.modelId,
          folderPath: dest.folderPath,
          documentName: docName,
        });
        let newId = imported.identifier;
        if (!newId) {
          const docs = await destClient.listFolder(dest.folderId);
          const matches = docs.filter(d => d.name === docName);
          matches.sort((a, b) => (b.updatedAt ?? '').localeCompare(a.updatedAt ?? ''));
          newId = matches[0]?.identifier ?? '';
        }
        if (!newId) {
          throw new Error(`import succeeded but could not resolve destination identifier. raw response: ${JSON.stringify(imported.raw)}`);
        }
        importedIdBySourceDoc.set(item.docId, newId);
      } else if (item.kind === 'meta') {
        if (!item.docId) throw new Error('meta item missing docId');
        const newId = importedIdBySourceDoc.get(item.docId);
        if (!newId) throw new Error('no imported identifier available for metadata step');
        const meta = sourceMeta.get(item.docId);
        if (!meta) throw new Error(`source metadata missing for ${item.docId}`);
        if (meta.description !== null && meta.description !== undefined && meta.description !== '') {
          await destClient.patchDoc(newId, { description: meta.description, summary: 'migration: copy description from source', clearExistingDraft: true });
        }
        if (meta.labels.length > 0) {
          await ensureDestLabels();
          for (const name of meta.labels) {
            if (destLabels.has(name)) continue;
            const def = sourceLabelDefs.get(name);
            try {
              await destClient.createLabel({
                name,
                color: def?.color ?? null,
                description: def?.description ?? null,
              });
            } catch (err) {
              if (!(err instanceof OmniError && err.status === 409)) throw err;
            }
            destLabels.add(name);
          }
          await destClient.setDocumentLabels(newId, meta.labels);
        }
      }
      succeed(jobId, item.id);
    } catch (err) {
      const msg = err instanceof OmniError ? err.message : err instanceof Error ? err.message : String(err);
      fail(jobId, item.id, msg);
    }
  }
}

function succeed(jobId: string, itemId: string): void {
  const endedAt = Date.now();
  updateItem(itemId, { status: 'succeeded', endedAt });
  publish({ jobId, itemId, type: 'item', status: 'succeeded', at: endedAt });
}

function fail(jobId: string, itemId: string, error: string): void {
  const endedAt = Date.now();
  updateItem(itemId, { status: 'failed', endedAt, error });
  publish({ jobId, itemId, type: 'item', status: 'failed', error, at: endedAt });
}

function markJobFailed(jobId: string, error: string): void {
  const endedAt = Date.now();
  updateJob(jobId, { status: 'failed', endedAt });
  publish({ jobId, type: 'job', status: 'failed', error, at: endedAt });
}

function computeStatus(items: JobItem[]): JobStatus {
  if (items.length === 0) return 'succeeded';
  const failed = items.filter(i => i.status === 'failed').length;
  const succeeded = items.filter(i => i.status === 'succeeded').length;
  if (failed === 0) return 'succeeded';
  if (succeeded === 0) return 'failed';
  return 'partial';
}

function hashPayload(p: OmniExportPayload): string {
  return createHash('sha256').update(JSON.stringify(p)).digest('hex');
}
