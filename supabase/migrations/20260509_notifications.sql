-- Notifications system
CREATE TABLE IF NOT EXISTS notifications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  type TEXT NOT NULL CHECK (type IN ('connection_request','connection_accepted','post_reaction','post_comment','message','profile_view','job_application','endorsement','follow')),
  title TEXT NOT NULL,
  body TEXT,
  metadata JSONB DEFAULT '{}',
  read BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX idx_notifications_user ON notifications(user_id, created_at DESC);
CREATE INDEX idx_notifications_unread ON notifications(user_id) WHERE read = false;
ALTER TABLE notifications ENABLE ROW LEVEL SECURITY;
CREATE POLICY "notif_own_select" ON notifications FOR SELECT USING (user_id = auth.uid());
CREATE POLICY "notif_insert" ON notifications FOR INSERT WITH CHECK (true);
CREATE POLICY "notif_own_update" ON notifications FOR UPDATE USING (user_id = auth.uid());
CREATE POLICY "notif_own_delete" ON notifications FOR DELETE USING (user_id = auth.uid());
ALTER PUBLICATION supabase_realtime ADD TABLE notifications;

CREATE OR REPLACE FUNCTION notify_connection_request() RETURNS TRIGGER AS $$
BEGIN
  IF NEW.status = 'pending' THEN
    INSERT INTO notifications (user_id, type, title, metadata)
    VALUES (NEW.addressee_id, 'connection_request', 'New connection request',
      jsonb_build_object('connection_id', NEW.id, 'requester_id', NEW.requester_id));
  END IF;
  RETURN NEW;
END; $$ LANGUAGE plpgsql SECURITY DEFINER;
CREATE TRIGGER trg_notify_conn_request AFTER INSERT ON connections FOR EACH ROW EXECUTE FUNCTION notify_connection_request();

CREATE OR REPLACE FUNCTION notify_connection_accepted() RETURNS TRIGGER AS $$
BEGIN
  IF OLD.status = 'pending' AND NEW.status = 'accepted' THEN
    INSERT INTO notifications (user_id, type, title, metadata)
    VALUES (NEW.requester_id, 'connection_accepted', 'Connection accepted',
      jsonb_build_object('connection_id', NEW.id, 'accepter_id', NEW.addressee_id));
  END IF;
  RETURN NEW;
END; $$ LANGUAGE plpgsql SECURITY DEFINER;
CREATE TRIGGER trg_notify_conn_accepted AFTER UPDATE ON connections FOR EACH ROW EXECUTE FUNCTION notify_connection_accepted();

CREATE OR REPLACE FUNCTION notify_post_reaction() RETURNS TRIGGER AS $$
DECLARE post_owner UUID;
BEGIN
  SELECT user_id INTO post_owner FROM posts WHERE id = NEW.post_id;
  IF post_owner IS NOT NULL AND post_owner != NEW.user_id THEN
    INSERT INTO notifications (user_id, type, title, metadata)
    VALUES (post_owner, 'post_reaction', 'New reaction on your post',
      jsonb_build_object('post_id', NEW.post_id, 'reactor_id', NEW.user_id, 'reaction_type', NEW.reaction_type));
  END IF;
  RETURN NEW;
END; $$ LANGUAGE plpgsql SECURITY DEFINER;
CREATE TRIGGER trg_notify_reaction AFTER INSERT ON post_reactions FOR EACH ROW EXECUTE FUNCTION notify_post_reaction();

CREATE OR REPLACE FUNCTION notify_post_comment() RETURNS TRIGGER AS $$
DECLARE post_owner UUID;
BEGIN
  SELECT user_id INTO post_owner FROM posts WHERE id = NEW.post_id;
  IF post_owner IS NOT NULL AND post_owner != NEW.user_id THEN
    INSERT INTO notifications (user_id, type, title, metadata)
    VALUES (post_owner, 'post_comment', 'New comment on your post',
      jsonb_build_object('post_id', NEW.post_id, 'commenter_id', NEW.user_id));
  END IF;
  RETURN NEW;
END; $$ LANGUAGE plpgsql SECURITY DEFINER;
CREATE TRIGGER trg_notify_comment AFTER INSERT ON post_comments FOR EACH ROW EXECUTE FUNCTION notify_post_comment();
