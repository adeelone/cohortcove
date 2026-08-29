import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { readUploadedFile } from "@/lib/storage";

/**
 * Serves validated uploads only — looked up by storageKey (random,
 * non-guessable), status must be CLEAN, and the response never trusts the
 * URL's file extension for Content-Type (always the DB-recorded mimeType).
 * Safe headers: nosniff + no inline script execution surface since only
 * PNG/JPEG/WebP are ever accepted.
 */
export async function GET(request: NextRequest, { params }: { params: { key: string } }) {
  const upload = await prisma.upload.findUnique({ where: { storageKey: params.key } });
  if (!upload || upload.status !== "CLEAN") {
    return new NextResponse("Not found.", { status: 404 });
  }

  const data = await readUploadedFile(upload.storageKey);
  if (!data) return new NextResponse("Not found.", { status: 404 });

  return new NextResponse(data, {
    headers: {
      "Content-Type": upload.mimeType,
      "X-Content-Type-Options": "nosniff",
      "Content-Disposition": "inline",
      "Cache-Control": "public, max-age=31536000, immutable",
    },
  });
}
