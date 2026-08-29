import crypto from "node:crypto";
import { prisma } from "@/lib/prisma";
import { storeUploadedFile } from "@/lib/storage";
import { getImageDimensions } from "@/lib/image-dimensions";

const ALLOWED_MIME_TYPES = new Set(["image/png", "image/jpeg", "image/webp"]);
const MAX_BYTES = 5 * 1024 * 1024; // 5MB
const MAX_DIMENSION = 4000; // px, either axis — guards against decompression-bomb-style images
const MIN_DIMENSION = 32;

export type UploadValidationResult =
  | { kind: "accepted"; uploadId: string; storageKey: string }
  | { kind: "rejected"; reason: string };

/**
 * Validates and stores an image upload (brief: "type/size/dimension
 * limits, random names, malware-scanning integration point, and safe
 * serving headers"). The malware scan itself is a documented integration
 * point (`scanUpload`) — no real scanner is wired up, so every upload
 * currently resolves straight to CLEAN. Do not treat PENDING_SCAN/CLEAN as
 * a real malware-scanning guarantee; see AUDIT.md.
 */
export async function validateAndStoreUpload(params: {
  ownerUserId: string;
  organizationId?: string | null;
  data: Buffer;
  mimeType: string;
}): Promise<UploadValidationResult> {
  if (!ALLOWED_MIME_TYPES.has(params.mimeType)) {
    return { kind: "rejected", reason: `Unsupported file type: ${params.mimeType}. Use PNG, JPEG, or WebP.` };
  }
  if (params.data.length === 0) {
    return { kind: "rejected", reason: "Empty file." };
  }
  if (params.data.length > MAX_BYTES) {
    return { kind: "rejected", reason: `File too large — max ${MAX_BYTES / (1024 * 1024)}MB.` };
  }

  const dimensions = getImageDimensions(params.data, params.mimeType);
  if (dimensions) {
    if (dimensions.width > MAX_DIMENSION || dimensions.height > MAX_DIMENSION) {
      return { kind: "rejected", reason: `Image too large — max ${MAX_DIMENSION}px on any side.` };
    }
    if (dimensions.width < MIN_DIMENSION || dimensions.height < MIN_DIMENSION) {
      return { kind: "rejected", reason: `Image too small — min ${MIN_DIMENSION}px on any side.` };
    }
  }

  const extension = params.mimeType === "image/png" ? "png" : params.mimeType === "image/webp" ? "webp" : "jpg";
  const storageKey = `${crypto.randomBytes(16).toString("hex")}.${extension}`;

  await storeUploadedFile(storageKey, params.data, params.mimeType);

  const upload = await prisma.upload.create({
    data: {
      ownerUserId: params.ownerUserId,
      organizationId: params.organizationId ?? null,
      storageKey,
      mimeType: params.mimeType,
      byteSize: params.data.length,
      width: dimensions?.width,
      height: dimensions?.height,
      status: "PENDING_SCAN",
    },
  });

  await scanUpload(upload.id);

  return { kind: "accepted", uploadId: upload.id, storageKey };
}

/**
 * Malware-scan integration point. No real scanner is wired up in this
 * build — this exists so a real scan (e.g. an antivirus API, a queued
 * ClamAV job) can be dropped in here without changing any caller. Marks
 * CLEAN immediately today; do not represent this as a real scan.
 */
export async function scanUpload(uploadId: string): Promise<void> {
  await prisma.upload.update({ where: { id: uploadId }, data: { status: "CLEAN" } });
}
