-- نسخة MySQL 8.4 (Laragon المحلي) من 2026-09-client-review-batch.sql — لا تُطبَّق على الإنتاج (MariaDB يستخدم الملف الأصلي)
ALTER TABLE `exams` ALTER `durationMin` SET DEFAULT 360;
ALTER TABLE `exam_sessions`
  ADD COLUMN `reopenedAt` TIMESTAMP NULL DEFAULT NULL AFTER `riskScore`,
  ADD COLUMN `reopenCount` INT NOT NULL DEFAULT 0 AFTER `reopenedAt`;
ALTER TABLE `users` MODIFY `nameEn` VARCHAR(255) NULL;
ALTER TABLE `fellowships` MODIFY `nameEn` VARCHAR(255) NULL;
ALTER TABLE `question_banks` MODIFY `nameEn` VARCHAR(255) NULL;
