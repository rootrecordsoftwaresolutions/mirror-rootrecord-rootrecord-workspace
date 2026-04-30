import { type ClassValue, clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function shortAddr(addr: string, len = 4): string {
  if (!addr) return '';
  if (addr.length <= len * 2 + 1) return addr;
  return `${addr.slice(0, len)}…${addr.slice(-len)}`;
}

export function formatNumber(n: number | string): string {
  const num = typeof n === 'string' ? Number(n.replace(/,/g, '')) : n;
  if (!isFinite(num)) return '0';
  return num.toLocaleString('en-US');
}

export function parseSupply(s: string): bigint {
  const cleaned = s.replace(/,/g, '').trim();
  if (!cleaned) return 0n;
  return BigInt(cleaned);
}
