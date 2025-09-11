-- Migration: Add correction_message column to declarations table
ALTER TABLE declarations ADD COLUMN correction_message TEXT DEFAULT NULL;
