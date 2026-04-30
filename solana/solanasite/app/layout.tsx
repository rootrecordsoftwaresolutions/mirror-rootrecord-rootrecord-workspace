import type { Metadata, Viewport } from 'next';
import { Inter, Instrument_Serif } from 'next/font/google';
import Script from 'next/script';
import { Toaster } from 'sonner';
import './globals.css';
import { SolanaProviders } from '@/components/providers/SolanaProviders';
import { Header } from '@/components/Header';
import { Footer } from '@/components/Footer';
import { ReferralCapture } from '@/components/ReferralCapture';
import { SiteJsonLd } from '@/components/seo/SiteJsonLd';

const inter = Inter({
  subsets: ['latin'],
  display: 'swap',
  variable: '--font-inter',
});

const instrument = Instrument_Serif({
  subsets: ['latin'],
  weight: '400',
  style: ['normal', 'italic'],
  display: 'swap',
  variable: '--font-display',
});

const SITE_URL_FALLBACK = 'https://solana.rootrecord.info';

/** Public site URL for OpenGraph / metadataBase; host-only values are normalized. */
function metadataBaseUrl(): URL {
  const trimmed = process.env.NEXT_PUBLIC_SITE_URL?.trim();
  if (!trimmed) return new URL(SITE_URL_FALLBACK);
  try {
    const withProto = /^[a-z][a-z0-9+.-]*:/i.test(trimmed)
      ? trimmed
      : `https://${trimmed}`;
    const u = new URL(withProto);
    if (u.protocol !== 'http:' && u.protocol !== 'https:') {
      return new URL(SITE_URL_FALLBACK);
    }
    return u;
  } catch {
    return new URL(SITE_URL_FALLBACK);
  }
}

const SITE = metadataBaseUrl();

const SOCIAL_IMAGE_PATH = '/brand.jpg';

const GOOGLE_SITE_VERIFICATION = process.env.NEXT_PUBLIC_GOOGLE_SITE_VERIFICATION?.trim();

export const metadata: Metadata = {
  metadataBase: SITE,
  applicationName: 'RootRecord Solana Tools',
  title: {
    default: 'RootRecord Solana Tools | SPL & Token-2022 creator',
    template: '%s | RootRecord Solana Tools',
  },
  description:
    'Fast, cheap, on-chain SPL and Token-2022 token tools on Solana: create mints, Metaplex metadata, revoke authorities, Raydium liquidity, bulk sends, and paper wallets. Flat SOL fees, no subscriptions.',
  keywords: [
    'Solana',
    'SPL token',
    'Token-2022',
    'token creator',
    'Solana token creator',
    'revoke mint authority',
    'Metaplex',
    'Raydium CPMM',
    'paper wallet',
    'RootRecord',
  ],
  authors: [{ name: 'RootRecord', url: 'https://rootrecord.info' }],
  creator: 'RootRecord',
  formatDetection: { email: false, address: false, telephone: false },
  referrer: 'strict-origin-when-cross-origin',
  icons: {
    icon: [{ url: SOCIAL_IMAGE_PATH, type: 'image/jpeg' }],
    apple: [{ url: SOCIAL_IMAGE_PATH, type: 'image/jpeg' }],
  },
  openGraph: {
    title: 'RootRecord Solana Tools | Cheapest Token Creator on Solana',
    description:
      'Fast, cheap, on-chain SPL token creation that respects your SOL.',
    url: SITE.href.replace(/\/$/, ''),
    siteName: 'RootRecord Solana Tools',
    type: 'website',
    locale: 'en_US',
    images: [
      {
        url: SOCIAL_IMAGE_PATH,
        alt: 'RootRecord Solana Tools',
      },
    ],
  },
  twitter: {
    card: 'summary_large_image',
    site: '@rootrecord',
    creator: '@rootrecord',
    title: 'RootRecord Solana Tools',
    description:
      'Cheap, fast, no-BS Solana token creator. ~Half the cost of competitors.',
    images: [SOCIAL_IMAGE_PATH],
  },
  robots: {
    index: true,
    follow: true,
    googleBot: { index: true, follow: true, 'max-image-preview': 'large', 'max-snippet': -1 },
  },
  ...(GOOGLE_SITE_VERIFICATION
    ? { verification: { google: GOOGLE_SITE_VERIFICATION } }
    : {}),
};

export const viewport: Viewport = {
  themeColor: '#06090F',
  width: 'device-width',
  initialScale: 1,
};

const CF_WEB_ANALYTICS_TOKEN =
  process.env.NEXT_PUBLIC_CF_WEB_ANALYTICS_TOKEN?.trim() ||
  'a09f914edc5a428282e32a75198a0921';

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html
      lang="en"
      className={`${inter.variable} ${instrument.variable}`}
      suppressHydrationWarning
    >
      <body className="font-sans min-h-screen flex flex-col antialiased">
        <SiteJsonLd />
        <SolanaProviders>
          <ReferralCapture />
          <Header />
          <main className="flex-1">{children}</main>
          <Footer />
          <Toaster
            theme="dark"
            position="bottom-right"
            toastOptions={{
              style: {
                background: '#0A0F1A',
                border: '1px solid rgba(255,255,255,0.08)',
                color: '#E6EAF2',
              },
            }}
          />
        </SolanaProviders>
        <Script
          id="cloudflare-beacon"
          src="https://static.cloudflareinsights.com/beacon.min.js"
          strategy="afterInteractive"
          data-cf-beacon={JSON.stringify({ token: CF_WEB_ANALYTICS_TOKEN })}
        />
      </body>
    </html>
  );
}
