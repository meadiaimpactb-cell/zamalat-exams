-- ============================================================================
-- ترحيل: دفعة ملاحظات مراجعة العميل 2026-09-17
--   4) المدة الافتراضية للاختبار الجديد = 360 دقيقة
--   6) إعادة فتح الاختبار لطالب مقفَل (reopenedAt / reopenCount في exam_sessions)
--   9) الاسم الإنجليزي اختياري (users / fellowships / question_banks)
-- طبّقه مرة واحدة على قاعدة الإنتاج: phpMyAdmin > قاعدة u153052345_zamalat > SQL
-- آمن للتكرار (IF NOT EXISTS / MODIFY / SET DEFAULT)
-- ============================================================================

-- (4) المدة الافتراضية 360 دقيقة
ALTER TABLE `exams` ALTER `durationMin` SET DEFAULT 360;

-- (6) إعادة فتح جلسة مقفَلة مع الاحتفاظ بالإجابات
ALTER TABLE `exam_sessions`
  ADD COLUMN IF NOT EXISTS `reopenedAt` TIMESTAMP NULL DEFAULT NULL AFTER `riskScore`,
  ADD COLUMN IF NOT EXISTS `reopenCount` INT NOT NULL DEFAULT 0 AFTER `reopenedAt`;

-- (9) الاسم الإنجليزي اختياري
ALTER TABLE `users` MODIFY `nameEn` VARCHAR(255) NULL;
ALTER TABLE `fellowships` MODIFY `nameEn` VARCHAR(255) NULL;
ALTER TABLE `question_banks` MODIFY `nameEn` VARCHAR(255) NULL;
