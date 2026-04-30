import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import { Toaster } from "sonner";

import { SolanaProviders } from "./components/SolanaProviders";
import { App } from "./App";
import "./index.css";

import "@solana/wallet-adapter-react-ui/styles.css";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <BrowserRouter>
      <SolanaProviders>
        <App />
        <Toaster
          position="top-center"
          richColors
          theme="dark"
          className="font-sans"
        />
      </SolanaProviders>
    </BrowserRouter>
  </StrictMode>,
);
