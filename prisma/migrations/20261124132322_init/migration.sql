CREATE EXTENSION IF NOT EXISTS postgis;
CREATE EXTENSION IF NOT EXISTS btree_gist;
CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- CreateEnum
CREATE TYPE "UserRole" AS ENUM ('DRIVER', 'ATTENDANT', 'FACILITY_ADMIN', 'SUPER_ADMIN');

-- CreateEnum
CREATE TYPE "UserStatus" AS ENUM ('ACTIVE', 'SUSPENDED');

-- CreateEnum
CREATE TYPE "OrganizationStatus" AS ENUM ('PENDING_APPROVAL', 'ACTIVE', 'SUSPENDED');

-- CreateEnum
CREATE TYPE "FacilityStatus" AS ENUM ('PENDING_APPROVAL', 'APPROVED', 'REJECTED', 'SUSPENDED');

-- CreateEnum
CREATE TYPE "FacilityType" AS ENUM ('HOTEL', 'MALL', 'OFFICE', 'COMMERCIAL', 'RESTAURANT', 'HOSPITAL', 'UNIVERSITY', 'PRIVATE_OPERATOR', 'INDIVIDUAL');

-- CreateEnum
CREATE TYPE "InventoryModel" AS ENUM ('INDIVIDUAL_SPACES', 'CAPACITY_BASED');

-- CreateEnum
CREATE TYPE "VehicleType" AS ENUM ('MOTORCYCLE', 'SEDAN', 'SUV', 'MINIBUS', 'TRUCK');

-- CreateEnum
CREATE TYPE "SpaceStatus" AS ENUM ('AVAILABLE', 'UNAVAILABLE', 'MAINTENANCE');

-- CreateEnum
CREATE TYPE "StaffRole" AS ENUM ('FACILITY_ADMIN', 'MANAGER', 'ATTENDANT');

-- CreateEnum
CREATE TYPE "ReservationStatus" AS ENUM ('PENDING_PAYMENT', 'CONFIRMED', 'CHECKED_IN', 'ACTIVE', 'EXTENSION_PENDING', 'COMPLETED', 'CANCELLED', 'EXPIRED', 'NO_SHOW', 'REFUND_PENDING', 'REFUNDED');

-- CreateEnum
CREATE TYPE "AllocationType" AS ENUM ('SPACE', 'CAPACITY');

-- CreateEnum
CREATE TYPE "ExtensionStatus" AS ENUM ('PENDING_PAYMENT', 'CONFIRMED', 'REJECTED', 'EXPIRED');

-- CreateEnum
CREATE TYPE "SessionStatus" AS ENUM ('ACTIVE', 'COMPLETED');

-- CreateEnum
CREATE TYPE "PaymentPurpose" AS ENUM ('DEPOSIT', 'EXTENSION', 'FINAL_BALANCE');

-- CreateEnum
CREATE TYPE "PaymentStatus" AS ENUM ('INITIATED', 'PENDING', 'SUCCEEDED', 'FAILED', 'EXPIRED', 'AMOUNT_MISMATCH', 'REFUND_REQUIRED');

-- CreateEnum
CREATE TYPE "RefundStatus" AS ENUM ('PENDING', 'SUCCEEDED', 'FAILED');

-- CreateEnum
CREATE TYPE "TransactionType" AS ENUM ('DEPOSIT', 'EXTENSION', 'FINAL_BALANCE', 'REFUND', 'PLATFORM_COMMISSION', 'FORFEITURE', 'NO_SHOW_FEE');

-- CreateEnum
CREATE TYPE "NotificationChannel" AS ENUM ('IN_APP', 'EMAIL', 'SMS', 'PUSH');

-- CreateEnum
CREATE TYPE "NotificationStatus" AS ENUM ('PENDING', 'SENT', 'FAILED', 'READ');

-- CreateEnum
CREATE TYPE "TicketStatus" AS ENUM ('OPEN', 'IN_PROGRESS', 'RESOLVED', 'CLOSED');

-- CreateEnum
CREATE TYPE "QRStatus" AS ENUM ('ACTIVE', 'USED', 'REVOKED', 'EXPIRED');

-- CreateEnum
CREATE TYPE "PricingUnit" AS ENUM ('HOURLY', 'DAILY');

-- CreateEnum
CREATE TYPE "RoundingMode" AS ENUM ('NONE', 'UP_TO_HOUR', 'UP_TO_30_MIN', 'UP_TO_15_MIN');

-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "email" TEXT,
    "phone" TEXT,
    "passwordHash" TEXT NOT NULL,
    "role" "UserRole" NOT NULL DEFAULT 'DRIVER',
    "status" "UserStatus" NOT NULL DEFAULT 'ACTIVE',
    "emailVerifiedAt" TIMESTAMPTZ,
    "phoneVerifiedAt" TIMESTAMPTZ,
    "failedLoginCount" INTEGER NOT NULL DEFAULT 0,
    "lockedUntil" TIMESTAMPTZ,
    "lastLoginAt" TIMESTAMPTZ,
    "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "UserProfile" (
    "userId" TEXT NOT NULL,
    "fullName" TEXT NOT NULL,
    "language" TEXT NOT NULL DEFAULT 'en',
    "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "UserProfile_pkey" PRIMARY KEY ("userId")
);

-- CreateTable
CREATE TABLE "Vehicle" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "plateNumber" TEXT NOT NULL,
    "type" "VehicleType" NOT NULL DEFAULT 'SEDAN',
    "make" TEXT,
    "model" TEXT,
    "color" TEXT,
    "isDefault" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "deletedAt" TIMESTAMPTZ,

    CONSTRAINT "Vehicle_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Organization" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "legalName" TEXT,
    "taxId" TEXT,
    "email" TEXT,
    "phone" TEXT,
    "status" "OrganizationStatus" NOT NULL DEFAULT 'PENDING_APPROVAL',
    "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "Organization_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OrganizationMember" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "role" "StaffRole" NOT NULL DEFAULT 'FACILITY_ADMIN',
    "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "OrganizationMember_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FacilityStaff" (
    "id" TEXT NOT NULL,
    "facilityId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "role" "StaffRole" NOT NULL DEFAULT 'ATTENDANT',
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "FacilityStaff_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ParkingFacility" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "type" "FacilityType" NOT NULL,
    "status" "FacilityStatus" NOT NULL DEFAULT 'PENDING_APPROVAL',
    "rejectionReason" TEXT,
    "inventoryModel" "InventoryModel" NOT NULL DEFAULT 'INDIVIDUAL_SPACES',
    "address" TEXT NOT NULL,
    "subCity" TEXT,
    "neighborhood" TEXT,
    "latitude" DOUBLE PRECISION NOT NULL,
    "longitude" DOUBLE PRECISION NOT NULL,
    "location" geography(Point,4326),
    "contactPhone" TEXT,
    "contactEmail" TEXT,
    "totalCapacity" INTEGER NOT NULL DEFAULT 0,
    "isCovered" BOOLEAN NOT NULL DEFAULT false,
    "isIndoor" BOOLEAN NOT NULL DEFAULT false,
    "is24Hours" BOOLEAN NOT NULL DEFAULT false,
    "timezone" TEXT NOT NULL DEFAULT 'Africa/Addis_Ababa',
    "commissionBps" INTEGER,
    "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "ParkingFacility_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FacilityImage" (
    "id" TEXT NOT NULL,
    "facilityId" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "alt" TEXT,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "FacilityImage_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FacilityOperatingHours" (
    "id" TEXT NOT NULL,
    "facilityId" TEXT NOT NULL,
    "dayOfWeek" INTEGER NOT NULL,
    "opensMinute" INTEGER NOT NULL,
    "closesMinute" INTEGER NOT NULL,

    CONSTRAINT "FacilityOperatingHours_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FacilityFeature" (
    "id" TEXT NOT NULL,
    "facilityId" TEXT NOT NULL,
    "key" TEXT NOT NULL,

    CONSTRAINT "FacilityFeature_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ParkingFloor" (
    "id" TEXT NOT NULL,
    "facilityId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "level" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "ParkingFloor_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ParkingZone" (
    "id" TEXT NOT NULL,
    "facilityId" TEXT NOT NULL,
    "floorId" TEXT NOT NULL,
    "name" TEXT NOT NULL,

    CONSTRAINT "ParkingZone_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ParkingSpace" (
    "id" TEXT NOT NULL,
    "facilityId" TEXT NOT NULL,
    "zoneId" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "vehicleTypes" "VehicleType"[],
    "isCovered" BOOLEAN NOT NULL DEFAULT false,
    "status" "SpaceStatus" NOT NULL DEFAULT 'AVAILABLE',
    "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ParkingSpace_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MaintenanceRecord" (
    "id" TEXT NOT NULL,
    "facilityId" TEXT NOT NULL,
    "spaceId" TEXT,
    "units" INTEGER NOT NULL DEFAULT 1,
    "startAt" TIMESTAMPTZ NOT NULL,
    "endAt" TIMESTAMPTZ NOT NULL,
    "reason" TEXT,
    "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MaintenanceRecord_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PricingRule" (
    "id" TEXT NOT NULL,
    "facilityId" TEXT NOT NULL,
    "name" TEXT NOT NULL DEFAULT 'Standard',
    "vehicleType" "VehicleType",
    "unit" "PricingUnit" NOT NULL DEFAULT 'HOURLY',
    "firstUnitCents" INTEGER NOT NULL,
    "additionalUnitCents" INTEGER NOT NULL,
    "minimumChargeCents" INTEGER NOT NULL DEFAULT 0,
    "dailyCapCents" INTEGER,
    "rounding" "RoundingMode" NOT NULL DEFAULT 'UP_TO_HOUR',
    "dayOfWeekMask" INTEGER,
    "startMinute" INTEGER,
    "endMinute" INTEGER,
    "priority" INTEGER NOT NULL DEFAULT 0,
    "active" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "PricingRule_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ReservationPolicy" (
    "facilityId" TEXT NOT NULL,
    "depositPercent" INTEGER NOT NULL DEFAULT 20,
    "graceMinutes" INTEGER NOT NULL DEFAULT 15,
    "minAdvanceMinutes" INTEGER NOT NULL DEFAULT 0,
    "maxAdvanceDays" INTEGER NOT NULL DEFAULT 14,
    "minDurationMinutes" INTEGER NOT NULL DEFAULT 30,
    "maxDurationMinutes" INTEGER NOT NULL DEFAULT 1440,
    "allowExtensions" BOOLEAN NOT NULL DEFAULT true,
    "allowGraceExtension" BOOLEAN NOT NULL DEFAULT false,
    "depositRefundableOnEarlyExit" BOOLEAN NOT NULL DEFAULT false,
    "extensionGraceMinutes" INTEGER NOT NULL DEFAULT 15,

    CONSTRAINT "ReservationPolicy_pkey" PRIMARY KEY ("facilityId")
);

-- CreateTable
CREATE TABLE "CancellationPolicy" (
    "facilityId" TEXT NOT NULL,
    "freeCancelBeforeMinutes" INTEGER NOT NULL DEFAULT 60,
    "refundPercentBefore" INTEGER NOT NULL DEFAULT 100,
    "refundPercentAfter" INTEGER NOT NULL DEFAULT 0,
    "noShowFeeCents" INTEGER NOT NULL DEFAULT 0,
    "forfeitDepositOnNoShow" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "CancellationPolicy_pkey" PRIMARY KEY ("facilityId")
);

-- CreateTable
CREATE TABLE "Reservation" (
    "id" TEXT NOT NULL,
    "reference" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "facilityId" TEXT NOT NULL,
    "vehicleId" TEXT NOT NULL,
    "allocation" "AllocationType" NOT NULL,
    "spaceId" TEXT,
    "vehicleType" "VehicleType" NOT NULL,
    "status" "ReservationStatus" NOT NULL DEFAULT 'PENDING_PAYMENT',
    "startAt" TIMESTAMPTZ NOT NULL,
    "endAt" TIMESTAMPTZ NOT NULL,
    "holdExpiresAt" TIMESTAMPTZ,
    "blocksInventory" BOOLEAN NOT NULL DEFAULT false,
    "destinationName" TEXT,
    "destinationLat" DOUBLE PRECISION,
    "destinationLng" DOUBLE PRECISION,
    "estimatedFeeCents" INTEGER NOT NULL,
    "depositCents" INTEGER NOT NULL,
    "finalFeeCents" INTEGER,
    "graceMinutes" INTEGER NOT NULL,
    "policySnapshot" JSONB NOT NULL,
    "cancelledAt" TIMESTAMPTZ,
    "cancelReason" TEXT,
    "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "Reservation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ReservationExtension" (
    "id" TEXT NOT NULL,
    "reservationId" TEXT NOT NULL,
    "previousEndAt" TIMESTAMPTZ NOT NULL,
    "newEndAt" TIMESTAMPTZ NOT NULL,
    "additionalFeeCents" INTEGER NOT NULL,
    "status" "ExtensionStatus" NOT NULL DEFAULT 'PENDING_PAYMENT',
    "holdExpiresAt" TIMESTAMPTZ,
    "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ReservationExtension_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ParkingSession" (
    "id" TEXT NOT NULL,
    "reservationId" TEXT NOT NULL,
    "facilityId" TEXT NOT NULL,
    "spaceId" TEXT,
    "plateNumber" TEXT NOT NULL,
    "status" "SessionStatus" NOT NULL DEFAULT 'ACTIVE',
    "checkInAt" TIMESTAMPTZ NOT NULL,
    "checkOutAt" TIMESTAMPTZ,
    "checkedInById" TEXT,
    "checkedOutById" TEXT,
    "actualMinutes" INTEGER,
    "finalFeeCents" INTEGER,
    "receiptNumber" TEXT,
    "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ParkingSession_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "QRCodeToken" (
    "id" TEXT NOT NULL,
    "reservationId" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "status" "QRStatus" NOT NULL DEFAULT 'ACTIVE',
    "expiresAt" TIMESTAMPTZ NOT NULL,
    "usedAt" TIMESTAMPTZ,
    "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "QRCodeToken_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "QRScanEvent" (
    "id" TEXT NOT NULL,
    "tokenId" TEXT,
    "scannedById" TEXT,
    "facilityId" TEXT,
    "outcome" TEXT NOT NULL,
    "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "QRScanEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PaymentProvider" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT false,
    "isLive" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "PaymentProvider_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Payment" (
    "id" TEXT NOT NULL,
    "reference" TEXT NOT NULL,
    "idempotencyKey" TEXT NOT NULL,
    "reservationId" TEXT NOT NULL,
    "extensionId" TEXT,
    "providerId" TEXT NOT NULL,
    "purpose" "PaymentPurpose" NOT NULL,
    "status" "PaymentStatus" NOT NULL DEFAULT 'INITIATED',
    "amountCents" INTEGER NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'ETB',
    "providerReference" TEXT,
    "checkoutUrl" TEXT,
    "failureReason" TEXT,
    "paidAt" TIMESTAMPTZ,
    "expiresAt" TIMESTAMPTZ,
    "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "Payment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Refund" (
    "id" TEXT NOT NULL,
    "reference" TEXT NOT NULL,
    "paymentId" TEXT NOT NULL,
    "amountCents" INTEGER NOT NULL,
    "status" "RefundStatus" NOT NULL DEFAULT 'PENDING',
    "reason" TEXT,
    "providerReference" TEXT,
    "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "processedAt" TIMESTAMPTZ,

    CONSTRAINT "Refund_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PaymentWebhook" (
    "id" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "providerEventId" TEXT NOT NULL,
    "paymentId" TEXT,
    "signatureValid" BOOLEAN NOT NULL,
    "payload" JSONB NOT NULL,
    "processedAt" TIMESTAMPTZ,
    "error" TEXT,
    "receivedAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PaymentWebhook_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FinancialTransaction" (
    "id" TEXT NOT NULL,
    "reference" TEXT NOT NULL,
    "reservationId" TEXT NOT NULL,
    "facilityId" TEXT NOT NULL,
    "type" "TransactionType" NOT NULL,
    "amountCents" INTEGER NOT NULL,
    "paymentId" TEXT,
    "refundId" TEXT,
    "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "FinancialTransaction_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Notification" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "channel" "NotificationChannel" NOT NULL DEFAULT 'IN_APP',
    "event" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "data" JSONB,
    "status" "NotificationStatus" NOT NULL DEFAULT 'PENDING',
    "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "sentAt" TIMESTAMPTZ,
    "readAt" TIMESTAMPTZ,

    CONSTRAINT "Notification_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Review" (
    "id" TEXT NOT NULL,
    "reservationId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "facilityId" TEXT NOT NULL,
    "rating" INTEGER NOT NULL,
    "comment" TEXT,
    "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Review_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AuditLog" (
    "id" TEXT NOT NULL,
    "actorId" TEXT,
    "actorRole" "UserRole",
    "action" TEXT NOT NULL,
    "entityType" TEXT,
    "entityId" TEXT,
    "metadata" JSONB,
    "ip" TEXT,
    "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AuditLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PlatformSetting" (
    "key" TEXT NOT NULL,
    "value" JSONB NOT NULL,
    "updatedAt" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "PlatformSetting_pkey" PRIMARY KEY ("key")
);

-- CreateTable
CREATE TABLE "SupportTicket" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "reservationId" TEXT,
    "subject" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "status" "TicketStatus" NOT NULL DEFAULT 'OPEN',
    "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "SupportTicket_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Landmark" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "alias" TEXT[],
    "category" TEXT,
    "address" TEXT,
    "neighborhood" TEXT,
    "latitude" DOUBLE PRECISION NOT NULL,
    "longitude" DOUBLE PRECISION NOT NULL,
    "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Landmark_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE UNIQUE INDEX "User_phone_key" ON "User"("phone");

-- CreateIndex
CREATE INDEX "User_role_status_idx" ON "User"("role", "status");

-- CreateIndex
CREATE INDEX "Vehicle_userId_idx" ON "Vehicle"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "Vehicle_userId_plateNumber_key" ON "Vehicle"("userId", "plateNumber");

-- CreateIndex
CREATE INDEX "OrganizationMember_userId_idx" ON "OrganizationMember"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "OrganizationMember_organizationId_userId_key" ON "OrganizationMember"("organizationId", "userId");

-- CreateIndex
CREATE INDEX "FacilityStaff_userId_idx" ON "FacilityStaff"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "FacilityStaff_facilityId_userId_key" ON "FacilityStaff"("facilityId", "userId");

-- CreateIndex
CREATE INDEX "ParkingFacility_organizationId_idx" ON "ParkingFacility"("organizationId");

-- CreateIndex
CREATE INDEX "ParkingFacility_status_idx" ON "ParkingFacility"("status");

-- CreateIndex
CREATE INDEX "ParkingFacility_neighborhood_idx" ON "ParkingFacility"("neighborhood");

-- CreateIndex
CREATE INDEX "FacilityImage_facilityId_idx" ON "FacilityImage"("facilityId");

-- CreateIndex
CREATE UNIQUE INDEX "FacilityOperatingHours_facilityId_dayOfWeek_key" ON "FacilityOperatingHours"("facilityId", "dayOfWeek");

-- CreateIndex
CREATE UNIQUE INDEX "FacilityFeature_facilityId_key_key" ON "FacilityFeature"("facilityId", "key");

-- CreateIndex
CREATE UNIQUE INDEX "ParkingFloor_facilityId_name_key" ON "ParkingFloor"("facilityId", "name");

-- CreateIndex
CREATE INDEX "ParkingZone_facilityId_idx" ON "ParkingZone"("facilityId");

-- CreateIndex
CREATE UNIQUE INDEX "ParkingZone_floorId_name_key" ON "ParkingZone"("floorId", "name");

-- CreateIndex
CREATE INDEX "ParkingSpace_zoneId_idx" ON "ParkingSpace"("zoneId");

-- CreateIndex
CREATE UNIQUE INDEX "ParkingSpace_facilityId_label_key" ON "ParkingSpace"("facilityId", "label");

-- CreateIndex
CREATE INDEX "MaintenanceRecord_facilityId_startAt_endAt_idx" ON "MaintenanceRecord"("facilityId", "startAt", "endAt");

-- CreateIndex
CREATE INDEX "PricingRule_facilityId_active_idx" ON "PricingRule"("facilityId", "active");

-- CreateIndex
CREATE UNIQUE INDEX "Reservation_reference_key" ON "Reservation"("reference");

-- CreateIndex
CREATE INDEX "Reservation_userId_status_idx" ON "Reservation"("userId", "status");

-- CreateIndex
CREATE INDEX "Reservation_facilityId_startAt_endAt_idx" ON "Reservation"("facilityId", "startAt", "endAt");

-- CreateIndex
CREATE INDEX "Reservation_status_holdExpiresAt_idx" ON "Reservation"("status", "holdExpiresAt");

-- CreateIndex
CREATE INDEX "Reservation_spaceId_startAt_endAt_idx" ON "Reservation"("spaceId", "startAt", "endAt");

-- CreateIndex
CREATE INDEX "ReservationExtension_reservationId_idx" ON "ReservationExtension"("reservationId");

-- CreateIndex
CREATE UNIQUE INDEX "ParkingSession_reservationId_key" ON "ParkingSession"("reservationId");

-- CreateIndex
CREATE UNIQUE INDEX "ParkingSession_receiptNumber_key" ON "ParkingSession"("receiptNumber");

-- CreateIndex
CREATE INDEX "ParkingSession_facilityId_status_idx" ON "ParkingSession"("facilityId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "QRCodeToken_tokenHash_key" ON "QRCodeToken"("tokenHash");

-- CreateIndex
CREATE INDEX "QRCodeToken_reservationId_idx" ON "QRCodeToken"("reservationId");

-- CreateIndex
CREATE INDEX "QRScanEvent_tokenId_idx" ON "QRScanEvent"("tokenId");

-- CreateIndex
CREATE UNIQUE INDEX "Payment_reference_key" ON "Payment"("reference");

-- CreateIndex
CREATE UNIQUE INDEX "Payment_idempotencyKey_key" ON "Payment"("idempotencyKey");

-- CreateIndex
CREATE INDEX "Payment_reservationId_idx" ON "Payment"("reservationId");

-- CreateIndex
CREATE INDEX "Payment_status_createdAt_idx" ON "Payment"("status", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "Refund_reference_key" ON "Refund"("reference");

-- CreateIndex
CREATE INDEX "Refund_paymentId_idx" ON "Refund"("paymentId");

-- CreateIndex
CREATE UNIQUE INDEX "PaymentWebhook_provider_providerEventId_key" ON "PaymentWebhook"("provider", "providerEventId");

-- CreateIndex
CREATE UNIQUE INDEX "FinancialTransaction_reference_key" ON "FinancialTransaction"("reference");

-- CreateIndex
CREATE INDEX "FinancialTransaction_facilityId_createdAt_idx" ON "FinancialTransaction"("facilityId", "createdAt");

-- CreateIndex
CREATE INDEX "FinancialTransaction_reservationId_idx" ON "FinancialTransaction"("reservationId");

-- CreateIndex
CREATE INDEX "Notification_userId_readAt_idx" ON "Notification"("userId", "readAt");

-- CreateIndex
CREATE INDEX "Notification_status_channel_idx" ON "Notification"("status", "channel");

-- CreateIndex
CREATE UNIQUE INDEX "Review_reservationId_key" ON "Review"("reservationId");

-- CreateIndex
CREATE INDEX "Review_facilityId_idx" ON "Review"("facilityId");

-- CreateIndex
CREATE INDEX "AuditLog_entityType_entityId_idx" ON "AuditLog"("entityType", "entityId");

-- CreateIndex
CREATE INDEX "AuditLog_actorId_createdAt_idx" ON "AuditLog"("actorId", "createdAt");

-- CreateIndex
CREATE INDEX "AuditLog_action_createdAt_idx" ON "AuditLog"("action", "createdAt");

-- CreateIndex
CREATE INDEX "SupportTicket_status_idx" ON "SupportTicket"("status");

-- CreateIndex
CREATE INDEX "Landmark_name_idx" ON "Landmark"("name");

-- AddForeignKey
ALTER TABLE "UserProfile" ADD CONSTRAINT "UserProfile_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Vehicle" ADD CONSTRAINT "Vehicle_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OrganizationMember" ADD CONSTRAINT "OrganizationMember_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OrganizationMember" ADD CONSTRAINT "OrganizationMember_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FacilityStaff" ADD CONSTRAINT "FacilityStaff_facilityId_fkey" FOREIGN KEY ("facilityId") REFERENCES "ParkingFacility"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FacilityStaff" ADD CONSTRAINT "FacilityStaff_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ParkingFacility" ADD CONSTRAINT "ParkingFacility_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FacilityImage" ADD CONSTRAINT "FacilityImage_facilityId_fkey" FOREIGN KEY ("facilityId") REFERENCES "ParkingFacility"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FacilityOperatingHours" ADD CONSTRAINT "FacilityOperatingHours_facilityId_fkey" FOREIGN KEY ("facilityId") REFERENCES "ParkingFacility"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FacilityFeature" ADD CONSTRAINT "FacilityFeature_facilityId_fkey" FOREIGN KEY ("facilityId") REFERENCES "ParkingFacility"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ParkingFloor" ADD CONSTRAINT "ParkingFloor_facilityId_fkey" FOREIGN KEY ("facilityId") REFERENCES "ParkingFacility"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ParkingZone" ADD CONSTRAINT "ParkingZone_facilityId_fkey" FOREIGN KEY ("facilityId") REFERENCES "ParkingFacility"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ParkingZone" ADD CONSTRAINT "ParkingZone_floorId_fkey" FOREIGN KEY ("floorId") REFERENCES "ParkingFloor"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ParkingSpace" ADD CONSTRAINT "ParkingSpace_facilityId_fkey" FOREIGN KEY ("facilityId") REFERENCES "ParkingFacility"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ParkingSpace" ADD CONSTRAINT "ParkingSpace_zoneId_fkey" FOREIGN KEY ("zoneId") REFERENCES "ParkingZone"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MaintenanceRecord" ADD CONSTRAINT "MaintenanceRecord_facilityId_fkey" FOREIGN KEY ("facilityId") REFERENCES "ParkingFacility"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MaintenanceRecord" ADD CONSTRAINT "MaintenanceRecord_spaceId_fkey" FOREIGN KEY ("spaceId") REFERENCES "ParkingSpace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PricingRule" ADD CONSTRAINT "PricingRule_facilityId_fkey" FOREIGN KEY ("facilityId") REFERENCES "ParkingFacility"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReservationPolicy" ADD CONSTRAINT "ReservationPolicy_facilityId_fkey" FOREIGN KEY ("facilityId") REFERENCES "ParkingFacility"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CancellationPolicy" ADD CONSTRAINT "CancellationPolicy_facilityId_fkey" FOREIGN KEY ("facilityId") REFERENCES "ParkingFacility"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Reservation" ADD CONSTRAINT "Reservation_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Reservation" ADD CONSTRAINT "Reservation_facilityId_fkey" FOREIGN KEY ("facilityId") REFERENCES "ParkingFacility"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Reservation" ADD CONSTRAINT "Reservation_vehicleId_fkey" FOREIGN KEY ("vehicleId") REFERENCES "Vehicle"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Reservation" ADD CONSTRAINT "Reservation_spaceId_fkey" FOREIGN KEY ("spaceId") REFERENCES "ParkingSpace"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReservationExtension" ADD CONSTRAINT "ReservationExtension_reservationId_fkey" FOREIGN KEY ("reservationId") REFERENCES "Reservation"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ParkingSession" ADD CONSTRAINT "ParkingSession_reservationId_fkey" FOREIGN KEY ("reservationId") REFERENCES "Reservation"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ParkingSession" ADD CONSTRAINT "ParkingSession_spaceId_fkey" FOREIGN KEY ("spaceId") REFERENCES "ParkingSpace"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "QRCodeToken" ADD CONSTRAINT "QRCodeToken_reservationId_fkey" FOREIGN KEY ("reservationId") REFERENCES "Reservation"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "QRScanEvent" ADD CONSTRAINT "QRScanEvent_tokenId_fkey" FOREIGN KEY ("tokenId") REFERENCES "QRCodeToken"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Payment" ADD CONSTRAINT "Payment_reservationId_fkey" FOREIGN KEY ("reservationId") REFERENCES "Reservation"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Payment" ADD CONSTRAINT "Payment_extensionId_fkey" FOREIGN KEY ("extensionId") REFERENCES "ReservationExtension"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Payment" ADD CONSTRAINT "Payment_providerId_fkey" FOREIGN KEY ("providerId") REFERENCES "PaymentProvider"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Refund" ADD CONSTRAINT "Refund_paymentId_fkey" FOREIGN KEY ("paymentId") REFERENCES "Payment"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PaymentWebhook" ADD CONSTRAINT "PaymentWebhook_paymentId_fkey" FOREIGN KEY ("paymentId") REFERENCES "Payment"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FinancialTransaction" ADD CONSTRAINT "FinancialTransaction_reservationId_fkey" FOREIGN KEY ("reservationId") REFERENCES "Reservation"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Notification" ADD CONSTRAINT "Notification_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Review" ADD CONSTRAINT "Review_reservationId_fkey" FOREIGN KEY ("reservationId") REFERENCES "Reservation"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Review" ADD CONSTRAINT "Review_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Review" ADD CONSTRAINT "Review_facilityId_fkey" FOREIGN KEY ("facilityId") REFERENCES "ParkingFacility"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AuditLog" ADD CONSTRAINT "AuditLog_actorId_fkey" FOREIGN KEY ("actorId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SupportTicket" ADD CONSTRAINT "SupportTicket_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- ============================================================================
-- Raw SQL that Prisma cannot express. Part of the schema contract; do not remove.
-- ============================================================================

-- 1. Keep the PostGIS geography column in sync with latitude/longitude.
--    latitude/longitude remain the source of truth; applications never write `location`.
CREATE OR REPLACE FUNCTION set_facility_location() RETURNS trigger AS $$
BEGIN
  NEW."location" := ST_SetSRID(ST_MakePoint(NEW."longitude", NEW."latitude"), 4326)::geography;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER parking_facility_location_sync
BEFORE INSERT OR UPDATE OF "latitude", "longitude" ON "ParkingFacility"
FOR EACH ROW EXECUTE FUNCTION set_facility_location();

-- 2. Spatial index for radius discovery (ST_DWithin) and distance ordering.
CREATE INDEX "ParkingFacility_location_gist" ON "ParkingFacility" USING GIST ("location");

ALTER TABLE "ParkingFacility"
  ADD CONSTRAINT "ParkingFacility_lat_range" CHECK ("latitude" BETWEEN -90 AND 90),
  ADD CONSTRAINT "ParkingFacility_lng_range" CHECK ("longitude" BETWEEN -180 AND 180),
  ADD CONSTRAINT "ParkingFacility_capacity_nonneg" CHECK ("totalCapacity" >= 0);

-- 3. Fuzzy destination / facility name search (Phase 3).
CREATE INDEX "Landmark_name_trgm" ON "Landmark" USING GIN ("name" gin_trgm_ops);
CREATE INDEX "ParkingFacility_name_trgm" ON "ParkingFacility" USING GIN ("name" gin_trgm_ops);

-- 4. Double-booking protection for individual spaces.
--    A reservation occupies [startAt, endAt) while "blocksInventory" is true. The state machine
--    (Phase 4) is the only writer of that flag. Capacity-based facilities are protected by a
--    per-facility advisory lock + count in the service layer instead.
ALTER TABLE "Reservation"
  ADD CONSTRAINT "Reservation_window_valid" CHECK ("endAt" > "startAt"),
  ADD CONSTRAINT "Reservation_money_valid" CHECK ("estimatedFeeCents" >= 0 AND "depositCents" >= 0 AND "depositCents" <= "estimatedFeeCents"),
  ADD CONSTRAINT "Reservation_allocation_valid" CHECK (
    ("allocation" = 'SPACE' AND "spaceId" IS NOT NULL) OR ("allocation" = 'CAPACITY' AND "spaceId" IS NULL)
  ),
  ADD CONSTRAINT "Reservation_no_space_overlap" EXCLUDE USING gist (
    "spaceId" WITH =,
    tstzrange("startAt", "endAt", '[)') WITH &&
  ) WHERE ("spaceId" IS NOT NULL AND "blocksInventory");

-- 5. Financial integrity.
ALTER TABLE "Payment" ADD CONSTRAINT "Payment_amount_positive" CHECK ("amountCents" > 0);
ALTER TABLE "Refund" ADD CONSTRAINT "Refund_amount_positive" CHECK ("amountCents" > 0);

-- The ledger is append-only: block UPDATE and DELETE at the database level.
CREATE OR REPLACE FUNCTION forbid_ledger_mutation() RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION 'FinancialTransaction is append-only';
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER financial_transaction_immutable
BEFORE UPDATE OR DELETE ON "FinancialTransaction"
FOR EACH ROW EXECUTE FUNCTION forbid_ledger_mutation();

-- 6. Other sanity checks.
ALTER TABLE "FacilityOperatingHours"
  ADD CONSTRAINT "OperatingHours_valid" CHECK (
    "dayOfWeek" BETWEEN 0 AND 6 AND "opensMinute" BETWEEN 0 AND 1439 AND "closesMinute" BETWEEN 1 AND 1440
  );
ALTER TABLE "ReservationPolicy"
  ADD CONSTRAINT "ReservationPolicy_deposit_range" CHECK ("depositPercent" BETWEEN 0 AND 100);
ALTER TABLE "Review" ADD CONSTRAINT "Review_rating_range" CHECK ("rating" BETWEEN 1 AND 5);
