'use client';

import { Sparkles, Info, Lock, ShieldOff, Coins, TrendingUp, Snowflake, Webhook } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import type { ExtensionState } from '@/lib/schema';

interface Props {
  state: ExtensionState;
  onChange: (next: ExtensionState) => void;
}

interface ToggleRowProps {
  active: boolean;
  onToggle: () => void;
  icon: React.ComponentType<{ className?: string }>;
  title: string;
  desc: string;
  badge?: string;
  children?: React.ReactNode;
  warning?: string;
}

function ToggleRow({
  active,
  onToggle,
  icon: Icon,
  title,
  desc,
  badge,
  children,
  warning,
}: ToggleRowProps) {
  return (
    <div
      data-testid={`ext-row-${title.toLowerCase().replace(/\s+/g, '-')}`}
      className={cn(
        'rounded-xl border transition-colors',
        active
          ? 'border-sol-green/50 bg-sol-green/5'
          : 'border-border bg-ink-700/40',
      )}
    >
      <button
        type="button"
        onClick={onToggle}
        className="w-full flex items-start gap-3 p-4 text-left"
      >
        <span
          className={cn(
            'mt-0.5 grid h-9 w-9 shrink-0 place-items-center rounded-lg border',
            active
              ? 'border-sol-green/50 bg-sol-green/10 text-sol-green'
              : 'border-border bg-ink-800 text-muted-foreground',
          )}
        >
          <Icon className="h-4 w-4" />
        </span>
        <span className="flex-1">
          <span className="flex items-center gap-2">
            <span className="font-medium text-foreground">{title}</span>
            {badge && (
              <Badge className="text-[10px] py-0 px-2 border-sol-purple/40 bg-sol-purple/10 text-sol-purple">
                {badge}
              </Badge>
            )}
          </span>
          <span className="block text-xs text-muted-foreground mt-1 leading-relaxed">
            {desc}
          </span>
        </span>
        <span
          className={cn(
            'h-5 w-9 shrink-0 rounded-full transition-colors relative mt-1',
            active ? 'bg-sol-green' : 'bg-ink-600',
          )}
          aria-hidden
        >
          <span
            className={cn(
              'absolute top-0.5 h-4 w-4 rounded-full bg-white transition-transform',
              active ? 'translate-x-4' : 'translate-x-0.5',
            )}
          />
        </span>
      </button>
      {active && children && (
        <div className="px-4 pb-4 pt-1 border-t border-border/50">{children}</div>
      )}
      {active && warning && (
        <div className="mx-4 mb-4 mt-2 rounded-lg border border-amber-500/30 bg-amber-500/10 p-3 text-xs text-amber-200 flex items-start gap-2">
          <Info className="h-3.5 w-3.5 mt-0.5 shrink-0" />
          <span>{warning}</span>
        </div>
      )}
    </div>
  );
}

export function Token2022Section({ state, onChange }: Props) {
  const set = <K extends keyof ExtensionState>(k: K, v: ExtensionState[K]) =>
    onChange({ ...state, [k]: v });

  return (
    <div data-testid="token2022-section" className="space-y-5">
      {/* Master toggle */}
      <div
        className={cn(
          'rounded-xl border p-5 transition-colors',
          state.enabled
            ? 'border-sol-purple/50 bg-sol-purple/5'
            : 'border-border bg-ink-700/30',
        )}
      >
        <button
          type="button"
          onClick={() => set('enabled', !state.enabled)}
          data-testid="toggle-token2022"
          className="w-full flex items-start gap-4 text-left"
        >
          <span
            className={cn(
              'mt-0.5 grid h-10 w-10 shrink-0 place-items-center rounded-lg border',
              state.enabled
                ? 'border-sol-purple/50 bg-sol-purple/15 text-sol-purple'
                : 'border-border bg-ink-800 text-muted-foreground',
            )}
          >
            <Sparkles className="h-5 w-5" />
          </span>
          <span className="flex-1">
            <span className="flex items-center gap-2">
              <span className="font-display text-lg leading-tight">
                Token-2022 mode
              </span>
              <Badge className="border-sol-purple/40 bg-sol-purple/10 text-sol-purple">
                advanced
              </Badge>
            </span>
            <span className="block text-sm text-muted-foreground mt-1 leading-relaxed">
              Use Solana&apos;s next-gen token program with on-chain extensions
              like transfer fees, hooks, soulbound, and on-mint metadata. Costs
              slightly more rent than legacy SPL.
            </span>
          </span>
          <span
            className={cn(
              'h-6 w-11 shrink-0 rounded-full transition-colors relative mt-1',
              state.enabled ? 'bg-sol-purple' : 'bg-ink-600',
            )}
            aria-hidden
          >
            <span
              className={cn(
                'absolute top-0.5 h-5 w-5 rounded-full bg-white transition-transform',
                state.enabled ? 'translate-x-5' : 'translate-x-0.5',
              )}
            />
          </span>
        </button>
      </div>

      {state.enabled && (
        <div className="space-y-3 animate-fade-up">
          <div className="flex items-center justify-between">
            <div className="text-xs uppercase tracking-[0.16em] text-muted-foreground">
              Extensions
            </div>
            <div className="text-xs text-muted-foreground">
              Pick what you need · all can be disabled
            </div>
          </div>

          {/* Transfer Fee */}
          <ToggleRow
            active={state.transferFee.on}
            onToggle={() =>
              set('transferFee', {
                ...state.transferFee,
                on: !state.transferFee.on,
              })
            }
            icon={Coins}
            title="Transfer fee"
            badge="popular"
            desc="A % fee on every transfer is withheld by the mint. You can withdraw the accumulated fees later from /tools."
          >
            <div className="grid sm:grid-cols-2 gap-3 mt-3">
              <div className="grid gap-1.5">
                <Label>Fee (basis points)</Label>
                <Input
                  data-testid="ext-fee-bps"
                  type="number"
                  min={0}
                  max={10000}
                  value={state.transferFee.bps}
                  onChange={(e) =>
                    set('transferFee', {
                      ...state.transferFee,
                      bps: e.target.value,
                    })
                  }
                />
                <span className="text-[11px] text-muted-foreground">
                  100 bps = 1% · max 10000 (100%)
                </span>
              </div>
              <div className="grid gap-1.5">
                <Label>Max fee (raw units)</Label>
                <Input
                  data-testid="ext-fee-max"
                  type="number"
                  min={0}
                  value={state.transferFee.maxFee}
                  onChange={(e) =>
                    set('transferFee', {
                      ...state.transferFee,
                      maxFee: e.target.value,
                    })
                  }
                />
                <span className="text-[11px] text-muted-foreground">
                  Cap per-transfer fee. Use 0 for no cap.
                </span>
              </div>
            </div>
          </ToggleRow>

          {/* Transfer Hook */}
          <ToggleRow
            active={state.transferHook.on}
            onToggle={() =>
              set('transferHook', {
                ...state.transferHook,
                on: !state.transferHook.on,
              })
            }
            icon={Webhook}
            title="Transfer hook"
            badge="advanced"
            desc="Run a custom Solana program on every transfer (whitelists, royalties, KYC gates). You provide the deployed hook program ID."
          >
            <div className="grid gap-1.5 mt-3">
              <Label>Hook program ID</Label>
              <Input
                data-testid="ext-hook-pid"
                placeholder="ProgRamPubkey…"
                value={state.transferHook.programId}
                onChange={(e) =>
                  set('transferHook', {
                    ...state.transferHook,
                    programId: e.target.value.trim(),
                  })
                }
              />
            </div>
          </ToggleRow>

          {/* Non-transferable */}
          <ToggleRow
            active={state.nonTransferable}
            onToggle={() => set('nonTransferable', !state.nonTransferable)}
            icon={Lock}
            title="Non-transferable (soulbound)"
            desc="Holders can never transfer this token. Once minted, it stays in the recipient wallet forever."
            warning={
              state.transferFee.on || state.transferHook.on
                ? 'Conflicts with Transfer fee / Transfer hook — disable those first.'
                : undefined
            }
          />

          {/* Mint close authority */}
          <ToggleRow
            active={state.mintCloseAuthority}
            onToggle={() =>
              set('mintCloseAuthority', !state.mintCloseAuthority)
            }
            icon={ShieldOff}
            title="Mint close authority"
            desc="Lets the authority close the mint and reclaim its rent SOL once total supply is zero."
          />

          {/* Permanent delegate */}
          <ToggleRow
            active={state.permanentDelegate}
            onToggle={() => set('permanentDelegate', !state.permanentDelegate)}
            icon={ShieldOff}
            title="Permanent delegate"
            badge="caution"
            desc="A single wallet can transfer or burn from any holder forever. Powerful — only use for compliance / managed assets."
            warning="Holders should be aware: this is on-chain custody power. Most memecoins should leave this OFF."
          />

          {/* Interest-bearing */}
          <ToggleRow
            active={state.interestBearing.on}
            onToggle={() =>
              set('interestBearing', {
                ...state.interestBearing,
                on: !state.interestBearing.on,
              })
            }
            icon={TrendingUp}
            title="Interest-bearing"
            desc="Wallets display an interest-accrued amount on top of the raw balance. Display-only — does not change actual on-chain supply."
          >
            <div className="grid gap-1.5 mt-3 max-w-xs">
              <Label>Annual rate (bps)</Label>
              <Input
                data-testid="ext-rate-bps"
                type="number"
                value={state.interestBearing.rateBps}
                onChange={(e) =>
                  set('interestBearing', {
                    ...state.interestBearing,
                    rateBps: e.target.value,
                  })
                }
              />
              <span className="text-[11px] text-muted-foreground">
                500 bps = 5% APY (display)
              </span>
            </div>
          </ToggleRow>

          {/* Default frozen */}
          <ToggleRow
            active={state.defaultFrozen}
            onToggle={() => set('defaultFrozen', !state.defaultFrozen)}
            icon={Snowflake}
            title="Default account state: frozen"
            badge="caution"
            desc="New holder accounts start frozen. You'll need to thaw each one before they can move tokens. Useful for KYC / allow-listed launches."
            warning={
              state.defaultFrozen
                ? 'With this on, your initial supply is NOT minted automatically — your own ATA starts frozen too. Thaw it from /tools first, then mint more.'
                : undefined
            }
          />
        </div>
      )}
    </div>
  );
}
