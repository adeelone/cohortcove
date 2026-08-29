import { afterAll, describe, expect, it } from "vitest";
import { prisma } from "@/lib/prisma";
import { validateAndStoreUpload } from "@/server/uploads";

/** Builds a byte-valid-enough PNG (correct signature + IHDR width/height) for our sniffer, without a real image library. */
function fakePng(width: number, height: number): Buffer {
  const signature = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  const body = Buffer.alloc(24);
  signature.copy(body, 0);
  body.writeUInt32BE(width, 16);
  body.writeUInt32BE(height, 20);
  return Buffer.concat([body, Buffer.alloc(100)]); // padding so byte-size checks have something to measure
}

const describeWithDatabase = process.env.DATABASE_URL ? describe : describe.skip;

describeWithDatabase("upload validation", () => {
  let testUserId: string;

  it("rejects an unsupported mime type", async () => {
    const user = await prisma.user.create({ data: { email: `upload-test-${Date.now()}@example.demo` } });
    testUserId = user.id;
    const result = await validateAndStoreUpload({
      ownerUserId: testUserId,
      data: fakePng(200, 200),
      mimeType: "image/gif",
    });
    expect(result.kind).toBe("rejected");
  });

  it("rejects an oversized file", async () => {
    const oversized = Buffer.concat([fakePng(200, 200), Buffer.alloc(6 * 1024 * 1024)]);
    const result = await validateAndStoreUpload({ ownerUserId: testUserId, data: oversized, mimeType: "image/png" });
    expect(result.kind).toBe("rejected");
  });

  it("rejects a too-small image by dimensions", async () => {
    const result = await validateAndStoreUpload({
      ownerUserId: testUserId,
      data: fakePng(8, 8),
      mimeType: "image/png",
    });
    expect(result).toEqual(expect.objectContaining({ kind: "rejected" }));
  });

  it("rejects an oversized image by dimensions", async () => {
    const result = await validateAndStoreUpload({
      ownerUserId: testUserId,
      data: fakePng(5000, 5000),
      mimeType: "image/png",
    });
    expect(result.kind).toBe("rejected");
  });

  it("accepts a valid PNG, stores it with a random key, and marks it CLEAN", async () => {
    const result = await validateAndStoreUpload({
      ownerUserId: testUserId,
      data: fakePng(400, 300),
      mimeType: "image/png",
    });
    expect(result.kind).toBe("accepted");
    if (result.kind === "accepted") {
      expect(result.storageKey).toMatch(/^[0-9a-f]{32}\.png$/);
      const upload = await prisma.upload.findUnique({ where: { id: result.uploadId } });
      expect(upload?.status).toBe("CLEAN");
      expect(upload?.width).toBe(400);
      expect(upload?.height).toBe(300);
    }
  });

  afterAll(async () => {
    await prisma.upload.deleteMany({ where: { ownerUserId: testUserId } });
    await prisma.user.deleteMany({ where: { id: testUserId } });
    await prisma.$disconnect();
  });
});
