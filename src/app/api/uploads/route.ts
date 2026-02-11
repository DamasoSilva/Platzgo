import { NextResponse } from "next/server";

import crypto from "crypto";
import path from "path";

import { PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getStorageConfig } from "@/lib/storage";
import { logError, logInfo } from "@/lib/logger";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_FILES = 10;
const MAX_IMAGE_SIZE_BYTES = 5 * 1024 * 1024; // 5MB
const MAX_VIDEO_SIZE_BYTES = 50 * 1024 * 1024; // 50MB
const SIGNED_URL_EXPIRES_SECONDS = 60;

function sanitizeExt(filename: string, contentType: string): string {
  const byName = path.extname(filename).toLowerCase();

  // Prioriza MIME type para evitar mismatch entre nome e tipo.
  if (contentType === "image/jpeg") return byName === ".jpeg" ? ".jpeg" : ".jpg";
  if (contentType === "image/png") return ".png";
  if (contentType === "image/webp") return ".webp";
  if (contentType === "video/mp4") return ".mp4";
  if (contentType === "video/webm") return ".webm";

  // Fallback: apenas extensões conhecidas
  if ([".jpg", ".jpeg", ".png", ".webp", ".mp4", ".webm"].includes(byName)) return byName;

  // Default seguro
  return ".jpg";
}

function isAllowedContentType(type: string): boolean {
  return (
    type === "image/jpeg" ||
    type === "image/png" ||
    type === "image/webp" ||
    type === "video/mp4" ||
    type === "video/webm"
  );
}

function buildPublicUrl(base: string, key: string): string {
  return `${base.replace(/\/+$/, "")}/${key.replace(/^\/+/, "")}`;
}

function sanitizeEmailFolder(email: string, fallback: string): string {
  const safe = email
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return safe || fallback;
}

function normalizeEmail(value: string): string {
  return value.trim().toLowerCase();
}

function isValidEmail(value: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

function getS3Client() {
  const { region, accessKeyId, secretAccessKey, endpoint } = getStorageConfig();

  return new S3Client({
    region,
    endpoint: endpoint || undefined,
    credentials: { accessKeyId, secretAccessKey },
    forcePathStyle: Boolean(endpoint),
  });
}

export async function POST(req: Request) {
  try {
    const session = await getServerSession(authOptions);
    const userId = session?.user?.id;

    const body = (await req.json().catch(() => null)) as
      | null
      | {
          files?: Array<{ name: string; type: string; size: number }>;
          prefix?: "establishments" | "courts" | "users";
          email?: string;
          roleIntent?: "OWNER" | "CUSTOMER";
        };

    const files = body?.files ?? [];
    if (!Array.isArray(files) || files.length === 0) {
      return NextResponse.json({ error: "Nenhum arquivo enviado" }, { status: 400 });
    }
    if (files.length > MAX_FILES) {
      return NextResponse.json({ error: `Envie no máximo ${MAX_FILES} arquivos` }, { status: 400 });
    }

    const { bucket, publicBaseUrl } = getStorageConfig();
    const prefix = body?.prefix ?? "establishments";
    if (prefix !== "establishments" && prefix !== "courts" && prefix !== "users") {
      return NextResponse.json({ error: "Prefixo inválido" }, { status: 400 });
    }

    let userEmail: string | null = null;
    let roleFolder: "owners" | "customers" | "sysadmins" = "customers";
    let userFolderFallback = "user";

    if (userId) {
      const user = await prisma.user.findUnique({
        where: { id: userId },
        select: { email: true, role: true },
      });

      if (!user?.email) {
        return NextResponse.json({ error: "Usuario invalido" }, { status: 400 });
      }

      userEmail = normalizeEmail(user.email);
      roleFolder =
        user.role === "ADMIN" ? "owners" : user.role === "CUSTOMER" ? "customers" : "sysadmins";
      userFolderFallback = userId;
    } else {
      const rawEmail = typeof body?.email === "string" ? normalizeEmail(body.email) : "";
      const roleIntent = body?.roleIntent;
      if (!rawEmail || !isValidEmail(rawEmail)) {
        return NextResponse.json({ error: "Email invalido" }, { status: 400 });
      }
      if (roleIntent !== "OWNER" && roleIntent !== "CUSTOMER") {
        return NextResponse.json({ error: "Role invalida" }, { status: 400 });
      }
      if (roleIntent === "OWNER" && prefix !== "establishments") {
        return NextResponse.json({ error: "Prefixo invalido para cadastro" }, { status: 400 });
      }
      if (roleIntent === "CUSTOMER" && prefix !== "users") {
        return NextResponse.json({ error: "Prefixo invalido para cadastro" }, { status: 400 });
      }

      userEmail = rawEmail;
      roleFolder = roleIntent === "OWNER" ? "owners" : "customers";
      userFolderFallback = rawEmail;
    }

    if (!userEmail) {
      return NextResponse.json({ error: "Email invalido" }, { status: 400 });
    }

    const userFolder = sanitizeEmailFolder(userEmail, userFolderFallback);
    const scopedPrefix = `${prefix}/${roleFolder}/${userFolder}`;

    const s3 = getS3Client();

    const items = await Promise.all(
      files.map(async (file) => {
        if (!file?.type || !isAllowedContentType(file.type)) {
          throw new Error("Apenas imagens (JPG/PNG/WebP) e vídeos (MP4/WebM) são permitidos");
        }
        if (!Number.isFinite(file.size) || file.size <= 0) {
          throw new Error("Tamanho do arquivo inválido");
        }

        const maxBytes = file.type.startsWith("video/") ? MAX_VIDEO_SIZE_BYTES : MAX_IMAGE_SIZE_BYTES;
        if (file.size > maxBytes) {
          const label = file.type.startsWith("video/") ? "Vídeo" : "Imagem";
          throw new Error(`${label} muito grande (máx ${(maxBytes / 1024 / 1024).toFixed(0)}MB)`);
        }

        const ext = sanitizeExt(file.name, file.type);
        const key = `${scopedPrefix}/${crypto.randomUUID()}${ext}`;

        const cmd = new PutObjectCommand({
          Bucket: bucket,
          Key: key,
          ContentType: file.type,
          CacheControl: "public, max-age=31536000, immutable",
        });

        const uploadUrl = await getSignedUrl(s3, cmd, { expiresIn: SIGNED_URL_EXPIRES_SECONDS });
        const publicUrl = buildPublicUrl(publicBaseUrl, key);

        return {
          key,
          uploadUrl,
          publicUrl,
          contentType: file.type,
        };
      })
    );

    logInfo("upload.presign.ok", { count: items.length, prefix: scopedPrefix });
    return NextResponse.json({ items });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Erro ao fazer upload";
    logError("upload.presign.error", { message });
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
