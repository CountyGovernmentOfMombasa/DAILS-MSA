-- Migration: Add phone_number column to users table
ALTER TABLE users ADD COLUMN phone_number VARCHAR(20) AFTER email;