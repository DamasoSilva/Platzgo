export type StorageConfig = {
  region: string;
  accessKeyId: string;
  secretAccessKey: string;
  endpoint?: string;
  bucket: string;
  publicBaseUrl: string;
};

export function getStorageConfig(): StorageConfig {
  const region = requireEnv("S3_REGION");
  const accessKeyId = requireEnv("S3_ACCESS_KEY_ID");
  const secretAccessKey = requireEnv("S3_SECRET_ACCESS_KEY");
  const bucket = requireEnv("S3_BUCKET");
  const publicBaseUrl = requireEnv("S3_PUBLIC_BASE_URL");
  const endpoint = process.env.S3_ENDPOINT || undefined;

  if (endpoint && /(localhost|127\.0\.0\.1):9001\b/.test(endpoint)) {
    throw new Error(
      "S3_ENDPOINT está apontando para a porta 9001 (console do MinIO). Use http://127.0.0.1:9000 (S3 API)."
    );
  }

  return { region, accessKeyId, secretAccessKey, bucket, publicBaseUrl, endpoint };
}

export function isStorageConfigured(): boolean {
  return Boolean(
    process.env.S3_REGION &&
      process.env.S3_ACCESS_KEY_ID &&
      process.env.S3_SECRET_ACCESS_KEY &&
      process.env.S3_BUCKET &&
      process.env.S3_PUBLIC_BASE_URL
  );
}

function requireEnv(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`Env var ausente: ${name}`);
  return v;
}
