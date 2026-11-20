import { createContext, useContext } from "react";
import type { BillingOverview } from "../../services/billing";

type BillingContextValue = {
  /** null until loaded, or when billing is off / failed to load. */
  overview: BillingOverview | null;
  /** True once GET /me/billing answered 503 BILLING_DISABLED: render no billing UI. */
  disabled: boolean;
  loading: boolean;
  error: string;
  refresh: () => Promise<void>;
  openTerms: () => void;
};

export const BillingContext = createContext<BillingContextValue>({ overview: null, disabled: false, loading: false, error: "", refresh: async () => {}, openTerms: () => {} });
export const useBilling = () => useContext(BillingContext);
