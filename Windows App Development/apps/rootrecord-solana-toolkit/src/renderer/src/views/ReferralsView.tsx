import {
  getStoredReferrer,
  REF_QUERY_PARAM,
  setStoredReferrer,
} from "@/lib/referral";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { useState, useEffect } from "react";

export function ReferralsView() {
  const [r, setR] = useState("");

  useEffect(() => {
    setR(getStoredReferrer() || "");
  }, []);

  return (
    <div className="container py-14 max-w-xl">
      <h1 className="font-display text-3xl">Referrals</h1>
      <p className="text-muted-foreground mt-2 text-sm">
        Optional <code className="text-sol-green">{REF_QUERY_PARAM}</code> wallet for
        platform fee share (same as the site). Stored in localStorage.
      </p>
      <div className="mt-6 space-y-2">
        <Label htmlFor="ref">Referrer wallet</Label>
        <Input
          id="ref"
          value={r}
          onChange={(e) => setR(e.target.value)}
          placeholder="Base58 public key"
        />
        <Button
          type="button"
          onClick={() => {
            setStoredReferrer(r);
          }}
        >
          Save
        </Button>
      </div>
    </div>
  );
}
