type Mode = "read" | "readwrite";

type PermissionCapable = FileSystemHandle & {
  queryPermission?: (descriptor?: { mode?: Mode }) => Promise<PermissionState>;
  requestPermission?: (descriptor?: { mode?: Mode }) => Promise<PermissionState>;
};

type DirectoryPicker = (options?: {
  id?: string;
  mode?: Mode;
  startIn?: string;
}) => Promise<FileSystemDirectoryHandle>;

export function supportsFileSystemAccess(): boolean {
  return typeof window !== "undefined" && "showDirectoryPicker" in window;
}

export async function pickWorkspaceDirectory(): Promise<FileSystemDirectoryHandle> {
  const picker = (window as unknown as { showDirectoryPicker?: DirectoryPicker }).showDirectoryPicker;
  if (!picker) {
    throw new Error(
      "This browser does not support local folder access. Use Chrome or Edge on desktop.",
    );
  }
  return picker({ id: "cv-studio-workspace", mode: "readwrite" });
}

export async function verifyPermission(
  handle: FileSystemHandle,
  mode: Mode = "readwrite",
  request = true,
): Promise<boolean> {
  const capable = handle as PermissionCapable;
  if (!capable.queryPermission) return true;
  if ((await capable.queryPermission({ mode })) === "granted") return true;
  if (!request) return false;
  return (await capable.requestPermission?.({ mode })) === "granted";
}

export async function getDirectory(
  root: FileSystemDirectoryHandle,
  path: string[],
  create = true,
): Promise<FileSystemDirectoryHandle> {
  let current = root;
  for (const segment of path) {
    current = await current.getDirectoryHandle(segment, { create });
  }
  return current;
}

export async function getFile(
  root: FileSystemDirectoryHandle,
  path: string[],
  create = true,
): Promise<FileSystemFileHandle> {
  const fileName = path[path.length - 1];
  const directory = path.length > 1 ? await getDirectory(root, path.slice(0, -1), create) : root;
  return directory.getFileHandle(fileName, { create });
}

export async function readText(
  root: FileSystemDirectoryHandle,
  path: string[],
): Promise<string | null> {
  try {
    const handle = await getFile(root, path, false);
    return await (await handle.getFile()).text();
  } catch (error) {
    if ((error as DOMException).name === "NotFoundError") return null;
    throw error;
  }
}

export async function writeText(
  root: FileSystemDirectoryHandle,
  path: string[],
  content: string,
): Promise<void> {
  const handle = await getFile(root, path, true);
  const writable = await handle.createWritable();
  await writable.write(content);
  await writable.close();
}

export async function writeBinary(
  root: FileSystemDirectoryHandle,
  path: string[],
  content: Uint8Array,
): Promise<void> {
  const handle = await getFile(root, path, true);
  const writable = await handle.createWritable();
  await writable.write(content);
  await writable.close();
}

export async function readJson<T>(
  root: FileSystemDirectoryHandle,
  path: string[],
): Promise<T | null> {
  const text = await readText(root, path);
  if (text == null || !text.trim()) return null;
  return JSON.parse(text) as T;
}

export async function writeJson(
  root: FileSystemDirectoryHandle,
  path: string[],
  value: unknown,
): Promise<void> {
  await writeText(root, path, `${JSON.stringify(value, null, 2)}\n`);
}

export async function exists(
  root: FileSystemDirectoryHandle,
  path: string[],
): Promise<boolean> {
  try {
    await getFile(root, path, false);
    return true;
  } catch {
    return false;
  }
}

export async function listDirectories(
  root: FileSystemDirectoryHandle,
  path: string[] = [],
): Promise<FileSystemDirectoryHandle[]> {
  const directory = path.length ? await getDirectory(root, path, false) : root;
  const entries: FileSystemDirectoryHandle[] = [];
  const iterable = directory as unknown as {
    values: () => AsyncIterableIterator<FileSystemHandle>;
  };
  for await (const entry of iterable.values()) {
    if (entry.kind === "directory") entries.push(entry as FileSystemDirectoryHandle);
  }
  return entries;
}

export async function removeFile(
  root: FileSystemDirectoryHandle,
  path: string[],
): Promise<void> {
  try {
    const directory = path.length > 1 ? await getDirectory(root, path.slice(0, -1), false) : root;
    await directory.removeEntry(path[path.length - 1]);
  } catch (error) {
    if ((error as DOMException).name !== "NotFoundError") throw error;
  }
}
