-- Skill endorsements
CREATE TABLE IF NOT EXISTS endorsements (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  endorser_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  endorsee_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  skill TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(endorser_id, endorsee_id, skill),
  CHECK (endorser_id != endorsee_id)
);
CREATE INDEX idx_endorsements_endorsee ON endorsements(endorsee_id, skill);
CREATE INDEX idx_endorsements_endorser ON endorsements(endorser_id);
ALTER TABLE endorsements ENABLE ROW LEVEL SECURITY;
CREATE POLICY "endorsements_select" ON endorsements FOR SELECT TO authenticated USING (true);
CREATE POLICY "endorsements_insert" ON endorsements FOR INSERT TO authenticated WITH CHECK (endorser_id = auth.uid());
CREATE POLICY "endorsements_delete" ON endorsements FOR DELETE TO authenticated USING (endorser_id = auth.uid());
