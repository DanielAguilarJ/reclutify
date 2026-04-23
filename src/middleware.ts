import { NextResponse, type NextRequest } from 'next/server'
import { createClient } from '@/utils/supabase/middleware'

// Rutas que requieren autenticación
const PROTECTED_PREFIXES = ['/admin', '/onboarding'];

// Rutas públicas (no requieren autenticación)
const PUBLIC_PREFIXES = ['/', '/login', '/interview', '/practice', '/career-fair', '/pricing', '/api'];

function isProtectedRoute(pathname: string): boolean {
  return PROTECTED_PREFIXES.some(prefix => pathname.startsWith(prefix));
}

function isPublicRoute(pathname: string): boolean {
  // La raíz exacta es pública
  if (pathname === '/') return true;
  return PUBLIC_PREFIXES.some(prefix => prefix !== '/' && pathname.startsWith(prefix));
}

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

  // Refrescar la sesión del usuario de forma segura con getUser()
  const { supabaseResponse, user } = await createClient(request);

  const pathname = request.nextUrl.pathname;

  // Si la ruta es protegida y no hay usuario autenticado, redirigir a /login
  if (isProtectedRoute(pathname) && !user) {
    const loginUrl = request.nextUrl.clone();
    loginUrl.pathname = '/login';
    // Guardar la URL original para redirigir después del login
    loginUrl.searchParams.set('redirectTo', pathname);
    return NextResponse.redirect(loginUrl);
  }

  // Si el usuario ya está autenticado y visita /login, redirigir al admin
  if (pathname === '/login' && user) {
    const adminUrl = request.nextUrl.clone();
    adminUrl.pathname = '/admin';
    return NextResponse.redirect(adminUrl);
  }

  return supabaseResponse;
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
