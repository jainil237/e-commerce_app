-- Add orderId column to StockReservation
ALTER TABLE `StockReservation` ADD COLUMN `orderId` VARCHAR(191);

-- Add index on orderId for efficient lookups during conversion
CREATE INDEX `StockReservation_orderId_idx` ON `StockReservation`(`orderId`);

-- Add foreign key constraint to Order
ALTER TABLE `StockReservation` ADD CONSTRAINT `StockReservation_orderId_fkey` FOREIGN KEY (`orderId`) REFERENCES `Order`(`id`) ON DELETE CASCADE;
