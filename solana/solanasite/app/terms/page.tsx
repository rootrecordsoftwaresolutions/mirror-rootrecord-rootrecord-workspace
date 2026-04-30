import type { Metadata } from 'next';

import { pageSeo } from '@/lib/seo';

export const metadata: Metadata = pageSeo({
  path: '/terms',
  title: 'Terms of service',
  description:
    'Terms of service for RootRecord Solana Tools: acceptable use of the token creation and management utilities, fees, and limitations.',
  keywords: ['RootRecord', 'terms', 'Solana tools'],
});

export default function TermsPage() {
  return (
    <div className="container py-14 md:py-20 max-w-3xl">
      <div className="text-xs uppercase tracking-[0.2em] text-muted-foreground mb-3">
        Terms
      </div>
      <h1 className="font-display text-4xl md:text-5xl tracking-tight">
        Use the tool. Verify every signature.
      </h1>
      <div className="mt-8 space-y-4 text-muted-foreground leading-relaxed">
        <p>
          RootRecord Solana Tools is provided as-is for informational and
          operational purposes. It is not financial advice. You are solely
          responsible for the tokens you create, manage, and distribute.
        </p>
        <p>
          Always review every transaction in your wallet before signing. Once a
          mint is created or an authority is revoked on-chain, the action is
          irreversible.
        </p>
        <p>
          Platform fees are non-refundable. Network (gas) costs are paid to the
          Solana validators, not to RootRecord.
        </p>
        <p>
          By using this site you agree that the operators of RootRecord are not
          liable for any loss of funds, mistakes in token configuration, or
          regulatory consequences arising from your token launch.
        </p>
      </div>
    </div>
  );
}
