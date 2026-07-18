-- AlterTable
ALTER TABLE `Product` ADD COLUMN `returnWindow` INTEGER NOT NULL DEFAULT 7;

-- AlterTable
ALTER TABLE `Shipment` ADD COLUMN `rmaPickupId` VARCHAR(191) NULL,
    ADD COLUMN `rmaReplacementId` VARCHAR(191) NULL,
    ADD COLUMN `type` ENUM('FORWARD', 'REVERSE', 'REPLACEMENT') NOT NULL DEFAULT 'FORWARD';

-- CreateTable
CREATE TABLE `RMARequest` (
    `id` VARCHAR(191) NOT NULL,
    `rmaNumber` VARCHAR(191) NOT NULL,
    `orderId` VARCHAR(191) NOT NULL,
    `userId` VARCHAR(191) NOT NULL,
    `type` ENUM('RETURN', 'REPLACEMENT') NOT NULL,
    `status` ENUM('PENDING', 'APPROVED', 'REJECTED', 'PICKUP_SCHEDULED', 'ITEM_RECEIVED', 'REFUND_INITIATED', 'REFUND_COMPLETED', 'REPLACEMENT_SHIPPED', 'COMPLETED', 'CANCELLED') NOT NULL DEFAULT 'PENDING',
    `reason` ENUM('DAMAGED', 'WRONG_ITEM', 'SIZE_ISSUE', 'QUALITY_ISSUE', 'NOT_AS_DESCRIBED', 'OTHER') NOT NULL,
    `customerNote` TEXT NULL,
    `adminNote` TEXT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `RMARequest_rmaNumber_key`(`rmaNumber`),
    INDEX `RMARequest_orderId_idx`(`orderId`),
    INDEX `RMARequest_userId_idx`(`userId`),
    INDEX `RMARequest_status_idx`(`status`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `RMAItem` (
    `id` VARCHAR(191) NOT NULL,
    `rmaRequestId` VARCHAR(191) NOT NULL,
    `orderItemId` VARCHAR(191) NOT NULL,
    `quantity` INTEGER NOT NULL,

    INDEX `RMAItem_rmaRequestId_idx`(`rmaRequestId`),
    INDEX `RMAItem_orderItemId_idx`(`orderItemId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `RMAImage` (
    `id` VARCHAR(191) NOT NULL,
    `rmaRequestId` VARCHAR(191) NOT NULL,
    `url` VARCHAR(191) NOT NULL,

    INDEX `RMAImage_rmaRequestId_idx`(`rmaRequestId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `Refund` (
    `id` VARCHAR(191) NOT NULL,
    `rmaRequestId` VARCHAR(191) NOT NULL,
    `amount` DECIMAL(10, 2) NOT NULL,
    `mode` ENUM('ORIGINAL_PAYMENT_METHOD', 'BANK_ACCOUNT', 'UPI') NOT NULL,
    `paymentId` VARCHAR(191) NULL,
    `status` ENUM('PENDING', 'PAID', 'FAILED', 'REFUNDED') NOT NULL DEFAULT 'PENDING',
    `bankDetails` TEXT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `Refund_rmaRequestId_key`(`rmaRequestId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `OrderAuditLog` (
    `id` VARCHAR(191) NOT NULL,
    `orderId` VARCHAR(191) NOT NULL,
    `userId` VARCHAR(191) NULL,
    `action` VARCHAR(191) NOT NULL,
    `fromState` VARCHAR(191) NULL,
    `toState` VARCHAR(191) NULL,
    `metadata` JSON NULL,
    `ipAddress` VARCHAR(191) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `OrderAuditLog_orderId_idx`(`orderId`),
    INDEX `OrderAuditLog_userId_idx`(`userId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateIndex
CREATE UNIQUE INDEX `Shipment_rmaPickupId_key` ON `Shipment`(`rmaPickupId`);

-- CreateIndex
CREATE UNIQUE INDEX `Shipment_rmaReplacementId_key` ON `Shipment`(`rmaReplacementId`);

-- AddForeignKey
ALTER TABLE `Shipment` ADD CONSTRAINT `Shipment_rmaPickupId_fkey` FOREIGN KEY (`rmaPickupId`) REFERENCES `RMARequest`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Shipment` ADD CONSTRAINT `Shipment_rmaReplacementId_fkey` FOREIGN KEY (`rmaReplacementId`) REFERENCES `RMARequest`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `RMARequest` ADD CONSTRAINT `RMARequest_orderId_fkey` FOREIGN KEY (`orderId`) REFERENCES `Order`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `RMARequest` ADD CONSTRAINT `RMARequest_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `User`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `RMAItem` ADD CONSTRAINT `RMAItem_rmaRequestId_fkey` FOREIGN KEY (`rmaRequestId`) REFERENCES `RMARequest`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `RMAItem` ADD CONSTRAINT `RMAItem_orderItemId_fkey` FOREIGN KEY (`orderItemId`) REFERENCES `orderitem`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `RMAImage` ADD CONSTRAINT `RMAImage_rmaRequestId_fkey` FOREIGN KEY (`rmaRequestId`) REFERENCES `RMARequest`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Refund` ADD CONSTRAINT `Refund_rmaRequestId_fkey` FOREIGN KEY (`rmaRequestId`) REFERENCES `RMARequest`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `OrderAuditLog` ADD CONSTRAINT `OrderAuditLog_orderId_fkey` FOREIGN KEY (`orderId`) REFERENCES `Order`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `OrderAuditLog` ADD CONSTRAINT `OrderAuditLog_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `User`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

