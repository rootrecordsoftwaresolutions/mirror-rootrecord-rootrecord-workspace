import { CREATE_FEE_SOL, ACTION_FEE_SOL, LAUNCH_FEE_SOL } from "@/lib/solana";
import { BULK_FEE_PER_100_SOL } from "@/lib/bulkSol";

export function PricingView() {
  return (
    <div className="container py-14 max-w-2xl">
      <h1 className="font-display text-3xl">Pricing</h1>
      <p className="text-muted-foreground mt-2 text-sm">
        Default fees from build env (override with{" "}
        <code className="text-sol-purple">VITE_*</code> in .env.local).
      </p>
      <ul className="mt-6 space-y-2 text-sm">
        <li>Create: {CREATE_FEE_SOL} SOL</li>
        <li>Tool actions: {ACTION_FEE_SOL} SOL</li>
        <li>Raydium launch service: {LAUNCH_FEE_SOL} SOL</li>
        <li>Bulk: {BULK_FEE_PER_100_SOL} SOL per 100 destinations</li>
      </ul>
    </div>
  );
}
