"use client";

import { useState, useCallback } from "react";

type UploadResult = {
  urls: string[];
  error: string | null;
};

export function useImageUpload() {
  const [isUploading, setIsUploading] = useState(false);

  const upload = useCallback(
    async (prefix: "establishments" | "courts", files: File[]): Promise<UploadResult> => {
      if (!files.length) return { urls: [], error: null };

      setIsUploading(true);
      try {
        const res = await fetch("/api/uploads", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            prefix,
            files: files.map((f) => ({ name: f.name, type: f.type, size: f.size })),
          }),
        });

        const data = (await res.json().catch(() => null)) as
          | null
          | {
              error?: string;
              items?: Array<{ uploadUrl: string; publicUrl: string; contentType: string }>;
            };

        if (!res.ok) {
          return { urls: [], error: data?.error || "Erro ao preparar upload" };
        }

        const items = data?.items ?? [];
        if (!Array.isArray(items) || items.length !== files.length) {
          return { urls: [], error: "Resposta de upload inválida" };
        }

        await Promise.all(
          items.map(async (item, idx) => {
            const file = files[idx];
            const put = await fetch(item.uploadUrl, {
              method: "PUT",
              headers: { "Content-Type": item.contentType || file.type || "application/octet-stream" },
              body: file,
            });
            if (!put.ok) throw new Error("Falha no upload do arquivo");
          })
        );

        return { urls: items.map((i) => i.publicUrl), error: null };
      } catch (e) {
        return { urls: [], error: e instanceof Error ? e.message : "Erro ao fazer upload" };
      } finally {
        setIsUploading(false);
      }
    },
    []
  );

  return { upload, isUploading };
}