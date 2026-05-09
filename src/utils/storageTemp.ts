import crypto from "crypto";
import fs from "fs/promises";
import path from "path";

export type StorageUploadRecord = {
  id: string;
  fileName: string;
  mimeType: string;
  size: number;
  sha256: string;
  url: string;
  expiresAtMs: number;
  createdAtMs: number;
  filePath: string;
};

export const storageTempDir = process.env.STORAGE_TEMP_DIR || path.join(process.cwd(), "storage_uploads");
export const storageDefaultTtlSeconds = Number(process.env.STORAGE_TEMP_UPLOAD_TTL_SECONDS || "1800");

function metadataPath(id: string) {
  return path.join(storageTempDir, `${id}.json`);
}

function dataPath(id: string) {
  return path.join(storageTempDir, `${id}.bin`);
}

function assertStorageId(id: string) {
  if (!/^[a-f0-9-]{36}$/i.test(id)) throw new Error("Invalid storage upload id");
}

export function sha256(buffer: Buffer) {
  return crypto.createHash("sha256").update(buffer).digest("hex");
}

export function clampTtlSeconds(value: unknown) {
  const parsed = Number(value || storageDefaultTtlSeconds);
  if (!Number.isFinite(parsed) || parsed <= 0) return storageDefaultTtlSeconds;
  return Math.min(Math.floor(parsed), 24 * 60 * 60);
}

export async function ensureStorageTempDir() {
  await fs.mkdir(storageTempDir, { recursive: true });
}

export async function writeStorageUpload(
  file: Express.Multer.File,
  ttlSecondsInput?: unknown,
  publicBaseUrl?: string
): Promise<StorageUploadRecord> {
  await ensureStorageTempDir();

  const id = crypto.randomUUID();
  const createdAtMs = Date.now();
  const expiresAtMs = createdAtMs + clampTtlSeconds(ttlSecondsInput) * 1000;
  const baseUrl = String(publicBaseUrl || "http://localhost:3002").replace(/\/+$/, "");
  const filePath = dataPath(id);
  const record: StorageUploadRecord = {
    id,
    fileName: file.originalname || "upload.bin",
    mimeType: file.mimetype || "application/octet-stream",
    size: file.size,
    sha256: sha256(file.buffer),
    url: `${baseUrl}/storage/uploads/${id}`,
    expiresAtMs,
    createdAtMs,
    filePath,
  };

  await fs.writeFile(filePath, file.buffer);
  await fs.writeFile(metadataPath(id), JSON.stringify(record, null, 2));
  return record;
}

export async function readStorageUpload(id: string): Promise<StorageUploadRecord | null> {
  assertStorageId(id);
  try {
    const raw = await fs.readFile(metadataPath(id), "utf8");
    const record = JSON.parse(raw) as StorageUploadRecord;
    if (Date.now() > Number(record.expiresAtMs || 0)) {
      await deleteStorageUpload(id);
      return null;
    }
    return record;
  } catch {
    return null;
  }
}

export async function deleteStorageUpload(id: string) {
  assertStorageId(id);
  await Promise.allSettled([fs.unlink(dataPath(id)), fs.unlink(metadataPath(id))]);
}

export async function cleanupExpiredStorageUploads() {
  await ensureStorageTempDir();
  const entries = await fs.readdir(storageTempDir);
  const metadataFiles = entries.filter((entry) => entry.endsWith(".json"));

  await Promise.all(
    metadataFiles.map(async (entry) => {
      const id = entry.slice(0, -5);
      try {
        const raw = await fs.readFile(path.join(storageTempDir, entry), "utf8");
        const record = JSON.parse(raw) as StorageUploadRecord;
        if (Date.now() > Number(record.expiresAtMs || 0)) await deleteStorageUpload(id);
      } catch {
        await Promise.allSettled([fs.unlink(path.join(storageTempDir, entry)), fs.unlink(dataPath(id))]);
      }
    })
  );
}
