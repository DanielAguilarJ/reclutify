-- Tabla organizations
CREATE TABLE IF NOT EXISTS organizations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  slug TEXT UNIQUE NOT NULL,
  plan TEXT DEFAULT 'free' CHECK (plan IN ('free', 'pro', 'enterprise')),
  max_interviews_per_month INTEGER DEFAULT 10,
  logo_url TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Tabla de perfiles de usuario
CREATE TABLE IF NOT EXISTS user_profiles (
  user_id UUID PRIMARY KEY REFERENCES auth.users(id),
  org_id UUID REFERENCES organizations(id),
  full_name TEXT,
  role TEXT DEFAULT 'member',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Tabla roles
CREATE TABLE IF NOT EXISTS roles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID REFERENCES organizations(id),
  title TEXT NOT NULL,
  description TEXT,
  location TEXT,
  salary TEXT,
  job_type TEXT,
  topics JSONB,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Tabla candidates
CREATE TABLE IF NOT EXISTS candidates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID REFERENCES organizations(id),
  role_id UUID REFERENCES roles(id),
  name TEXT,
  email TEXT,
  phone TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Tabla interviews
CREATE TABLE IF NOT EXISTS interviews (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  candidate_id UUID REFERENCES candidates(id),
  org_id UUID REFERENCES organizations(id),
  status TEXT,
  evaluation JSONB,
  transcript JSONB,
  duration INTEGER,
  video_url TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- RLS policies para aislamiento de datos (Multi-tenant)
ALTER TABLE organizations ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE roles ENABLE ROW LEVEL SECURITY;
ALTER TABLE candidates ENABLE ROW LEVEL SECURITY;
ALTER TABLE interviews ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their own organization" ON organizations
  FOR SELECT USING (id IN (SELECT org_id FROM user_profiles WHERE user_id = auth.uid()));

CREATE POLICY "Users can update their own organization" ON organizations
  FOR UPDATE USING (id IN (SELECT org_id FROM user_profiles WHERE user_id = auth.uid()));

CREATE POLICY "Users can view own profile" ON user_profiles
  FOR SELECT USING (user_id = auth.uid());

CREATE POLICY "Users can update own profile" ON user_profiles
  FOR UPDATE USING (user_id = auth.uid());

CREATE POLICY "org_isolation_roles" ON roles
  USING (org_id IN (SELECT org_id FROM user_profiles WHERE user_id = auth.uid()));

CREATE POLICY "org_isolation_candidates" ON candidates
  USING (org_id IN (SELECT org_id FROM user_profiles WHERE user_id = auth.uid()));

CREATE POLICY "org_isolation_interviews" ON interviews
  USING (org_id IN (SELECT org_id FROM user_profiles WHERE user_id = auth.uid()));
