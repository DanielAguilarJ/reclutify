import { NextResponse, type NextRequest } from 'next/server'
import { createClient } from '@/utils/supabase/middleware'

export async function middleware(request: NextRequest) {
  // Enforce www.reclutify.com in production
  const hostname = request.headers.get('host') || request.nextUrl.hostname;
  
  if (
    process.env.NODE_ENV === 'production' &&
    (hostname === 'reclutify.vercel.app' || hostname === 'reclutify.com')
  ) {
    const url = request.nextUrl.clone();
    url.hostname = 'www.reclutify.com';
    url.port = ''; // Ensure no custom port is preserved on redirect
    return NextResponse.redirect(url, 308); // 308 Permanent Redirect
  }

  // This updates the user's auth session securely by refreshing the token if needed
  return await createClient(request)
}

export const config = {
  matcher: [
    /*
     * Match all request paths except for the ones starting with:
     * - _next/static (static files)
     * - _next/image (image optimization files)
     * - favicon.ico (favicon file)
     * Feel free to modify this pattern to include more paths.
     */
    '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
}
