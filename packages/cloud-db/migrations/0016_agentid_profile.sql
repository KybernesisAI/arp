-- AgentID S6c: the identity profile lives on the identity.
--
-- avatar_data: the picture as base64 (browser-resized to 512×512, ≤ 400 KB),
-- served by the gateway at https://<sld>.agent.arp.run/avatar.png. accent: a
-- hex colour. Additive + replay-safe.
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'agents' AND column_name = 'avatar_data') THEN
    ALTER TABLE agents ADD COLUMN avatar_data TEXT;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'agents' AND column_name = 'avatar_mime') THEN
    ALTER TABLE agents ADD COLUMN avatar_mime TEXT;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'agents' AND column_name = 'accent') THEN
    ALTER TABLE agents ADD COLUMN accent TEXT;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'agents' AND column_name = 'profile_updated_at') THEN
    ALTER TABLE agents ADD COLUMN profile_updated_at TIMESTAMPTZ;
  END IF;
END$$;
