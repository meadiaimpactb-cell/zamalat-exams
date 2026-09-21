-- ============================================================================
-- ترحيل المرحلة الأولى من متطلبات الشركة (أغسطس 2026)
-- طبّقه على قاعدة الإنتاج مرة واحدة: phpMyAdmin > قاعدة u153052345_zamalat > SQL
-- آمن للتكرار (IF NOT EXISTS / IF NOT EXISTS للجدول).
-- ============================================================================

-- (1) صورة داخل نص السؤال + السماح بإجابة صورة
ALTER TABLE `questions`
  ADD COLUMN IF NOT EXISTS `imageUrl` MEDIUMTEXT NULL AFTER `textEn`,
  ADD COLUMN IF NOT EXISTS `allowImageAnswer` TINYINT(1) NOT NULL DEFAULT 0 AFTER `imageUrl`;

-- (1) إجابة على شكل صورة يرفعها المشارك
ALTER TABLE `answers`
  ADD COLUMN IF NOT EXISTS `answerImageUrl` MEDIUMTEXT NULL AFTER `answerText`;

-- (5) فترة التقاط لقطات الكاميرا + (8) حد الخروج من ملء الشاشة
ALTER TABLE `exams`
  ADD COLUMN IF NOT EXISTS `snapshotIntervalSec` INT NOT NULL DEFAULT 60 AFTER `cameraRequired`,
  ADD COLUMN IF NOT EXISTS `maxFullscreenExits` INT NOT NULL DEFAULT 3 AFTER `snapshotIntervalSec`;

-- (5) جدول لقطات المراقبة الدورية
CREATE TABLE IF NOT EXISTS `session_snapshots` (
  `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `sessionId` BIGINT UNSIGNED NOT NULL,
  `image` LONGTEXT NOT NULL,
  `kind` ENUM('camera','screen') NOT NULL DEFAULT 'camera',
  `flagged` TINYINT(1) NOT NULL DEFAULT 0,
  `capturedAt` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  INDEX `session_snapshots_session_idx` (`sessionId`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
