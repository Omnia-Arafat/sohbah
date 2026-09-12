import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database, Material } from "@/lib/database.types";
import { createAdminClient, isServiceRoleConfigured } from "@/lib/supabase/admin";

/** The bucket created in 20260912100000. Private — never a public URL. */
export const MATERIALS_BUCKET = "materials";

/**
 * Phase one is images only, matching the bucket's own `allowed_mime_types`.
 * The bucket is the real limit; these exist so a معلمة gets a sentence rather
 * than a raw storage error.
 */
export const MAX_UPLOAD_BYTES = 5 * 1024 * 1024;
export const ALLOWED_MIME = ["image/jpeg", "image/png", "image/webp"];
export const MAX_PER_OWNER = 10;

const EXTENSIONS: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
};

/**
 * Signs every stored object so a browser can load it.
 *
 * The bucket is private on purpose: these are lesson images for an academy of
 * girls, and a permanent public URL would be indexable and shareable forever.
 * A signed URL expires, which is the whole point — so it is minted per request
 * rather than stored anywhere.
 *
 * Materials that carry an external `url` (Drive, Canva, YouTube) pass straight
 * through: there is nothing of ours to sign.
 */
export async function withSignedUrls<
  T extends { url: string | null; storage_path: string | null },
>(materials: T[], expiresInSeconds = 60 * 60): Promise<(T & { href: string | null })[]> {
  const stored = materials.filter((material) => material.storage_path);

  if (stored.length === 0 || !isServiceRoleConfigured()) {
    return materials.map((material) => ({ ...material, href: material.url }));
  }

  const admin = createAdminClient();
  const { data, error } = await admin.storage
    .from(MATERIALS_BUCKET)
    .createSignedUrls(
      stored.map((material) => material.storage_path as string),
      expiresInSeconds,
    );

  if (error) {
    console.error("signing material urls failed", error);
    return materials.map((material) => ({ ...material, href: material.url }));
  }

  const signed = new Map(
    (data ?? []).map((entry) => [entry.path, entry.signedUrl] as const),
  );

  return materials.map((material) => ({
    ...material,
    href: material.storage_path
      ? (signed.get(material.storage_path) ?? null)
      : material.url,
  }));
}

export type UploadFailure =
  | "notConfigured"
  | "tooLarge"
  | "badType"
  | "tooMany"
  | "generic";

/**
 * Puts one image in the bucket and returns its object key.
 *
 * Uploading goes through the service-role client rather than the caller's: the
 * bucket carries no storage RLS policies, so authorization is decided here,
 * by the action that calls this, before the key is ever handed over. Keeping
 * the rule in one place beats a second policy language that has to agree with
 * the first.
 */
export async function uploadMaterialImage({
  file,
  academyId,
  ownerId,
}: {
  file: File;
  academyId: string;
  ownerId: string;
}): Promise<{ path: string } | { error: UploadFailure }> {
  if (!isServiceRoleConfigured()) return { error: "notConfigured" };
  if (file.size > MAX_UPLOAD_BYTES) return { error: "tooLarge" };
  if (!ALLOWED_MIME.includes(file.type)) return { error: "badType" };

  const extension = EXTENSIONS[file.type] ?? "bin";
  // The original filename is never used: it can carry anything, including
  // path separators and another student's name.
  const path = `${academyId}/${ownerId}/${crypto.randomUUID()}.${extension}`;

  const admin = createAdminClient();
  const { error } = await admin.storage
    .from(MATERIALS_BUCKET)
    .upload(path, file, { contentType: file.type, upsert: false });

  if (error) {
    console.error("material upload failed", error);
    return { error: "generic" };
  }

  return { path };
}

/** Removes the object as well as the row, so the bucket does not silently fill. */
export async function removeStoredObject(storagePath: string | null) {
  if (!storagePath || !isServiceRoleConfigured()) return;

  const admin = createAdminClient();
  const { error } = await admin.storage.from(MATERIALS_BUCKET).remove([storagePath]);
  if (error) console.error("material object delete failed", error);
}

export async function loadUnitMaterials(
  supabase: SupabaseClient<Database>,
  unitId: string,
): Promise<Material[]> {
  const { data, error } = await supabase
    .from("materials")
    .select("*")
    .eq("unit_id", unitId)
    .order("position")
    .order("created_at");

  if (error) {
    console.error("materials load failed", error);
    return [];
  }
  return data ?? [];
}
