
-- Add withdrawal_channel_id column to bot_settings table
ALTER TABLE bot_settings ADD COLUMN IF NOT EXISTS withdrawal_channel_id TEXT;
