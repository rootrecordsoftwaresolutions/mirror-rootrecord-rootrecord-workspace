'use client';

import { Suspense, useEffect, useState } from 'react';
import Link from 'next/link';
import { usePathname, useSearchParams } from 'next/navigation';
import { Users, X } from 'lucide-react';
import {
  captureReferrerFromUrl,
  clearReferrer,
  getStoredReferrer,
  subscribeReferrerChanged,
} from '@/lib/referral';
import { shortAddr } from '@/lib/utils';
import { Button } from '@/components/ui/button';

function ReferralPillInner() {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [ref, setRef] = useState<string | null>(null);

  useEffect(() => {
    setRef(captureReferrerFromUrl());
  }, [pathname, searchParams]);

  useEffect(() => {
    return subscribeReferrerChanged(() => {
      setRef(getStoredReferrer());
    });
  }, []);

  if (!ref) return null;

  return (
    <div
      data-testid="referral-pill"
      className="hidden sm:inline-flex items-center gap-1 rounded-full border border-sol-purple/40 bg-sol-purple/10 pl-2.5 pr-1 py-1 text-xs text-sol-purple max-w-[min(100vw-12rem,20rem)]"
    >
      <Users className="h-3 w-3 shrink-0" aria-hidden />
      <Link
        href="/referrals"
        title={`Referred by ${ref} — referral hub`}
        className="font-mono truncate hover:underline min-w-0"
      >
        Ref: {shortAddr(ref, 4)}
      </Link>
      <Button
        type="button"
        variant="ghost"
        size="icon"
        className="h-6 w-6 shrink-0 text-sol-purple hover:text-foreground hover:bg-white/10"
        aria-label="Clear stored referrer"
        onClick={() => {
          clearReferrer();
          setRef(null);
        }}
      >
        <X className="h-3 w-3" />
      </Button>
    </div>
  );
}

export function ReferralPill() {
  return (
    <Suspense fallback={null}>
      <ReferralPillInner />
    </Suspense>
  );
}
