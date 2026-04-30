'use client';

import { useState } from 'react';
import { Share2, Check, Copy } from 'lucide-react';
import { toast } from 'sonner';

import { Button } from '@/components/ui/button';

type Props = {
  shareUrl: string;
  tokenLabel: string;
};

export function TokenShareBar({ shareUrl, tokenLabel }: Props) {
  const [copied, setCopied] = useState(false);

  async function copy() {
    try {
      await navigator.clipboard.writeText(shareUrl);
      setCopied(true);
      toast.success('Link copied');
      setTimeout(() => setCopied(false), 2000);
    } catch {
      toast.error('Could not copy');
    }
  }

  async function share() {
    if (typeof navigator !== 'undefined' && navigator.share) {
      try {
        await navigator.share({
          title: `${tokenLabel} · RootRecord`,
          text: `Token stats for ${tokenLabel}`,
          url: shareUrl,
        });
      } catch (e) {
        const name = e instanceof Error ? e.name : '';
        if (name !== 'AbortError') toast.error('Share was not completed');
      }
    } else {
      await copy();
    }
  }

  return (
    <div className="rounded-lg border border-border bg-ink-950/50 p-4 space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <Button type="button" variant="default" size="sm" onClick={() => void share()}>
          <Share2 className="h-4 w-4 mr-2" />
          Share
        </Button>
        <Button type="button" variant="outline" size="sm" onClick={() => void copy()}>
          {copied ? (
            <Check className="h-4 w-4 mr-2 text-sol-green" />
          ) : (
            <Copy className="h-4 w-4 mr-2" />
          )}
          Copy link
        </Button>
      </div>
      <p className="text-xs font-mono break-all text-muted-foreground leading-relaxed">
        {shareUrl}
      </p>
    </div>
  );
}
