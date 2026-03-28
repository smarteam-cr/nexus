import { createClient } from "@supabase/supabase-js";

const SUPABASE_URL = process.env.SUPABASE_URL ?? "https://zaffrqpoogmocmvsivod.supabase.co";
const SUPABASE_SECRET_KEY = process.env.SUPABASE_SECRET_KEY ?? "";

/**
 * Supabase client for Storage operations (server-side only).
 * Uses the service role key for full access.
 */
export const supabaseStorage = createClient(SUPABASE_URL, SUPABASE_SECRET_KEY, {
  auth: { persistSession: false },
});

export const BUCKET_NAME = "client-documents";
export const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB

/**
 * Ensure the storage bucket exists. Call once on first upload.
 */
export async function ensureBucket() {
  const { data } = await supabaseStorage.storage.getBucket(BUCKET_NAME);
  if (!data) {
    await supabaseStorage.storage.createBucket(BUCKET_NAME, {
      public: false,
      fileSizeLimit: MAX_FILE_SIZE,
      allowedMimeTypes: [
        "application/pdf",
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "application/vnd.ms-excel",
        "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        "application/msword",
        "text/plain",
        "text/csv",
        "image/png",
        "image/jpeg",
        "image/webp",
      ],
    });
  }
}

/**
 * Generate a storage path for a client document.
 */
export function storagePath(clientId: string, projectId: string, fileName: string): string {
  const timestamp = Date.now();
  const safe = fileName.replace(/[^a-zA-Z0-9._-]/g, "_");
  return `${clientId}/${projectId}/${timestamp}_${safe}`;
}

/**
 * Get a signed URL for downloading a file.
 */
export async function getSignedUrl(path: string, expiresIn = 3600): Promise<string | null> {
  const { data, error } = await supabaseStorage.storage
    .from(BUCKET_NAME)
    .createSignedUrl(path, expiresIn);
  if (error) return null;
  return data.signedUrl;
}
