/**
 * Curated mints shown at the top of `/recent-tokens` (e.g. RootRecord ecosystem launches).
 * Automatic listings below come from on-site `token_create` logs (free for anyone using Create Token).
 */
export type FeaturedTokenEntry = {
  mint: string;
  /** Primary label in the featured list */
  title: string;
  /** Optional short line under the title */
  subtitle?: string;
};

export const FEATURED_TOKENS: FeaturedTokenEntry[] = [
  // Add RootRecord mints here, for example:
  // {
  //   mint: 'YourMintAddressHere111111111111111111111111111',
  //   title: 'Your token name',
  //   subtitle: 'Optional context',
  // },
];
