import { NextResponse, type NextRequest } from 'next/server'
import { createClient } from '@/utils/supabase/middleware'

// Rutas que requieren autenticación
const PROTECTED_PREFIXES = ['/admin', '/onboarding', '/profile/edit', '/feed', '/messages', '/network'];

// Rutas públicas específicas (no requieren autenticación)
const PUBLIC_PREFIXES = ['/interview', '/practice', '/career-fair', '/pricing', '/api', '/profile'];

/**
 * Determina si una ruta es protegida (requiere autenticación)
 */
function isProtectedRoute(pathname: string): boolean {
  return PROTECTED_PREFIXES.some(prefix => pathname.startsWith(prefix));
}

/**
 * Determina si una ruta es pública (no requiere autenticación)
 */
function isPublicRoute(pathname: string): boolean {
  if (pathname === '/') return true;
  if (pathname === '/login') return true;
  return PUBLIC_PREFIXES.some(prefix => pathname.startsWith(prefix));
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
  const { supabaseResponse, supabase, user } = await createClient(request);

  const pathname = request.nextUrl.pathname;

  // ─── CASO 1: No autenticado + ruta protegida → /login ───
  if (isProtectedRoute(pathname) && !user) {
    const loginUrl = request.nextUrl.clone();
    loginUrl.pathname = '/login';
    // Guardar la URL original para redirigir después del login
    loginUrl.searchParams.set('redirectTo', pathname);
    return NextResponse.redirect(loginUrl);
  }

  // Para usuarios autenticados, verificar si tienen organización configurada.
  // Solo hacemos esta query cuando es necesario para las decisiones de routing.
  if (user && supabase) {
    const needsOrgCheck =
      pathname === '/' ||
      pathname === '/login' ||
      pathname.startsWith('/admin') ||
      pathname === '/onboarding';

    if (needsOrgCheck) {
      const { data: profile } = await supabase
        .from('user_profiles')
        .select('org_id')
        .eq('user_id', user.id)
        .single();

      const hasOrg = !!profile?.org_id;

      // ─── CASO 2: Autenticado + /login → /admin o /onboarding ───
      if (pathname === '/login') {
        const redirectUrl = request.nextUrl.clone();
        redirectUrl.pathname = hasOrg ? '/admin' : '/onboarding';
        redirectUrl.search = '';
        return NextResponse.redirect(redirectUrl);
      }

      // ─── CASO 3: Autenticado + / (root) → /admin o /onboarding ───
      if (pathname === '/') {
        const redirectUrl = request.nextUrl.clone();
        redirectUrl.pathname = hasOrg ? '/admin' : '/onboarding';
        redirectUrl.search = '';
        return NextResponse.redirect(redirectUrl);
      }

      // ─── CASO 4: Autenticado + /admin/* pero SIN org → /onboarding ───
      if (pathname.startsWith('/admin') && !hasOrg) {
        const onboardingUrl = request.nextUrl.clone();
        onboardingUrl.pathname = '/onboarding';
        onboardingUrl.search = '';
        return NextResponse.redirect(onboardingUrl);
      }

      // ─── CASO 5: Autenticado + /onboarding pero YA tiene org → /admin ───
      if (pathname === '/onboarding' && hasOrg) {
        const adminUrl = request.nextUrl.clone();
        adminUrl.pathname = '/admin';
        adminUrl.search = '';
        return NextResponse.redirect(adminUrl);
      }
    }
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
