'use client';

import { Suspense, useEffect } from 'react';
import { usePathname, useSearchParams } from 'next/navigation';
import { captureReferrerFromUrl } from '@/lib/referral';

/**
 * Re-runs ?ref= capture on route / query changes (ReferralPill alone only mounts once).
 */
function ReferralCaptureInner() {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  useEffect(() => {
    captureReferrerFromUrl();
  }, [pathname, searchParams]);
  return null;
}

export function ReferralCapture() {
  return (
    <Suspense fallback={null}>
      <ReferralCaptureInner />
    </Suspense>
  );
}
