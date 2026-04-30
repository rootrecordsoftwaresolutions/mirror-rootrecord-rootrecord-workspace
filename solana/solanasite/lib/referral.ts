'use client';

import { PublicKey } from '@solana/web3.js';

const REF_KEY = 'rootrecord_referrer';

export const REF_QUERY_PARAM = 'ref';

const CHANGED = 'rootrecord-referrer-changed';

function notifyReferrerChanged(): void {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(new CustomEvent(CHANGED));
}

/** Subscribe to referrer localStorage updates (same tab: capture, clear). */
export function subscribeReferrerChanged(cb: () => void): () => void {
  if (typeof window === 'undefined') return () => {};
  const fn = () => cb();
  window.addEventListener(CHANGED, fn);
  window.addEventListener('storage', fn);
  return () => {
    window.removeEventListener(CHANGED, fn);
    window.removeEventListener('storage', fn);
  };
}

/**
 * Build an absolute URL with ?ref= for sharing (caller supplies origin, e.g.
 * `window.location.origin` or NEXT_PUBLIC_SITE_URL).
 */
export function buildReferralUrl(
  origin: string,
  pathname: string,
  refWallet: string,
): string {
  const o = origin.replace(/\/$/, '');
  const p = pathname.startsWith('/') ? pathname : `/${pathname}`;
  const u = new URL(p, o);
  u.searchParams.set(REF_QUERY_PARAM, refWallet.trim());
  return u.toString();
}

/** Merge into action-log metadata when a fee transaction may include RR_REF memo. */
export function withReferrerMetadata<T extends Record<string, unknown>>(
  base: T,
): T & { referrer?: string } {
  const r = getStoredReferrer();
  if (!r) return base as T & { referrer?: string };
  return { ...base, referrer: r };
}

export function isValidReferrerAddress(ref: string): boolean {
  const t = ref.trim();
  if (!t) return false;
  try {
    new PublicKey(t);
    return true;
  } catch {
    return false;
  }
}

/**
 * Reads `?ref=` from the URL, validates it as a Solana address, stores it in
 * localStorage, and returns the stored value (new or previous).
 */
export function captureReferrerFromUrl(): string | null {
  if (typeof window === 'undefined') return null;
  const params = new URLSearchParams(window.location.search);
  const ref = params.get('ref')?.trim() ?? '';
  if (ref && isValidReferrerAddress(ref)) {
    try {
      const prev = window.localStorage.getItem(REF_KEY);
      window.localStorage.setItem(REF_KEY, ref);
      if (prev !== ref) notifyReferrerChanged();
      return ref;
    } catch {
      return ref;
    }
  }
  return getStoredReferrer();
}

export function getStoredReferrer(): string | null {
  if (typeof window === 'undefined') return null;
  try {
    const v = window.localStorage.getItem(REF_KEY)?.trim() ?? '';
    if (!v) return null;
    return isValidReferrerAddress(v) ? v : null;
  } catch {
    return null;
  }
}

export function clearReferrer(): void {
  if (typeof window === 'undefined') return;
  try {
    const had = window.localStorage.getItem(REF_KEY);
    window.localStorage.removeItem(REF_KEY);
    if (had) notifyReferrerChanged();
  } catch {
    /* noop */
  }
}
