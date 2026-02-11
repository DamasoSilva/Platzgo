import "dotenv/config";

import { spawn } from "child_process";
import fs from "fs/promises";
import fsSync from "fs";
import path from "path";
import { PutObjectCommand, S3Client } from "@aws-sdk/client-s3";

import { getStorageConfig, isStorageConfigured } from "@/lib/storage";

function requireEnv(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`Env var ausente: ${name}`);
  return v;
}

function formatTimestamp(d: Date): string {
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  const hh = String(d.getHours()).padStart(2, "0");
  const mi = String(d.getMinutes()).padStart(2, "0");
  const ss = String(d.getSeconds()).padStart(2, "0");
  return `${yyyy}${mm}${dd}_${hh}${mi}${ss}`;
}

async function ensureDir(dir: string) {
  await fs.mkdir(dir, { recursive: true });
}

async function cleanupOldBackups(dir: string, retentionDays: number) {
  if (!retentionDays || retentionDays <= 0) return;
  const entries = await fs.readdir(dir, { withFileTypes: true });
  const now = Date.now();
  const maxAgeMs = retentionDays * 24 * 60 * 60 * 1000;

  await Promise.all(
    entries
      .filter((e) => e.isFile() && e.name.endsWith(".dump"))
      .map(async (e) => {
        const filePath = path.join(dir, e.name);
        const stat = await fs.stat(filePath);
        if (now - stat.mtimeMs > maxAgeMs) {
          await fs.unlink(filePath);
        }
      })
  );
}

async function uploadToS3(filePath: string) {
  if (!isStorageConfigured()) {
    throw new Error("Storage S3 não configurado para upload de backup");
  }

  const { region, accessKeyId, secretAccessKey, endpoint, bucket } = getStorageConfig();
  const prefix = (process.env.BACKUP_S3_PREFIX ?? "backups").replace(/^\/+|\/+$/g, "");
  const key = `${prefix}/${path.basename(filePath)}`;

  const s3 = new S3Client({
    region,
    endpoint: endpoint || undefined,
    credentials: { accessKeyId, secretAccessKey },
    forcePathStyle: Boolean(endpoint),
  });

  const body = fsSync.createReadStream(filePath);
  await s3.send(
    new PutObjectCommand({
      Bucket: bucket,
      Key: key,
      Body: body,
      ContentType: "application/octet-stream",
    })
  );

  console.log(`Backup enviado para S3: s3://${bucket}/${key}`);
}

async function run() {
  const databaseUrl = requireEnv("DATABASE_URL");
  const backupDir = process.env.BACKUP_DIR
    ? path.resolve(process.env.BACKUP_DIR)
    : path.resolve(process.cwd(), "backups");
  const retentionDays = Number(process.env.BACKUP_RETENTION_DAYS ?? "14");

  await ensureDir(backupDir);

  const fileName = `backup_${formatTimestamp(new Date())}.dump`;
  const filePath = path.join(backupDir, fileName);

  const args = ["-Fc", "-f", filePath, databaseUrl];
  const child = spawn("pg_dump", args, { stdio: "inherit" });

  const exitCode = await new Promise<number>((resolve) => {
    child.on("close", (code) => resolve(code ?? 1));
  });

  if (exitCode !== 0) {
    throw new Error(`pg_dump falhou com exit code ${exitCode}`);
  }

  if (process.env.BACKUP_UPLOAD_S3 === "1") {
    await uploadToS3(filePath);
  }

  await cleanupOldBackups(backupDir, retentionDays);
  console.log(`Backup criado: ${filePath}`);
}

run().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
