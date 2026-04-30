export function DocsView() {
  return (
    <div className="container py-14 max-w-2xl text-sm text-muted-foreground space-y-4">
      <h1 className="font-display text-3xl text-foreground">Docs</h1>
      <p>
        This desktop build mirrors the{" "}
        <a
          className="text-sol-green hover:underline"
          href="https://github.com/RootRecord"
          target="_blank"
          rel="noreferrer"
        >
          solana/solanasite
        </a>{" "}
        Next app: same transaction code paths for create, tools, Raydium, bulk,
        Streamflow, and logging. Use <code className="text-sol-purple">.env.local</code>{" "}
        with <code className="text-sol-purple">VITE_</code> variables (see
        .env.example).
      </p>
    </div>
  );
}
