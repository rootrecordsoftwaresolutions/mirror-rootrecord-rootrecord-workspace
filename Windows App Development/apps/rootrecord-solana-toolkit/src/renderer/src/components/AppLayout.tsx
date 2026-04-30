import { useState } from "react";
import { Link, NavLink, Outlet } from "react-router-dom";
import { useWallet } from "@solana/wallet-adapter-react";
import { Menu, KeyRound } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { WalletMultiButtonWrap } from "@/components/wallet/WalletButton";
import { useLocalKeypairImport } from "@/components/SolanaProviders";
import { cn } from "@/lib/utils";

const NAV: { to: string; label: string }[] = [
  { to: "/start", label: "Start" },
  { to: "/create", label: "Create" },
  { to: "/liquidity", label: "Liquidity" },
  { to: "/tools", label: "Tools" },
  { to: "/contracts/vesting", label: "Vesting" },
  { to: "/recent-tokens", label: "New tokens" },
  { to: "/ecosystem", label: "Purpose" },
  { to: "/bulk", label: "Bulk SOL" },
  { to: "/wallet", label: "Wallet gen" },
  { to: "/referrals", label: "Referrals" },
  { to: "/pricing", label: "Pricing" },
  { to: "/docs", label: "Docs" },
];

export function AppLayout() {
  const { connected } = useWallet();
  const { importLocalKeypair } = useLocalKeypairImport();
  const [menuOpen, setMenuOpen] = useState(false);
  const [keyOpen, setKeyOpen] = useState(false);
  const [secret, setSecret] = useState("");

  return (
    <div className="min-h-screen flex flex-col bg-ink-900">
      <header
        className="sticky top-0 z-40 border-b border-border bg-ink-900/80 backdrop-blur-md"
        data-testid="site-header"
      >
        <div className="container flex h-16 items-center justify-between gap-3">
          <Link
            to="/"
            className="flex items-baseline gap-2 min-w-0 shrink"
            data-testid="brand-link"
          >
            <span className="text-lg font-semibold tracking-tight text-foreground">
              Root<span className="text-sol-green">Record</span>
            </span>
            <span className="text-xs text-muted-foreground hidden sm:inline">
              / Solana Toolkit
            </span>
          </Link>

          <div className="flex items-center gap-2 shrink-0">
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="hidden sm:inline-flex"
              onClick={() => setKeyOpen(true)}
            >
              <KeyRound className="h-4 w-4 mr-1.5" />
              Local key
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              aria-label="Open navigation"
              onClick={() => setMenuOpen(true)}
            >
              <Menu className="h-5 w-5" />
            </Button>
            {connected && (
              <Link
                to="/my-actions"
                className="text-sm text-muted-foreground hover:text-foreground hidden md:inline"
              >
                My actions
              </Link>
            )}
            <WalletMultiButtonWrap />
          </div>
        </div>
      </header>

      <div className="sm:hidden border-b border-border/60 px-4 py-2">
        <Button
          type="button"
          variant="secondary"
          size="sm"
          className="w-full"
          onClick={() => setKeyOpen(true)}
        >
          <KeyRound className="h-4 w-4 mr-2" />
          Import local keypair (desktop)
        </Button>
      </div>

      <Dialog open={keyOpen} onOpenChange={setKeyOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Local keypair</DialogTitle>
            <DialogDescription>
              Paste a Phantom JSON export, base58 secret, or 128-char hex. Keys
              are kept in memory for this session only. Extension wallets in
              Electron are unreliable — this path matches full signing support.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            <Label htmlFor="sk">Secret</Label>
            <Input
              id="sk"
              type="password"
              autoComplete="off"
              value={secret}
              onChange={(e) => setSecret(e.target.value)}
              placeholder="Base58 or [ … ] array"
            />
            <Button
              type="button"
              className="w-full"
              onClick={() => {
                try {
                  importLocalKeypair(secret);
                  setKeyOpen(false);
                  setSecret("");
                } catch (e) {
                  console.error(e);
                }
              }}
            >
              Connect with this key
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={menuOpen} onOpenChange={setMenuOpen}>
        <DialogContent className="max-w-md p-0 gap-0 border-border overflow-hidden max-h-[80vh]">
          <DialogHeader className="p-5 pb-3 border-b border-border/80">
            <DialogTitle>Tools</DialogTitle>
            <DialogDescription>Same suite as the web app.</DialogDescription>
          </DialogHeader>
          <nav className="overflow-y-auto py-2" aria-label="App">
            {NAV.map((n) => (
              <NavLink
                key={n.to}
                to={n.to}
                onClick={() => setMenuOpen(false)}
                className={({ isActive }) =>
                  cn(
                    "block px-5 py-3 text-sm font-medium",
                    isActive
                      ? "text-foreground bg-white/5"
                      : "text-muted-foreground hover:text-foreground hover:bg-white/5",
                  )
                }
              >
                {n.label}
              </NavLink>
            ))}
            {connected && (
              <NavLink
                to="/my-actions"
                onClick={() => setMenuOpen(false)}
                className="block px-5 py-3 text-sm font-medium text-muted-foreground hover:text-foreground"
              >
                My actions
              </NavLink>
            )}
            <NavLink
              to="/ref/So11111111111111111111111111111111111111112"
              onClick={() => setMenuOpen(false)}
              className="block px-5 py-3 text-sm text-muted-foreground"
            >
              Token stats (WSOL mint)
            </NavLink>
          </nav>
        </DialogContent>
      </Dialog>

      <main className="flex-1 min-h-0">
        <Outlet />
      </main>

      <footer className="border-t border-border py-6 text-center text-xs text-muted-foreground">
        RootRecord Solana Toolkit · not a hot wallet; you control keys ·{" "}
        <a
          className="text-sol-green hover:underline"
          href="https://solana.rootrecord.info"
          target="_blank"
          rel="noreferrer"
        >
          solana.rootrecord.info
        </a>
      </footer>
    </div>
  );
}
