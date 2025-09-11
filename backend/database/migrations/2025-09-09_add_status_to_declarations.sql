-- Migration: Add status column to declarations table
ALTER TABLE declarations ADD COLUMN status ENUM('pending','approved','rejected') DEFAULT 'pending';
