-- ============================================================
-- Migration 20260504: Connections / Network System
-- Bidirectional connection requests (like LinkedIn).
-- ============================================================

-- ─── 1. TABLE: connections ───
CREATE TABLE IF NOT EXISTS public.connections (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  requester_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  addressee_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'accepted', 'declined')),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(requester_id, addressee_id),
  CHECK (requester_id != addressee_id)
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_connections_requester ON public.connections(requester_id);
CREATE INDEX IF NOT EXISTS idx_connections_addressee ON public.connections(addressee_id);
CREATE INDEX IF NOT EXISTS idx_connections_status ON public.connections(status);
CREATE INDEX IF NOT EXISTS idx_connections_accepted ON public.connections(status)
  WHERE status = 'accepted';

-- Auto-update updated_at
DROP TRIGGER IF EXISTS connections_updated_at_trigger ON public.connections;
CREATE TRIGGER connections_updated_at_trigger
  BEFORE UPDATE ON public.connections
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- ─── 2. RLS POLICIES ───
ALTER TABLE public.connections ENABLE ROW LEVEL SECURITY;

-- Users can see connections they are part of
CREATE POLICY "connections_own_select" ON public.connections
  FOR SELECT TO authenticated
  USING (requester_id = auth.uid() OR addressee_id = auth.uid());

-- Users can send connection requests
CREATE POLICY "connections_requester_insert" ON public.connections
  FOR INSERT TO authenticated
  WITH CHECK (requester_id = auth.uid());

-- Users can update connections addressed to them (accept/decline)
CREATE POLICY "connections_addressee_update" ON public.connections
  FOR UPDATE TO authenticated
  USING (addressee_id = auth.uid());

-- Users can delete their own requests or connections they're part of
CREATE POLICY "connections_own_delete" ON public.connections
  FOR DELETE TO authenticated
  USING (requester_id = auth.uid() OR addressee_id = auth.uid());

-- ─── 3. Trigger: Auto-update connection counts on profiles ───
CREATE OR REPLACE FUNCTION update_connection_counts()
RETURNS TRIGGER AS $$
BEGIN
  IF TG_OP = 'INSERT' AND NEW.status = 'accepted' THEN
    UPDATE public.profiles SET connections_count = connections_count + 1
      WHERE user_id IN (NEW.requester_id, NEW.addressee_id);
  ELSIF TG_OP = 'UPDATE' AND NEW.status = 'accepted' AND OLD.status != 'accepted' THEN
    UPDATE public.profiles SET connections_count = connections_count + 1
      WHERE user_id IN (NEW.requester_id, NEW.addressee_id);
  ELSIF TG_OP = 'UPDATE' AND OLD.status = 'accepted' AND NEW.status != 'accepted' THEN
    UPDATE public.profiles SET connections_count = GREATEST(0, connections_count - 1)
      WHERE user_id IN (OLD.requester_id, OLD.addressee_id);
  ELSIF TG_OP = 'DELETE' AND OLD.status = 'accepted' THEN
    UPDATE public.profiles SET connections_count = GREATEST(0, connections_count - 1)
      WHERE user_id IN (OLD.requester_id, OLD.addressee_id);
  END IF;
  RETURN NULL;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS connections_count_trigger ON public.connections;
CREATE TRIGGER connections_count_trigger
  AFTER INSERT OR UPDATE OR DELETE ON public.connections
  FOR EACH ROW
  EXECUTE FUNCTION update_connection_counts();

-- ─── 4. Enable Realtime ───
ALTER PUBLICATION supabase_realtime ADD TABLE public.connections;
