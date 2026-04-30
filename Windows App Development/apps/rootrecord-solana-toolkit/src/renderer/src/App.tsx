import { Routes, Route, Navigate, useParams } from "react-router-dom";
import { AppLayout } from "@/components/AppLayout";
import { HomeView } from "@/views/HomeView";
import { StartView } from "@/views/StartView";
import CreateTokenView from "@/views/CreateTokenView";
import ToolsHomeView from "@/views/ToolsHomeView";
import LiquidityView from "@/views/LiquidityView";
import BulkView from "@/views/BulkView";
import { WalletGeneratorView } from "@/views/WalletGeneratorView";
import { RecentTokensView } from "@/views/RecentTokensView";
import { TokenStatsView } from "@/views/TokenStatsView";
import { EcosystemView } from "@/views/EcosystemView";
import { MyActionsView } from "@/views/MyActionsView";
import { ReferralsView } from "@/views/ReferralsView";
import { PricingView } from "@/views/PricingView";
import { DocsView } from "@/views/DocsView";
import { ContractsVestingView } from "@/views/ContractsVestingView";

function TokenToRefRedirect() {
  const { mint } = useParams();
  return <Navigate to={`/ref/${encodeURIComponent(mint || "")}`} replace />;
}

export function App() {
  return (
    <Routes>
      <Route element={<AppLayout />}>
        <Route path="/" element={<HomeView />} />
        <Route path="/start" element={<StartView />} />
        <Route path="/create" element={<CreateTokenView />} />
        <Route path="/tools" element={<ToolsHomeView />} />
        <Route path="/liquidity" element={<LiquidityView />} />
        <Route path="/bulk" element={<BulkView />} />
        <Route path="/wallet" element={<WalletGeneratorView />} />
        <Route path="/wallet-generator" element={<Navigate to="/wallet" replace />} />
        <Route path="/recent-tokens" element={<RecentTokensView />} />
        <Route path="/ref/:mint" element={<TokenStatsView />} />
        <Route path="/token/:mint" element={<TokenToRefRedirect />} />
        <Route path="/ecosystem" element={<EcosystemView />} />
        <Route path="/ecosystem/*" element={<EcosystemView />} />
        <Route path="/my-actions" element={<MyActionsView />} />
        <Route path="/referrals" element={<ReferralsView />} />
        <Route path="/pricing" element={<PricingView />} />
        <Route path="/docs" element={<DocsView />} />
        <Route path="/contracts/vesting" element={<ContractsVestingView />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Route>
    </Routes>
  );
}
