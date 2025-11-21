
-- Add shiny_catches and rare_shiny_catches columns to users table
ALTER TABLE users ADD COLUMN IF NOT EXISTS shiny_catches INTEGER NOT NULL DEFAULT 0;
ALTER TABLE users ADD COLUMN IF NOT EXISTS rare_shiny_catches INTEGER NOT NULL DEFAULT 0;
