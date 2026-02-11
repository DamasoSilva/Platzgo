-- Add booking indexes for performance
CREATE INDEX "Booking_court_status_start_time_idx" ON "Booking"("courtId", "status", "start_time");
CREATE INDEX "Booking_court_start_end_idx" ON "Booking"("courtId", "start_time", "end_time");
CREATE INDEX "Booking_customer_status_start_time_idx" ON "Booking"("customerId", "status", "start_time");
