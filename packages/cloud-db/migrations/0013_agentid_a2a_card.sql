-- AgentID slice S5: the identity's A2A v1.0 agent card (signed), served at
-- /.well-known/agent-card.json. ARP's own card stays in well_known_agent_card
-- and is served at /.well-known/arp-card.json. Additive + replay-safe.
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'agents' AND column_name = 'well_known_a2a_card') THEN
    ALTER TABLE agents ADD COLUMN well_known_a2a_card JSONB;
  END IF;
END$$;
