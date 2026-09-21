-- Short invitation links. The full signed invitation stays in the row; the
-- link carries only this unguessable token (in the URL fragment, so it never
-- reaches server access logs). Same capability as the long link: whoever
-- holds it can open the invitation. Additive + replay-safe.
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'pairing_invitations' AND column_name = 'short_token') THEN
    ALTER TABLE pairing_invitations ADD COLUMN short_token TEXT;
    CREATE UNIQUE INDEX IF NOT EXISTS pairing_invitations_short_token ON pairing_invitations (short_token);
  END IF;
END$$;
