import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';

/** Preserve query string (e.g. ?mint=, ?pool=) when moving the old route. */
export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;
  if (pathname !== '/launch' && pathname !== '/launch/') {
    return NextResponse.next();
  }
  const url = request.nextUrl.clone();
  url.pathname = '/liquidity';
  return NextResponse.redirect(url, 308);
}

export const config = {
  matcher: ['/launch', '/launch/'],
};
