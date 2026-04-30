'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { BarChart3, ArrowRight } from 'lucide-react';

import { Button } from '@/components/ui/button';
import {
  Card,
  CardHeader,
  CardTitle,
  CardContent,
} from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

export default function TokenStatsLandingPage() {
  const router = useRouter();
  const [mint, setMint] = useState('');
  const [err, setErr] = useState<string | null>(null);

  function submit(e: React.FormEvent) {
    e.preventDefault();
    const trimmed = mint.trim();
    if (!trimmed) {
      setErr('Enter a mint address');
      return;
    }
    setErr(null);
    router.push(`/ref/${trimmed}`);
  }

  return (
    <div className="container py-14 md:py-20 max-w-lg">
      <div className="text-xs uppercase tracking-[0.2em] text-muted-foreground mb-3 flex items-center gap-2">
        <BarChart3 className="h-4 w-4" />
        Token stats
      </div>
      <h1 className="font-display text-4xl md:text-5xl tracking-tight">
        Shareable token dashboard
      </h1>
      <p className="mt-5 text-muted-foreground">
        Enter a mint to open a public stats page you can share: supply, authorities, largest
        token accounts, Jupiter price snapshot, and Metaplex metadata when present.
      </p>

      <Card className="mt-10">
        <CardHeader>
          <CardTitle>Mint address</CardTitle>
        </CardHeader>
        <CardContent>
          <form onSubmit={submit} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="mint">SPL mint</Label>
              <Input
                id="mint"
                placeholder="So11111111111111111111111111111111111111112"
                value={mint}
                onChange={(e) => {
                  setMint(e.target.value);
                  setErr(null);
                }}
                className="font-mono text-sm"
                autoComplete="off"
                spellCheck={false}
              />
              {err ? <p className="text-sm text-rose-400">{err}</p> : null}
            </div>
            <Button type="submit" className="w-full sm:w-auto">
              View token dashboard
              <ArrowRight className="h-4 w-4 ml-2" />
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
