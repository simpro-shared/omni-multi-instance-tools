import type { FolderRef, JobPlan, JobPlanStep } from '../../shared/types.js';
import { getInstance } from '../storage/vault.js';
import { OmniClient } from '../omni/client.js';
import { resolveFolder } from './folders.js';

export interface PlanInput {
  sourceId: string;
  destIds: string[];
  docIds: string[];
  emptyFirst: boolean;
  sourceFolder?: FolderRef;
  destFolders?: Record<string, FolderRef>;
}

export async function buildPlan(input: PlanInput): Promise<JobPlan> {
  const source = getInstance(input.sourceId);
  if (!source) throw new Error('source instance not found');

  const sourceClient = new OmniClient(source);
  const sourceFolder = resolveFolder(source, input.sourceFolder);
  const sourceDocs = await sourceClient.listFolder(sourceFolder.id);
  const picked = sourceDocs.filter(d => input.docIds.includes(d.identifier));
  const missing = input.docIds.filter(id => !picked.some(p => p.identifier === id));
  if (missing.length) throw new Error(`docs not found in source folder: ${missing.join(', ')}`);

  const steps: JobPlanStep[] = [];
  const destFolders: Record<string, FolderRef> = {};

  for (const destId of input.destIds) {
    const dest = getInstance(destId);
    if (!dest) throw new Error(`destination not found: ${destId}`);

    const destClient = new OmniClient(dest);
    const destFolder = resolveFolder(dest, input.destFolders?.[destId]);
    destFolders[destId] = destFolder;
    const existing = await destClient.listFolder(destFolder.id);

    if (input.emptyFirst) {
      for (const d of existing) {
        steps.push({
          destId,
          destLabel: dest.label,
          kind: 'delete',
          docId: d.identifier,
          docName: d.name,
        });
      }
    } else {
      const pickedNames = new Set(picked.map(p => p.name));
      for (const d of existing) {
        if (pickedNames.has(d.name)) {
          steps.push({
            destId,
            destLabel: dest.label,
            kind: 'delete',
            docId: d.identifier,
            docName: d.name,
          });
        }
      }
    }

    for (const doc of picked) {
      steps.push({
        destId,
        destLabel: dest.label,
        kind: 'export',
        docId: doc.identifier,
        docName: doc.name,
      });
      steps.push({
        destId,
        destLabel: dest.label,
        kind: 'import',
        docId: doc.identifier,
        docName: doc.name,
      });
      steps.push({
        destId,
        destLabel: dest.label,
        kind: 'models',
        docId: doc.identifier,
        docName: doc.name,
      });
      steps.push({
        destId,
        destLabel: dest.label,
        kind: 'verify',
        docId: doc.identifier,
        docName: doc.name,
      });
      steps.push({
        destId,
        destLabel: dest.label,
        kind: 'meta',
        docId: doc.identifier,
        docName: doc.name,
      });
    }
  }

  return {
    sourceId: input.sourceId,
    sourceLabel: source.label,
    sourceFolder,
    destFolders,
    destIds: input.destIds,
    docIds: input.docIds,
    emptyFirst: input.emptyFirst,
    steps,
  };
}
