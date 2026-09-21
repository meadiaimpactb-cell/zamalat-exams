-- ============================================================================
-- ترحيل: دورا "مسؤول الشؤون الفنية العام" و"مدير الزمالة" + هاتف المستخدم + ربط الزمالات
-- طبّقه مرة واحدة على قاعدة الإنتاج: phpMyAdmin > SQL
-- ============================================================================

-- توسيع أدوار المستخدمين
ALTER TABLE `users`
  MODIFY COLUMN `role` ENUM('super_admin','admin','tech_general','fellowship_manager','expert') NOT NULL;

-- هاتف المستخدم (التسجيل المبدئي عبر رقم الهاتف)
ALTER TABLE `users`
  ADD COLUMN IF NOT EXISTS `phone` VARCHAR(30) NULL AFTER `role`;

-- ربط مدير الزمالة بالزمالات التي يديرها (نطاق رؤيته)
CREATE TABLE IF NOT EXISTS `user_fellowships` (
  `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `userId` BIGINT UNSIGNED NOT NULL,
  `fellowshipId` BIGINT UNSIGNED NOT NULL,
  `createdAt` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `user_fellowship_uq` (`userId`, `fellowshipId`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
