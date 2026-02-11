-- RenameIndex
ALTER INDEX "Booking_court_start_end_idx" RENAME TO "Booking_courtId_start_time_end_time_idx";

-- RenameIndex
ALTER INDEX "Booking_court_status_start_time_idx" RENAME TO "Booking_courtId_status_start_time_idx";

-- RenameIndex
ALTER INDEX "Booking_customer_status_start_time_idx" RENAME TO "Booking_customerId_status_start_time_idx";
