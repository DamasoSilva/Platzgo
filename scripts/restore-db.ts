import "dotenv/config";

import { spawn } from "child_process";
import fs from "fs/promises";
import path from "path";

function requireEnv(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`Env var ausente: ${name}`);
  return v;
}

async function findLatestBackup(dir: string): Promise<string | null> {
  const entries = await fs.readdir(dir, { withFileTypes: true });
  const dumps = entries.filter((e) => e.isFile() && e.name.endsWith(".dump"));
  if (!dumps.length) return null;

  const withStats = await Promise.all(
    dumps.map(async (e) => {
      const filePath = path.join(dir, e.name);
      const stat = await fs.stat(filePath);
      return { filePath, mtimeMs: stat.mtimeMs };
    })
  );

  withStats.sort((a, b) => b.mtimeMs - a.mtimeMs);
  return withStats[0]?.filePath ?? null;
}

async function run() {
  const databaseUrl = requireEnv("DATABASE_URL");
  const backupDir = process.env.BACKUP_DIR
    ? path.resolve(process.env.BACKUP_DIR)
    : path.resolve(process.cwd(), "backups");

  const argPath = process.argv[2];
  const envPath = process.env.BACKUP_FILE;
  const filePath = argPath
    ? path.resolve(argPath)
    : envPath
      ? path.resolve(envPath)
      : await findLatestBackup(backupDir);

  if (!filePath) {
    throw new Error("Nenhum backup encontrado para restaurar");
  }

  const args = ["--clean", "--if-exists", "-d", databaseUrl, filePath];
  const child = spawn("pg_restore", args, { stdio: "inherit" });

  const exitCode = await new Promise<number>((resolve) => {
    child.on("close", (code) => resolve(code ?? 1));
  });

  if (exitCode !== 0) {
    throw new Error(`pg_restore falhou com exit code ${exitCode}`);
  }

  console.log(`Restore concluído: ${filePath}`);
}

run().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
