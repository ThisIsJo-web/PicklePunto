-- AlterTable
ALTER TABLE "bookings" ADD COLUMN "is_walk_in" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "bookings" ADD COLUMN "walk_in_guest_name" TEXT;
ALTER TABLE "bookings" ADD COLUMN "walk_in_guest_phone" TEXT;
ALTER TABLE "bookings" ADD COLUMN "walk_in_guest_email" TEXT;
