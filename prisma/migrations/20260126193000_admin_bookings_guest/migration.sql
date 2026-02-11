-- Allow admin-created bookings without a registered customer

ALTER TABLE "Booking" ALTER COLUMN "customerId" DROP NOT NULL;

ALTER TABLE "Booking" ADD COLUMN "customer_name" TEXT;
ALTER TABLE "Booking" ADD COLUMN "customer_email" TEXT;
ALTER TABLE "Booking" ADD COLUMN "customer_phone" TEXT;
