-- Onboarding refactor: persist the "personal vs brand" toggle.
-- Firestore stores this as users.accountType; mirror it here for dual-write.
ALTER TABLE users ADD COLUMN IF NOT EXISTS account_type TEXT DEFAULT 'personal';
