-- AlterTable
ALTER TABLE "EventSeries" ADD COLUMN     "imageUploadId" TEXT;

-- AlterTable
ALTER TABLE "Organization" ADD COLUMN     "logoUploadId" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "EventSeries_imageUploadId_key" ON "EventSeries"("imageUploadId");

-- CreateIndex
CREATE UNIQUE INDEX "Organization_logoUploadId_key" ON "Organization"("logoUploadId");

-- AddForeignKey
ALTER TABLE "Organization" ADD CONSTRAINT "Organization_logoUploadId_fkey" FOREIGN KEY ("logoUploadId") REFERENCES "Upload"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EventSeries" ADD CONSTRAINT "EventSeries_imageUploadId_fkey" FOREIGN KEY ("imageUploadId") REFERENCES "Upload"("id") ON DELETE SET NULL ON UPDATE CASCADE;
