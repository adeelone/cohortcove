import fs from "node:fs/promises";
import path from "node:path";

/**
 * Object storage for validated organization/event images only (brief
 * boundary). Local dev defaults to on-disk storage under
 * .local-uploads/, served through /api/uploads/[key] with safe headers.
 * Production sets STORAGE_ADAPTER=supabase to use a real Supabase Storage
 * bucket via its REST API (no extra SDK dependency needed for simple
 * upload/read).
 */
export interface StoredFile {
  key: string;
}

export async function storeUploadedFile(key: string, data: Buffer, contentType: string): Promise<StoredFile> {
  const adapter = process.env.STORAGE_ADAPTER ?? "local";

  if (adapter === "local") {
    const dir = path.join(process.cwd(), ".local-uploads");
    await fs.mkdir(dir, { recursive: true });
    await fs.writeFile(path.join(dir, key), data);
    return { key };
  }

  if (adapter === "supabase") {
    const url = process.env.SUPABASE_URL;
    const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
    const bucket = process.env.SUPABASE_STORAGE_BUCKET ?? "cohortcove-uploads";
    if (!url || !serviceKey) {
      throw new Error("SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY must be set when STORAGE_ADAPTER=supabase.");
    }
    const response = await fetch(`${url}/storage/v1/object/${bucket}/${key}`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${serviceKey}`,
        "Content-Type": contentType,
        "x-upsert": "false",
      },
      body: new Uint8Array(data),
    });
    if (!response.ok) {
      throw new Error(`Supabase Storage upload failed: ${response.status} ${await response.text()}`);
    }
    return { key };
  }

  throw new Error(`Unknown STORAGE_ADAPTER: ${adapter}`);
}

export async function readUploadedFile(key: string): Promise<Buffer | null> {
  const adapter = process.env.STORAGE_ADAPTER ?? "local";

  if (adapter === "local") {
    try {
      return await fs.readFile(path.join(process.cwd(), ".local-uploads", key));
    } catch {
      return null;
    }
  }

  if (adapter === "supabase") {
    const url = process.env.SUPABASE_URL;
    const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
    const bucket = process.env.SUPABASE_STORAGE_BUCKET ?? "cohortcove-uploads";
    if (!url || !serviceKey) return null;
    const response = await fetch(`${url}/storage/v1/object/${bucket}/${key}`, {
      headers: { Authorization: `Bearer ${serviceKey}` },
    });
    if (!response.ok) return null;
    return Buffer.from(await response.arrayBuffer());
  }

  return null;
}
