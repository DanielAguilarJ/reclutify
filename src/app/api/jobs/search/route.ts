import { NextResponse, type NextRequest } from 'next/server';
import { createClient } from '@/utils/supabase/server';
import type { JobListing } from '@/types/jobs';

const JOBS_PER_PAGE = 12;

/**
 * GET /api/jobs/search?q=developer&location=cdmx&job_type=remote&page=1
 * Public endpoint for client-side job search.
 */
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = request.nextUrl;
    const q = searchParams.get('q') || '';
    const location = searchParams.get('location') || '';
    const job_type = searchParams.get('job_type') || '';
    const page = Math.max(1, parseInt(searchParams.get('page') || '1', 10));
    const offset = (page - 1) * JOBS_PER_PAGE;

    const supabase = await createClient();

    let query = supabase
      .from('roles')
      .select(
        'id, org_id, title, description, location, salary, job_type, topics, published_at, organizations(name, slug, logo_url)',
        { count: 'exact' }
      )
      .eq('is_published', true)
      .order('published_at', { ascending: false, nullsFirst: false })
      .range(offset, offset + JOBS_PER_PAGE - 1);

    // Full-text search
    if (q.trim()) {
      const searchTerms = q.trim().split(/\s+/).join(' & ');
      query = query.or(
        `search_vector.fts(spanish).${searchTerms},search_vector.fts(english).${searchTerms}`
      );
    }

    // Location filter
    if (location.trim()) {
      query = query.ilike('location', `%${location.trim()}%`);
    }

    // Job type filter
    if (job_type.trim()) {
      query = query.ilike('job_type', `%${job_type.trim()}%`);
    }

    const { data, count, error } = await query;

    if (error) {
      console.error('Job search error:', error);
      return NextResponse.json(
        { jobs: [], total: 0, hasMore: false },
        { status: 500 }
      );
    }

    const jobs = (data || []) as unknown as JobListing[];
    const total = count || 0;

    const response = NextResponse.json({
      jobs,
      total,
      hasMore: offset + JOBS_PER_PAGE < total,
    });

    // Cache for 60 seconds — stale-while-revalidate for smooth UX
    response.headers.set(
      'Cache-Control',
      'public, max-age=60, s-maxage=60, stale-while-revalidate=120'
    );

    return response;
  } catch (err) {
    console.error('Job search unexpected error:', err);
    return NextResponse.json(
      { jobs: [], total: 0, hasMore: false },
      { status: 500 }
    );
  }
}
