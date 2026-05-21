-- Hashtags system
CREATE TABLE IF NOT EXISTS hashtags (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tag TEXT UNIQUE NOT NULL,
  post_count INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE TABLE IF NOT EXISTS post_hashtags (
  post_id UUID NOT NULL REFERENCES posts(id) ON DELETE CASCADE,
  hashtag_id UUID NOT NULL REFERENCES hashtags(id) ON DELETE CASCADE,
  PRIMARY KEY (post_id, hashtag_id)
);
CREATE INDEX idx_hashtags_count ON hashtags(post_count DESC);
CREATE INDEX idx_post_hashtags_tag ON post_hashtags(hashtag_id);
ALTER TABLE hashtags ENABLE ROW LEVEL SECURITY;
ALTER TABLE post_hashtags ENABLE ROW LEVEL SECURITY;
CREATE POLICY "hashtags_select" ON hashtags FOR SELECT TO authenticated USING (true);
CREATE POLICY "hashtags_insert" ON hashtags FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "hashtags_update" ON hashtags FOR UPDATE TO authenticated USING (true);
CREATE POLICY "post_hashtags_select" ON post_hashtags FOR SELECT TO authenticated USING (true);
CREATE POLICY "post_hashtags_insert" ON post_hashtags FOR INSERT TO authenticated WITH CHECK (true);

CREATE OR REPLACE FUNCTION process_post_hashtags() RETURNS TRIGGER AS $$
DECLARE tag TEXT; tag_id UUID; tags TEXT[];
BEGIN
  SELECT ARRAY(SELECT DISTINCT lower(m[1]) FROM regexp_matches(NEW.content, '#([a-zA-Z0-9_]+)', 'g') AS m) INTO tags;
  IF TG_OP = 'UPDATE' THEN
    DELETE FROM post_hashtags WHERE post_id = NEW.id;
  END IF;
  IF tags IS NOT NULL THEN
    FOREACH tag IN ARRAY tags LOOP
      INSERT INTO hashtags (tag, post_count) VALUES (tag, 1)
      ON CONFLICT (tag) DO UPDATE SET post_count = hashtags.post_count + 1
      RETURNING id INTO tag_id;
      INSERT INTO post_hashtags (post_id, hashtag_id) VALUES (NEW.id, tag_id) ON CONFLICT DO NOTHING;
    END LOOP;
  END IF;
  RETURN NEW;
END; $$ LANGUAGE plpgsql SECURITY DEFINER;
CREATE TRIGGER trg_post_hashtags AFTER INSERT OR UPDATE OF content ON posts FOR EACH ROW EXECUTE FUNCTION process_post_hashtags();
