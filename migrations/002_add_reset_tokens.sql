ALTER TABLE users
  ADD COLUMN reset_token_hash TEXT,
  ADD COLUMN reset_token_expires_at TIMESTAMPTZ;