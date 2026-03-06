import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

export function middleware(request: NextRequest) {
  const token = request.cookies.get('verdant_token')?.value;
  const { pathname } = request.nextUrl;

  // Decode role from JWT payload (without verification — gateway handles that)
  const getRole = (jwt: string): string | null => {
    try {
      const payload = JSON.parse(Buffer.from(jwt.split('.')[1], 'base64').toString());
      return payload.role || null;
    } catch {
      return null;
    }
  };

  // Protect /vendor/* routes — must have vendor or admin role
  if (pathname.startsWith('/vendor')) {
    if (!token) {
      return NextResponse.redirect(new URL('/auth/login?redirect=' + pathname, request.url));
    }
    const role = getRole(token);
    if (role !== 'vendor' && role !== 'admin') {
      return NextResponse.redirect(new URL('/', request.url));
    }
  }

  // Protect /admin/* routes — must have admin role
  if (pathname.startsWith('/admin')) {
    if (!token) {
      return NextResponse.redirect(new URL('/auth/login?redirect=' + pathname, request.url));
    }
    const role = getRole(token);
    if (role !== 'admin') {
      return NextResponse.redirect(new URL('/', request.url));
    }
  }

  // Protect /orders route — must be authenticated
  if (pathname.startsWith('/orders') || pathname.startsWith('/checkout')) {
    if (!token) {
      return NextResponse.redirect(new URL('/auth/login?redirect=' + pathname, request.url));
    }
  }

  // Redirect logged-in users away from auth pages
  if (pathname.startsWith('/auth/login') || pathname.startsWith('/auth/register')) {
    if (token) {
      const role = getRole(token);
      if (role === 'admin') return NextResponse.redirect(new URL('/admin/dashboard', request.url));
      if (role === 'vendor') return NextResponse.redirect(new URL('/vendor/dashboard', request.url));
      return NextResponse.redirect(new URL('/', request.url));
    }
  }

  return NextResponse.next();
}

export const config = {
  matcher: ['/vendor/:path*', '/admin/:path*', '/orders/:path*', '/checkout/:path*', '/auth/login', '/auth/register'],
};
