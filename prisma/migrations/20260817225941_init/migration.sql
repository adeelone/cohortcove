-- CreateEnum
CREATE TYPE "MembershipRole" AS ENUM ('STUDENT', 'STAFF_SPONSOR', 'CAMPUS_MODERATOR', 'INSTITUTION_ADMIN');

-- CreateEnum
CREATE TYPE "MembershipStatus" AS ENUM ('PENDING_VERIFICATION', 'ACTIVE', 'SUSPENDED');

-- CreateEnum
CREATE TYPE "ProfileVisibility" AS ENUM ('PRIVATE', 'ORGANIZATION_MEMBERS');

-- CreateEnum
CREATE TYPE "OrganizationVerificationState" AS ENUM ('REQUESTED', 'UNDER_REVIEW', 'CHANGES_REQUESTED', 'APPROVED', 'SUSPENDED', 'REJECTED');

-- CreateEnum
CREATE TYPE "OrganizationMemberRole" AS ENUM ('MEMBER', 'OFFICER');

-- CreateEnum
CREATE TYPE "EventFormat" AS ENUM ('IN_PERSON', 'ONLINE', 'HYBRID');

-- CreateEnum
CREATE TYPE "EventApprovalStatus" AS ENUM ('DRAFT', 'PENDING_APPROVAL', 'PUBLISHED', 'CHANGES_REQUESTED', 'CANCELED');

-- CreateEnum
CREATE TYPE "RsvpStatus" AS ENUM ('GOING', 'CANCELED');

-- CreateEnum
CREATE TYPE "WaitlistStatus" AS ENUM ('WAITING', 'PROMOTED', 'EXPIRED', 'CANCELED');

-- CreateEnum
CREATE TYPE "NotificationType" AS ENUM ('VERIFICATION', 'ORG_APPROVAL', 'RSVP_CONFIRMATION', 'WAITLIST_PROMOTION', 'EVENT_REMINDER', 'EVENT_MATERIAL_CHANGE', 'EVENT_CANCELLATION', 'MODERATION_UPDATE');

-- CreateEnum
CREATE TYPE "ReportTargetType" AS ENUM ('EVENT_SERIES', 'ORGANIZATION');

-- CreateEnum
CREATE TYPE "ReportReasonCode" AS ENUM ('SCAM', 'HARASSMENT', 'DISCRIMINATION', 'DANGEROUS_ACTIVITY', 'IMPERSONATION', 'SPAM', 'INACCURATE_DETAILS', 'ACCESSIBILITY_CONCERN', 'OTHER');

-- CreateEnum
CREATE TYPE "ReportStatus" AS ENUM ('OPEN', 'IN_REVIEW', 'RESOLVED', 'DISMISSED');

-- CreateEnum
CREATE TYPE "ModerationCaseState" AS ENUM ('OPEN', 'ACTION_TAKEN', 'CLOSED');

-- CreateEnum
CREATE TYPE "ModerationActionType" AS ENUM ('REQUEST_CHANGES', 'UNPUBLISH', 'RESTORE', 'SUSPEND_ORGANIZATION', 'SUSPEND_OFFICER', 'ESCALATE', 'DISMISS');

-- CreateEnum
CREATE TYPE "AppealState" AS ENUM ('SUBMITTED', 'UNDER_REVIEW', 'GRANTED', 'DENIED');

-- CreateEnum
CREATE TYPE "UploadStatus" AS ENUM ('PENDING_SCAN', 'CLEAN', 'REJECTED');

-- CreateTable
CREATE TABLE "Institution" (
    "id" TEXT NOT NULL,
    "publicId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "timeZone" TEXT NOT NULL,
    "isDemo" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Institution_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AllowedDomain" (
    "id" TEXT NOT NULL,
    "institutionId" TEXT NOT NULL,
    "domain" TEXT NOT NULL,
    "role" "MembershipRole" NOT NULL DEFAULT 'STUDENT',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AllowedDomain_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Campus" (
    "id" TEXT NOT NULL,
    "institutionId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Campus_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "publicId" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "passwordHash" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "InstitutionalMembership" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "institutionId" TEXT NOT NULL,
    "role" "MembershipRole" NOT NULL DEFAULT 'STUDENT',
    "status" "MembershipStatus" NOT NULL DEFAULT 'PENDING_VERIFICATION',
    "verifiedEmail" TEXT NOT NULL,
    "verificationTokenHash" TEXT,
    "verificationSentAt" TIMESTAMP(3),
    "verifiedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "InstitutionalMembership_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Profile" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "displayName" TEXT NOT NULL,
    "interests" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "visibility" "ProfileVisibility" NOT NULL DEFAULT 'PRIVATE',
    "notifyEmail" BOOLEAN NOT NULL DEFAULT true,
    "notifyInApp" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Profile_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Organization" (
    "id" TEXT NOT NULL,
    "publicId" TEXT NOT NULL,
    "institutionId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "categoryId" TEXT,
    "contactChannel" TEXT NOT NULL,
    "isOfficialDepartment" BOOLEAN NOT NULL DEFAULT false,
    "verificationState" "OrganizationVerificationState" NOT NULL DEFAULT 'REQUESTED',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Organization_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OrganizationMembership" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "role" "OrganizationMemberRole" NOT NULL DEFAULT 'MEMBER',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "OrganizationMembership_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OrganizationVerification" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "state" "OrganizationVerificationState" NOT NULL,
    "evidenceNote" TEXT NOT NULL,
    "reasonCode" TEXT,
    "reviewedBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "OrganizationVerification_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SponsorRelationship" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "sponsorName" TEXT NOT NULL,
    "sponsorEmail" TEXT NOT NULL,
    "confirmedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SponsorRelationship_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Venue" (
    "id" TEXT NOT NULL,
    "institutionId" TEXT NOT NULL,
    "campusId" TEXT,
    "name" TEXT NOT NULL,
    "address" TEXT,
    "isSensitive" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Venue_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Category" (
    "id" TEXT NOT NULL,
    "institutionId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,

    CONSTRAINT "Category_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Tag" (
    "id" TEXT NOT NULL,
    "institutionId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,

    CONSTRAINT "Tag_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EventSeries" (
    "id" TEXT NOT NULL,
    "publicId" TEXT NOT NULL,
    "institutionId" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "categoryId" TEXT,
    "title" TEXT NOT NULL,
    "summary" TEXT NOT NULL,
    "fullDescription" TEXT NOT NULL,
    "format" "EventFormat" NOT NULL,
    "timeZone" TEXT NOT NULL,
    "recurrenceRule" TEXT,
    "recurrenceHorizonEnd" TIMESTAMP(3),
    "contactName" TEXT NOT NULL,
    "contactChannel" TEXT NOT NULL,
    "cost" TEXT,
    "eligibility" TEXT,
    "accessibilityInfo" TEXT,
    "approvalStatus" "EventApprovalStatus" NOT NULL DEFAULT 'DRAFT',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "EventSeries_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EventSeriesTag" (
    "eventSeriesId" TEXT NOT NULL,
    "tagId" TEXT NOT NULL,

    CONSTRAINT "EventSeriesTag_pkey" PRIMARY KEY ("eventSeriesId","tagId")
);

-- CreateTable
CREATE TABLE "EventOccurrence" (
    "id" TEXT NOT NULL,
    "publicId" TEXT NOT NULL,
    "eventSeriesId" TEXT NOT NULL,
    "startAtUtc" TIMESTAMP(3) NOT NULL,
    "endAtUtc" TIMESTAMP(3) NOT NULL,
    "timeZone" TEXT NOT NULL,
    "venueId" TEXT,
    "onlineUrl" TEXT,
    "capacity" INTEGER,
    "registrationDeadline" TIMESTAMP(3),
    "isCanceled" BOOLEAN NOT NULL DEFAULT false,
    "canceledAt" TIMESTAMP(3),
    "cancelReason" TEXT,
    "isException" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "EventOccurrence_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EventRevision" (
    "id" TEXT NOT NULL,
    "eventSeriesId" TEXT NOT NULL,
    "editedByUserId" TEXT NOT NULL,
    "summary" TEXT NOT NULL,
    "diff" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "EventRevision_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RSVP" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "occurrenceId" TEXT NOT NULL,
    "status" "RsvpStatus" NOT NULL DEFAULT 'GOING',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "RSVP_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WaitlistEntry" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "occurrenceId" TEXT NOT NULL,
    "status" "WaitlistStatus" NOT NULL DEFAULT 'WAITING',
    "position" INTEGER NOT NULL,
    "promotedAt" TIMESTAMP(3),
    "promotionExpiresAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "WaitlistEntry_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SavedEvent" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "occurrenceId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SavedEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Follow" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Follow_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Notification" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "type" "NotificationType" NOT NULL,
    "payload" JSONB NOT NULL,
    "readAt" TIMESTAMP(3),
    "dedupeKey" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Notification_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CalendarToken" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "revokedAt" TIMESTAMP(3),

    CONSTRAINT "CalendarToken_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Report" (
    "id" TEXT NOT NULL,
    "institutionId" TEXT NOT NULL,
    "reporterId" TEXT NOT NULL,
    "targetType" "ReportTargetType" NOT NULL,
    "targetId" TEXT NOT NULL,
    "reasonCode" "ReportReasonCode" NOT NULL,
    "details" TEXT NOT NULL,
    "status" "ReportStatus" NOT NULL DEFAULT 'OPEN',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Report_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ModerationCase" (
    "id" TEXT NOT NULL,
    "institutionId" TEXT NOT NULL,
    "reportId" TEXT,
    "targetType" "ReportTargetType" NOT NULL,
    "targetId" TEXT NOT NULL,
    "state" "ModerationCaseState" NOT NULL DEFAULT 'OPEN',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ModerationCase_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ModerationAction" (
    "id" TEXT NOT NULL,
    "moderationCaseId" TEXT NOT NULL,
    "actionType" "ModerationActionType" NOT NULL,
    "reasonCode" TEXT NOT NULL,
    "privateNote" TEXT,
    "takenByUserId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ModerationAction_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Appeal" (
    "id" TEXT NOT NULL,
    "moderationCaseId" TEXT NOT NULL,
    "submittedByUserId" TEXT NOT NULL,
    "state" "AppealState" NOT NULL DEFAULT 'SUBMITTED',
    "statement" TEXT NOT NULL,
    "decisionNote" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "resolvedAt" TIMESTAMP(3),

    CONSTRAINT "Appeal_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Upload" (
    "id" TEXT NOT NULL,
    "ownerUserId" TEXT NOT NULL,
    "organizationId" TEXT,
    "storageKey" TEXT NOT NULL,
    "mimeType" TEXT NOT NULL,
    "byteSize" INTEGER NOT NULL,
    "width" INTEGER,
    "height" INTEGER,
    "status" "UploadStatus" NOT NULL DEFAULT 'PENDING_SCAN',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Upload_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AuditEvent" (
    "id" TEXT NOT NULL,
    "institutionId" TEXT,
    "actorUserId" TEXT,
    "action" TEXT NOT NULL,
    "targetType" TEXT NOT NULL,
    "targetId" TEXT NOT NULL,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AuditEvent_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Institution_publicId_key" ON "Institution"("publicId");

-- CreateIndex
CREATE UNIQUE INDEX "Institution_slug_key" ON "Institution"("slug");

-- CreateIndex
CREATE INDEX "Institution_slug_idx" ON "Institution"("slug");

-- CreateIndex
CREATE INDEX "AllowedDomain_institutionId_idx" ON "AllowedDomain"("institutionId");

-- CreateIndex
CREATE UNIQUE INDEX "AllowedDomain_institutionId_domain_key" ON "AllowedDomain"("institutionId", "domain");

-- CreateIndex
CREATE INDEX "Campus_institutionId_idx" ON "Campus"("institutionId");

-- CreateIndex
CREATE UNIQUE INDEX "Campus_institutionId_slug_key" ON "Campus"("institutionId", "slug");

-- CreateIndex
CREATE UNIQUE INDEX "User_publicId_key" ON "User"("publicId");

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE INDEX "User_email_idx" ON "User"("email");

-- CreateIndex
CREATE INDEX "InstitutionalMembership_institutionId_status_idx" ON "InstitutionalMembership"("institutionId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "InstitutionalMembership_userId_institutionId_key" ON "InstitutionalMembership"("userId", "institutionId");

-- CreateIndex
CREATE UNIQUE INDEX "Profile_userId_key" ON "Profile"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "Organization_publicId_key" ON "Organization"("publicId");

-- CreateIndex
CREATE INDEX "Organization_institutionId_verificationState_idx" ON "Organization"("institutionId", "verificationState");

-- CreateIndex
CREATE UNIQUE INDEX "Organization_institutionId_slug_key" ON "Organization"("institutionId", "slug");

-- CreateIndex
CREATE INDEX "OrganizationMembership_organizationId_idx" ON "OrganizationMembership"("organizationId");

-- CreateIndex
CREATE UNIQUE INDEX "OrganizationMembership_organizationId_userId_key" ON "OrganizationMembership"("organizationId", "userId");

-- CreateIndex
CREATE INDEX "OrganizationVerification_organizationId_idx" ON "OrganizationVerification"("organizationId");

-- CreateIndex
CREATE INDEX "SponsorRelationship_organizationId_idx" ON "SponsorRelationship"("organizationId");

-- CreateIndex
CREATE INDEX "Venue_institutionId_idx" ON "Venue"("institutionId");

-- CreateIndex
CREATE INDEX "Category_institutionId_idx" ON "Category"("institutionId");

-- CreateIndex
CREATE UNIQUE INDEX "Category_institutionId_slug_key" ON "Category"("institutionId", "slug");

-- CreateIndex
CREATE INDEX "Tag_institutionId_idx" ON "Tag"("institutionId");

-- CreateIndex
CREATE UNIQUE INDEX "Tag_institutionId_slug_key" ON "Tag"("institutionId", "slug");

-- CreateIndex
CREATE UNIQUE INDEX "EventSeries_publicId_key" ON "EventSeries"("publicId");

-- CreateIndex
CREATE INDEX "EventSeries_institutionId_approvalStatus_idx" ON "EventSeries"("institutionId", "approvalStatus");

-- CreateIndex
CREATE INDEX "EventSeries_organizationId_idx" ON "EventSeries"("organizationId");

-- CreateIndex
CREATE UNIQUE INDEX "EventOccurrence_publicId_key" ON "EventOccurrence"("publicId");

-- CreateIndex
CREATE INDEX "EventOccurrence_eventSeriesId_startAtUtc_idx" ON "EventOccurrence"("eventSeriesId", "startAtUtc");

-- CreateIndex
CREATE INDEX "EventOccurrence_startAtUtc_idx" ON "EventOccurrence"("startAtUtc");

-- CreateIndex
CREATE INDEX "EventRevision_eventSeriesId_idx" ON "EventRevision"("eventSeriesId");

-- CreateIndex
CREATE INDEX "RSVP_occurrenceId_status_idx" ON "RSVP"("occurrenceId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "RSVP_userId_occurrenceId_key" ON "RSVP"("userId", "occurrenceId");

-- CreateIndex
CREATE INDEX "WaitlistEntry_occurrenceId_status_position_idx" ON "WaitlistEntry"("occurrenceId", "status", "position");

-- CreateIndex
CREATE UNIQUE INDEX "WaitlistEntry_userId_occurrenceId_key" ON "WaitlistEntry"("userId", "occurrenceId");

-- CreateIndex
CREATE UNIQUE INDEX "SavedEvent_userId_occurrenceId_key" ON "SavedEvent"("userId", "occurrenceId");

-- CreateIndex
CREATE INDEX "Follow_organizationId_idx" ON "Follow"("organizationId");

-- CreateIndex
CREATE UNIQUE INDEX "Follow_userId_organizationId_key" ON "Follow"("userId", "organizationId");

-- CreateIndex
CREATE UNIQUE INDEX "Notification_dedupeKey_key" ON "Notification"("dedupeKey");

-- CreateIndex
CREATE INDEX "Notification_userId_readAt_idx" ON "Notification"("userId", "readAt");

-- CreateIndex
CREATE UNIQUE INDEX "CalendarToken_tokenHash_key" ON "CalendarToken"("tokenHash");

-- CreateIndex
CREATE INDEX "CalendarToken_userId_idx" ON "CalendarToken"("userId");

-- CreateIndex
CREATE INDEX "Report_institutionId_status_idx" ON "Report"("institutionId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "ModerationCase_reportId_key" ON "ModerationCase"("reportId");

-- CreateIndex
CREATE INDEX "ModerationCase_institutionId_state_idx" ON "ModerationCase"("institutionId", "state");

-- CreateIndex
CREATE INDEX "ModerationAction_moderationCaseId_idx" ON "ModerationAction"("moderationCaseId");

-- CreateIndex
CREATE INDEX "Appeal_moderationCaseId_idx" ON "Appeal"("moderationCaseId");

-- CreateIndex
CREATE UNIQUE INDEX "Upload_storageKey_key" ON "Upload"("storageKey");

-- CreateIndex
CREATE INDEX "Upload_organizationId_idx" ON "Upload"("organizationId");

-- CreateIndex
CREATE INDEX "AuditEvent_institutionId_createdAt_idx" ON "AuditEvent"("institutionId", "createdAt");

-- CreateIndex
CREATE INDEX "AuditEvent_targetType_targetId_idx" ON "AuditEvent"("targetType", "targetId");

-- AddForeignKey
ALTER TABLE "AllowedDomain" ADD CONSTRAINT "AllowedDomain_institutionId_fkey" FOREIGN KEY ("institutionId") REFERENCES "Institution"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Campus" ADD CONSTRAINT "Campus_institutionId_fkey" FOREIGN KEY ("institutionId") REFERENCES "Institution"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InstitutionalMembership" ADD CONSTRAINT "InstitutionalMembership_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InstitutionalMembership" ADD CONSTRAINT "InstitutionalMembership_institutionId_fkey" FOREIGN KEY ("institutionId") REFERENCES "Institution"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Profile" ADD CONSTRAINT "Profile_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Organization" ADD CONSTRAINT "Organization_institutionId_fkey" FOREIGN KEY ("institutionId") REFERENCES "Institution"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Organization" ADD CONSTRAINT "Organization_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "Category"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OrganizationMembership" ADD CONSTRAINT "OrganizationMembership_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OrganizationMembership" ADD CONSTRAINT "OrganizationMembership_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OrganizationVerification" ADD CONSTRAINT "OrganizationVerification_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SponsorRelationship" ADD CONSTRAINT "SponsorRelationship_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Venue" ADD CONSTRAINT "Venue_institutionId_fkey" FOREIGN KEY ("institutionId") REFERENCES "Institution"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Venue" ADD CONSTRAINT "Venue_campusId_fkey" FOREIGN KEY ("campusId") REFERENCES "Campus"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Category" ADD CONSTRAINT "Category_institutionId_fkey" FOREIGN KEY ("institutionId") REFERENCES "Institution"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Tag" ADD CONSTRAINT "Tag_institutionId_fkey" FOREIGN KEY ("institutionId") REFERENCES "Institution"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EventSeries" ADD CONSTRAINT "EventSeries_institutionId_fkey" FOREIGN KEY ("institutionId") REFERENCES "Institution"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EventSeries" ADD CONSTRAINT "EventSeries_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EventSeries" ADD CONSTRAINT "EventSeries_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "Category"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EventSeriesTag" ADD CONSTRAINT "EventSeriesTag_eventSeriesId_fkey" FOREIGN KEY ("eventSeriesId") REFERENCES "EventSeries"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EventSeriesTag" ADD CONSTRAINT "EventSeriesTag_tagId_fkey" FOREIGN KEY ("tagId") REFERENCES "Tag"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EventOccurrence" ADD CONSTRAINT "EventOccurrence_eventSeriesId_fkey" FOREIGN KEY ("eventSeriesId") REFERENCES "EventSeries"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EventOccurrence" ADD CONSTRAINT "EventOccurrence_venueId_fkey" FOREIGN KEY ("venueId") REFERENCES "Venue"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EventRevision" ADD CONSTRAINT "EventRevision_eventSeriesId_fkey" FOREIGN KEY ("eventSeriesId") REFERENCES "EventSeries"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EventRevision" ADD CONSTRAINT "EventRevision_editedByUserId_fkey" FOREIGN KEY ("editedByUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RSVP" ADD CONSTRAINT "RSVP_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RSVP" ADD CONSTRAINT "RSVP_occurrenceId_fkey" FOREIGN KEY ("occurrenceId") REFERENCES "EventOccurrence"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WaitlistEntry" ADD CONSTRAINT "WaitlistEntry_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WaitlistEntry" ADD CONSTRAINT "WaitlistEntry_occurrenceId_fkey" FOREIGN KEY ("occurrenceId") REFERENCES "EventOccurrence"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SavedEvent" ADD CONSTRAINT "SavedEvent_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SavedEvent" ADD CONSTRAINT "SavedEvent_occurrenceId_fkey" FOREIGN KEY ("occurrenceId") REFERENCES "EventOccurrence"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Follow" ADD CONSTRAINT "Follow_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Follow" ADD CONSTRAINT "Follow_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Notification" ADD CONSTRAINT "Notification_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CalendarToken" ADD CONSTRAINT "CalendarToken_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Report" ADD CONSTRAINT "Report_reporterId_fkey" FOREIGN KEY ("reporterId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ModerationCase" ADD CONSTRAINT "ModerationCase_institutionId_fkey" FOREIGN KEY ("institutionId") REFERENCES "Institution"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ModerationCase" ADD CONSTRAINT "ModerationCase_reportId_fkey" FOREIGN KEY ("reportId") REFERENCES "Report"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ModerationAction" ADD CONSTRAINT "ModerationAction_moderationCaseId_fkey" FOREIGN KEY ("moderationCaseId") REFERENCES "ModerationCase"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ModerationAction" ADD CONSTRAINT "ModerationAction_takenByUserId_fkey" FOREIGN KEY ("takenByUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Appeal" ADD CONSTRAINT "Appeal_moderationCaseId_fkey" FOREIGN KEY ("moderationCaseId") REFERENCES "ModerationCase"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Appeal" ADD CONSTRAINT "Appeal_submittedByUserId_fkey" FOREIGN KEY ("submittedByUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Upload" ADD CONSTRAINT "Upload_ownerUserId_fkey" FOREIGN KEY ("ownerUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Upload" ADD CONSTRAINT "Upload_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AuditEvent" ADD CONSTRAINT "AuditEvent_institutionId_fkey" FOREIGN KEY ("institutionId") REFERENCES "Institution"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AuditEvent" ADD CONSTRAINT "AuditEvent_actorUserId_fkey" FOREIGN KEY ("actorUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
