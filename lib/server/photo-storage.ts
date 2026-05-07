import { randomUUID } from "node:crypto";
import { lstat, mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

export const PHOTO_STORAGE_ROOT = path.join(process.cwd(), "storage", "photos");
const MAX_FILE_SIZE_BYTES = 10 * 1024 * 1024;
const MIME_BY_EXTENSION: Record<string, string> = {
  ".avif": "image/avif",
  ".gif": "image/gif",
  ".jpeg": "image/jpeg",
  ".jpg": "image/jpeg",
  ".png": "image/png",
  ".webp": "image/webp",
};

export async function saveUploadedPhoto(file: File): Promise<{ publicId: string; url: string }> {
  if (!file || file.size === 0) {
    throw new Error("Photo file is required");
  }

  if (!file.type.startsWith("image/")) {
    throw new Error("Only image uploads are allowed");
  }

  if (file.size > MAX_FILE_SIZE_BYTES) {
    throw new Error("Photo exceeds maximum file size");
  }

  const extension = resolveExtension(file);
  const fileName = `${randomUUID()}${extension}`;
  const filePath = path.join(PHOTO_STORAGE_ROOT, fileName);

  await mkdir(PHOTO_STORAGE_ROOT, { recursive: true });
  await writeFile(filePath, Buffer.from(await file.arrayBuffer()));

  return {
    publicId: fileName,
    url: `/uploads/${fileName}`,
  };
}

export async function readStoredPhoto(slug: string[]): Promise<{ body: Buffer; contentType: string } | null> {
  if (slug.length !== 1) {
    return null;
  }

  const fileName = slug[0];
  if (!fileName || fileName.includes("/") || fileName.includes("\\") || fileName.includes("..")) {
    return null;
  }

  const storageRoot = path.resolve(PHOTO_STORAGE_ROOT);
  const filePath = path.resolve(storageRoot, fileName);
  if (filePath !== path.join(storageRoot, fileName)) {
    return null;
  }

  try {
    const stats = await lstat(filePath);
    if (stats.isSymbolicLink()) {
      return null;
    }

    const body = await readFile(filePath);
    return {
      body,
      contentType: contentTypeForFile(fileName),
    };
  } catch {
    return null;
  }
}

function resolveExtension(file: File): string {
  const providedExtension = path.extname(file.name).toLowerCase();
  if (providedExtension && MIME_BY_EXTENSION[providedExtension]) {
    return providedExtension;
  }

  const byMimeType = Object.entries(MIME_BY_EXTENSION).find(([, mimeType]) => mimeType === file.type)?.[0];
  return byMimeType ?? ".jpg";
}

function contentTypeForFile(fileName: string): string {
  return MIME_BY_EXTENSION[path.extname(fileName).toLowerCase()] ?? "application/octet-stream";
}
