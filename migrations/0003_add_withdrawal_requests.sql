
-- Create withdrawal_requests table
CREATE TABLE IF NOT EXISTS withdrawal_requests (
  id SERIAL PRIMARY KEY,
  user_id TEXT NOT NULL,
  market_id TEXT NOT NULL,
  request_number INTEGER NOT NULL UNIQUE,
  amount INTEGER NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending',
  timestamp TIMESTAMP NOT NULL DEFAULT NOW()
);

-- Create index on request_number for faster lookups
CREATE INDEX IF NOT EXISTS idx_withdrawal_request_number ON withdrawal_requests(request_number);

-- Create index on user_id for faster user lookups
CREATE INDEX IF NOT EXISTS idx_withdrawal_user_id ON withdrawal_requests(user_id);
