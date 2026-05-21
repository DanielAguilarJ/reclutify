-- ============================================================
-- Migration 20260505: Direct Messaging System
-- Real-time messaging between connected users.
-- ============================================================

-- ─── 1. TABLE: conversations ───
CREATE TABLE IF NOT EXISTS public.conversations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  participant_ids UUID[] NOT NULL,
  last_message_at TIMESTAMPTZ DEFAULT NOW(),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_conversations_participants ON public.conversations USING GIN(participant_ids);
CREATE INDEX IF NOT EXISTS idx_conversations_last_message ON public.conversations(last_message_at DESC);

-- ─── 2. TABLE: messages ───
CREATE TABLE IF NOT EXISTS public.messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id UUID NOT NULL REFERENCES public.conversations(id) ON DELETE CASCADE,
  sender_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  content TEXT NOT NULL CHECK (char_length(content) BETWEEN 1 AND 2000),
  read_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_messages_conversation ON public.messages(conversation_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_messages_sender ON public.messages(sender_id);

-- ─── 3. Trigger: Update conversation last_message_at ───
CREATE OR REPLACE FUNCTION update_conversation_last_message()
RETURNS TRIGGER AS $$
BEGIN
  UPDATE public.conversations
    SET last_message_at = NEW.created_at
    WHERE id = NEW.conversation_id;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS messages_update_conversation ON public.messages;
CREATE TRIGGER messages_update_conversation
  AFTER INSERT ON public.messages
  FOR EACH ROW
  EXECUTE FUNCTION update_conversation_last_message();

-- ─── 4. RLS POLICIES ───
ALTER TABLE public.conversations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.messages ENABLE ROW LEVEL SECURITY;

-- Conversations: only participants can see
CREATE POLICY "conversations_participant_select" ON public.conversations
  FOR SELECT TO authenticated
  USING (auth.uid() = ANY(participant_ids));

-- Conversations: authenticated users can create
CREATE POLICY "conversations_participant_insert" ON public.conversations
  FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = ANY(participant_ids));

-- Messages: only conversation participants can read
CREATE POLICY "messages_participant_select" ON public.messages
  FOR SELECT TO authenticated
  USING (conversation_id IN (
    SELECT id FROM public.conversations WHERE auth.uid() = ANY(participant_ids)
  ));

-- Messages: only sender can insert (must be participant)
CREATE POLICY "messages_sender_insert" ON public.messages
  FOR INSERT TO authenticated
  WITH CHECK (
    sender_id = auth.uid()
    AND conversation_id IN (
      SELECT id FROM public.conversations WHERE auth.uid() = ANY(participant_ids)
    )
  );

-- Messages: sender can update (for read receipts)
CREATE POLICY "messages_participant_update" ON public.messages
  FOR UPDATE TO authenticated
  USING (conversation_id IN (
    SELECT id FROM public.conversations WHERE auth.uid() = ANY(participant_ids)
  ));

-- ─── 5. Enable Realtime ───
ALTER PUBLICATION supabase_realtime ADD TABLE public.messages;
ALTER PUBLICATION supabase_realtime ADD TABLE public.conversations;
