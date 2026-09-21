-- ============================================================================
-- ترحيل: المسارات والدفعات المرتبطة بالزمالات (ديناميكي)
-- طبّقه مرة واحدة على قاعدة الإنتاج: phpMyAdmin > قاعدة u153052345_zamalat > SQL
-- ============================================================================

CREATE TABLE IF NOT EXISTS `tracks` (
  `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `fellowshipId` BIGINT UNSIGNED NOT NULL,
  `nameAr` VARCHAR(255) NOT NULL,
  `nameEn` VARCHAR(255) NULL,
  `createdAt` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  INDEX `tracks_fellowship_idx` (`fellowshipId`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `cohorts` (
  `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `fellowshipId` BIGINT UNSIGNED NOT NULL,
  `nameAr` VARCHAR(255) NOT NULL,
  `nameEn` VARCHAR(255) NULL,
  `createdAt` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  INDEX `cohorts_fellowship_idx` (`fellowshipId`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
