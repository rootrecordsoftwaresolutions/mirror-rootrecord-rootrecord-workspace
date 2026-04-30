'use client';

import { useCallback, useEffect, useState } from 'react';
import { toast } from 'sonner';
import { LogIn } from 'lucide-react';

import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { emitCustodialNeedsAuth, getRootRecordApiBase, rootrecordLogin } from '@/lib/rootrecordSession';

const EVENT = 'rootrecord-custodial-needs-auth';

/**
 * Sign in with the same email/password as rootrecord.info to use the custodial "RootRecord (web)" wallet.
 */
export function RootRecordAuthDialog() {
  const [open, setOpen] = useState(false);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [hasApi, setHasApi] = useState(false);

  useEffect(() => {
    setHasApi(Boolean(getRootRecordApiBase()));
  }, []);

  const onOpen = useCallback(() => setOpen(true), []);

  useEffect(() => {
    const h = () => onOpen();
    window.addEventListener(EVENT, h);
    return () => window.removeEventListener(EVENT, h);
  }, [onOpen]);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    try {
      const r = await rootrecordLogin(email, password);
      if (!r.ok) {
        toast.error('Sign-in failed', { description: r.detail });
        return;
      }
      toast.success('Signed in', { description: 'You can connect “RootRecord (web)” in the wallet menu.' });
      setOpen(false);
      setPassword('');
    } catch (err) {
      toast.error('Sign-in failed', { description: err instanceof Error ? err.message : 'Unknown error' });
    } finally {
      setBusy(false);
    }
  }

  if (!hasApi) return null;

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent className="max-w-md border-border bg-ink-800 sm:max-w-md">
        <form onSubmit={onSubmit}>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <LogIn className="h-5 w-5 text-sol-green" />
              RootRecord account sign-in
            </DialogTitle>
            <DialogDescription>
              Use the same email and password as{' '}
              <a
                href="https://rootrecord.info/account.html"
                target="_blank"
                rel="noreferrer"
                className="text-sol-green hover:underline"
              >
                rootrecord.info → Account
              </a>
              . Required for the <strong>RootRecord (web)</strong> wallet that signs on our servers (custodial)
              when you can&apos;t use Phantom / Solflare / Jupiter. You still need a web wallet created on
              the Account page first.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <Label htmlFor="rr-auth-email">Email</Label>
              <Input
                id="rr-auth-email"
                type="email"
                autoComplete="username"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="font-mono text-sm"
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="rr-auth-password">Password</Label>
              <Input
                id="rr-auth-password"
                type="password"
                autoComplete="current-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
              />
            </div>
          </div>
          <DialogFooter className="gap-2 sm:gap-0">
            <Button type="button" variant="ghost" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={busy}>
              {busy ? 'Signing in…' : 'Sign in'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

/** Renders a control that opens the same dialog (e.g. header). */
export function AccountSignInButton() {
  const [hasApi, setHasApi] = useState(false);
  useEffect(() => {
    setHasApi(Boolean(getRootRecordApiBase()));
  }, []);
  if (!hasApi) return null;
  return (
    <Button
      type="button"
      variant="ghost"
      size="sm"
      className="text-muted-foreground hover:text-foreground h-8 text-xs"
      onClick={() => emitCustodialNeedsAuth()}
    >
      Account sign-in
    </Button>
  );
}
