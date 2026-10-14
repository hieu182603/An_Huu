import { useCallback, useEffect, useMemo, useState } from "react";
import type { ProfileV2 } from "../services/financialProfile";
import type { PlanVersion } from "../services/plans";
import { previewMonthlyRetirement, type RetirementPreviewInput, type RetirementPreviewResult } from "../services/retirement";
import { selectionForCurrentProfile } from "../services/profilePlanSelection";

export function usePlanSynchronization(userId: string | undefined, version: PlanVersion | null, profile: ProfileV2 | null, revision: number, draft: Partial<RetirementPreviewInput> | null, blocked: boolean, sourceError: string | null) {
  const [attempt, setAttempt] = useState(0);
  const [result, setResult] = useState<{ key: string; data: RetirementPreviewResult | null; error: string | null } | null>(null);
  const anchored = Boolean(version?.preview.reforecast);
  const input = version && profile && !anchored ? selectionForCurrentProfile(version.preview.selection, draft, profile, revision) : null;
  const changed = Boolean(input && version && (version.preview.profileRevision !== revision || JSON.stringify(input) !== JSON.stringify(version.preview.selection)));
  const key = JSON.stringify([userId, version?.id, revision, input, attempt]);
  const inputJson = JSON.stringify(input);
  useEffect(() => {
    if (!userId || !changed || blocked || sourceError || !input) return;
    let active = true;
    const timer = window.setTimeout(() => {
      previewMonthlyRetirement(JSON.parse(inputJson)).then(data => {
        if (active) setResult({ key, data, error: null });
      }).catch(error => {
        if (active) setResult({ key, data: null, error: error instanceof Error ? error.message : "Không thể cập nhật kế hoạch." });
      });
    }, 350);
    return () => { active = false; window.clearTimeout(timer); };
  }, [key, inputJson, changed, blocked, sourceError, userId]);
  const current = result?.key === key ? result : null;
  const stableInput = useMemo(() => input, [inputJson]); // eslint-disable-line react-hooks/exhaustive-deps
  const retry = useCallback(() => setAttempt(value => value + 1), []);
  const status = sourceError ? "error" : blocked && version ? "loading" : !changed ? "ready" : !current ? "loading" : current.error ? "error" : current.data?.status === "READY" ? "ready" : "incomplete";
  const preview = blocked || sourceError ? null : changed ? (current?.error ? null : current?.data ?? null) : version?.preview ?? null;
  const error = sourceError ?? current?.error ?? null;
  // Memoized so the plan context value keeps its identity between renders.
  return useMemo(() => ({ input: stableInput, changed, status, preview, error, retry }), [stableInput, changed, status, preview, error, retry]);
}
