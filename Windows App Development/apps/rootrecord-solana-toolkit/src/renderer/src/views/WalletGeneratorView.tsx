import { WalletIntro } from "./WalletIntro";
import { WalletGeneratorClient } from "./WalletGeneratorClient";

export function WalletGeneratorView() {
  return (
    <div>
      <WalletIntro />
      <div className="container pb-20">
        <WalletGeneratorClient />
      </div>
    </div>
  );
}
