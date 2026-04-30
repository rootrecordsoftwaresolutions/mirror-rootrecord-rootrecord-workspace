import { Link } from "react-router-dom";

export function StartView() {
  return (
    <div className="container py-14 max-w-3xl prose prose-invert">
      <h1 className="font-display text-3xl md:text-4xl text-foreground not-prose">
        Start here
      </h1>
      <p className="text-muted-foreground not-prose mt-4">
        1. Connect a wallet (Phantom / Solflare if injected) or use{" "}
        <strong className="text-foreground">Local key</strong> in the header to
        paste a keypair. 2. Pick <Link className="text-sol-green" to="/create">Create</Link> for a
        new mint or <Link className="text-sol-green" to="/tools">Tools</Link> for
        post-launch changes. 3. Set <code className="text-sol-purple">.env</code> for{" "}
        <code className="text-sol-purple">VITE_FEE_WALLET</code>, RPC, and optional
        Pinata + Worker logging.
      </p>
    </div>
  );
}
