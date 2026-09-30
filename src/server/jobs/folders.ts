import type { FolderRef, Instance } from '../../shared/types.js';

// A folder picked for the run wins over the folder saved on the instance.
export function resolveFolder(inst: Instance, override: FolderRef | undefined | null): FolderRef {
  const folder = override?.id ? override : { id: inst.folderId, path: inst.folderPath };
  // Without a folder ID, "list folder" returns every document on the instance, and "empty first" would delete them.
  if (!folder.id) throw new Error(`no folder chosen for ${inst.label}, and the instance has no default folder`);
  return folder;
}
