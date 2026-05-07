import { randomUUID } from "node:crypto";
import { mkdir, rm, symlink, writeFile } from "node:fs/promises";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { PHOTO_STORAGE_ROOT, readStoredPhoto } from "@/lib/server/photo-storage";

afterEach(async () => {
  await rm(PHOTO_STORAGE_ROOT, { force: true, recursive: true });
});

describe("readStoredPhoto", () => {
  it("returns stored photos from the server upload directory", async () => {
    await mkdir(PHOTO_STORAGE_ROOT, { recursive: true });
    const fileName = `${randomUUID()}.jpg`;
    const filePath = path.join(PHOTO_STORAGE_ROOT, fileName);
    const body = Buffer.from("walkable-photo");

    await writeFile(filePath, body);

    const result = await readStoredPhoto([fileName]);

    expect(result?.contentType).toBe("image/jpeg");
    expect(result?.body.equals(body)).toBe(true);
  });

  it("rejects path traversal attempts", async () => {
    expect(await readStoredPhoto(["../secrets.txt"])).toBeNull();
    expect(await readStoredPhoto([".."])).toBeNull();
    expect(await readStoredPhoto(["nested/file.jpg"])).toBeNull();
  });

  it("rejects symlinked files", async () => {
    await mkdir(PHOTO_STORAGE_ROOT, { recursive: true });
    const targetPath = path.join(PHOTO_STORAGE_ROOT, `${randomUUID()}.jpg`);
    const linkName = `${randomUUID()}.jpg`;
    const linkPath = path.join(PHOTO_STORAGE_ROOT, linkName);

    await writeFile(targetPath, Buffer.from("linked-photo"));
    await symlink(targetPath, linkPath);

    await expect(readStoredPhoto([linkName])).resolves.toBeNull();
  });
});
