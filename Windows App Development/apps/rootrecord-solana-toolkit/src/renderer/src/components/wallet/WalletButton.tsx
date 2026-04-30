import { WalletMultiButton } from "@solana/wallet-adapter-react-ui";

export { WalletMultiButton };

export function WalletMultiButtonWrap() {
  return (
    <div data-testid="wallet-button-wrap" className="rr-wallet-btn">
      <WalletMultiButton />
    </div>
  );
}
