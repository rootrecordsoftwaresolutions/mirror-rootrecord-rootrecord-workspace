import { LinearVestingClient } from "@/components/contracts/LinearVestingClient";

export function ContractsVestingView() {
  return (
    <div className="container py-14">
      <p className="text-xs uppercase tracking-[0.2em] text-muted-foreground mb-2">
        Contracts
      </p>
      <h1 className="font-display text-3xl md:text-4xl">Linear vesting (Streamflow)</h1>
      <p className="text-muted-foreground mt-2 max-w-2xl text-sm">
        Same Streamflow client as the website — connect a wallet and fund from
        your ATA.
      </p>
      <div className="mt-10 max-w-3xl">
        <LinearVestingClient />
      </div>
    </div>
  );
}
