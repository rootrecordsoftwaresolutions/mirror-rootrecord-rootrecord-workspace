import { Link } from "react-router-dom";

const V = import.meta.env;

export function EcosystemView() {
  const o = (V.VITE_WORKER_API_ORIGIN as string | undefined)?.replace(/\/$/, "");
  return (
    <div className="container py-14 max-w-2xl">
      <h1 className="font-display text-3xl">Purpose (ecosystem)</h1>
      <p className="text-muted-foreground mt-4 text-sm leading-relaxed">
        OTC, treasury, and auto-liquidity flows on the site call secured Worker
        routes. In the desktop app, set{" "}
        <code className="text-sol-purple">VITE_WORKER_API_ORIGIN</code> to the same
        API base as production, then use the website for the heaviest checkout
        flows, or continue from here once those routes are wired. Core token and
        Raydium tools work fully offline of Purpose.
      </p>
      {o && (
        <p className="mt-4 text-sm">
          API base: <code className="text-xs break-all">{o}</code>
        </p>
      )}
      <p className="mt-6">
        <a
          className="text-sol-green hover:underline"
          href="https://solana.rootrecord.info/ecosystem"
          target="_blank"
          rel="noreferrer"
        >
          Open Purpose on the web
        </a>{" "}
        · <Link to="/">Home</Link>
      </p>
    </div>
  );
}
