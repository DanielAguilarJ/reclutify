import type { MetadataRoute } from 'next';
import { createClient } from '@supabase/supabase-js';

// Use anon client directly (no cookies needed for public data)
function createAnonClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) return null;
  return createClient(url, key);
}

export const dynamic = 'force-dynamic';

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const baseUrl = 'https://www.reclutify.com';

  const staticPages: MetadataRoute.Sitemap = [
    {
      url: baseUrl,
      lastModified: new Date('2026-05-30'),
      changeFrequency: 'weekly',
      priority: 1,
    },
    {
      url: `${baseUrl}/pricing`,
      lastModified: new Date('2026-05-30'),
      changeFrequency: 'monthly',
      priority: 0.9,
    },
    {
      url: `${baseUrl}/career-fair`,
      lastModified: new Date(),
      changeFrequency: 'daily',
      priority: 0.9,
    },
    {
      url: `${baseUrl}/practice`,
      lastModified: new Date('2026-05-30'),
      changeFrequency: 'monthly',
      priority: 0.7,
    },
    {
      url: `${baseUrl}/privacy`,
      lastModified: new Date('2026-01-01'),
      changeFrequency: 'yearly',
      priority: 0.3,
    },
    {
      url: `${baseUrl}/terms`,
      lastModified: new Date('2026-01-01'),
      changeFrequency: 'yearly',
      priority: 0.3,
    },
  ];

  // Dynamic job pages
  let jobPages: MetadataRoute.Sitemap = [];
  try {
    const supabase = createAnonClient();
    if (supabase) {
      const { data: jobs } = await supabase
        .from('roles')
        .select('id, updated_at')
        .eq('is_published', true)
        .limit(5000);

      if (jobs) {
        jobPages = jobs.map((job) => ({
          url: `${baseUrl}/career-fair/${job.id}`,
          lastModified: job.updated_at ? new Date(job.updated_at) : new Date(),
          changeFrequency: 'weekly' as const,
          priority: 0.7,
        }));
      }
    }
  } catch {
    // Silently continue with static pages only
  }

  // Dynamic company pages
  let companyPages: MetadataRoute.Sitemap = [];
  try {
    const supabase = createAnonClient();
    if (supabase) {
      const { data: companies } = await supabase
        .from('organizations')
        .select('slug, updated_at')
        .not('slug', 'is', null)
        .limit(2000);

      if (companies) {
        companyPages = companies.map((company) => ({
          url: `${baseUrl}/company/${company.slug}`,
          lastModified: company.updated_at ? new Date(company.updated_at) : new Date(),
          changeFrequency: 'weekly' as const,
          priority: 0.6,
        }));
      }
    }
  } catch {
    // Silently continue
  }

  // Dynamic profile pages
  let profilePages: MetadataRoute.Sitemap = [];
  try {
    const supabase = createAnonClient();
    if (supabase) {
      const { data: profiles } = await supabase
        .from('profiles')
        .select('username, updated_at')
        .not('username', 'is', null)
        .limit(5000);

      if (profiles) {
        profilePages = profiles.map((profile) => ({
          url: `${baseUrl}/profile/${profile.username}`,
          lastModified: profile.updated_at ? new Date(profile.updated_at) : new Date(),
          changeFrequency: 'weekly' as const,
          priority: 0.5,
        }));
      }
    }
  } catch {
    // Silently continue with static pages only
  }

  return [...staticPages, ...jobPages, ...companyPages, ...profilePages];
}
