-- Company public pages extension
ALTER TABLE organizations ADD COLUMN IF NOT EXISTS description TEXT;
ALTER TABLE organizations ADD COLUMN IF NOT EXISTS industry TEXT;
ALTER TABLE organizations ADD COLUMN IF NOT EXISTS company_size TEXT;
ALTER TABLE organizations ADD COLUMN IF NOT EXISTS cover_url TEXT;
ALTER TABLE organizations ADD COLUMN IF NOT EXISTS website TEXT;
ALTER TABLE organizations ADD COLUMN IF NOT EXISTS social_links JSONB DEFAULT '{}';
ALTER TABLE organizations ADD COLUMN IF NOT EXISTS followers_count INTEGER DEFAULT 0;
ALTER TABLE organizations ADD COLUMN IF NOT EXISTS founded_year INTEGER;
ALTER TABLE organizations ADD COLUMN IF NOT EXISTS headquarters TEXT;

CREATE POLICY "public_company_select" ON organizations FOR SELECT TO anon, authenticated USING (true);
