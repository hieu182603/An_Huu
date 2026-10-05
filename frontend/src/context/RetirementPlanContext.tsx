import { createContext, useContext, useState, useEffect, useCallback, useRef, type ReactNode } from "react";
import { useAuth } from "./AuthContext";
import { useFinancialProfile } from "./FinancialProfileContext";
import {
  previewMonthlyRetirement,
  type RetirementPreviewInput,
  type RetirementPreviewResult,
  type RetirementIssue,
} from "../services/retirement";
import {
  listRetirementPlans,
  getPlanDetail,
  listPlanVersions,
  createRetirementPlan,
  createPlanVersion,
  applyPlanVersion,
  replayPlanVersion,
  getPlanReport,
  type RetirementPlan,
  type PlanDetail,
  type PlanHistoryItem,
  type PlanVersion,
  type ReplayResult,
  type PlanReport,
} from "../services/plans";

export type PreviewStatus = "idle" | "loading" | "ready" | "incomplete" | "error";

interface PendingOperation {
  planId: string | null;
  bodyStr: string;
  key: string;
}

export type SavedPlanVersionResult = PlanVersion & {
  planId: string;
  planRevision: number;
};

interface RetirementPlanContextValue {
  plans: RetirementPlan[];
  activePlan: PlanDetail | null;
  activePlanId: string | null;
  planVersions: PlanHistoryItem[];
  currentVersion: PlanVersion | null;
  loadingPlans: boolean;
  previewData: RetirementPreviewResult | null;
  previewStatus: PreviewStatus;
  previewIssues: RetirementIssue[];
  previewWarnings: RetirementIssue[];
  previewError: string | null;
  lastPreviewInput: RetirementPreviewInput | null;
  lastInputHash: string | null;
  refreshPlans: () => Promise<void>;
  selectPlan: (planId: string) => Promise<void>;
  runPreview: (input: RetirementPreviewInput) => Promise<RetirementPreviewResult | null>;
  savePlanVersion: (previewInput: RetirementPreviewInput, inputHash: string) => Promise<SavedPlanVersionResult | null>;
  applyVersion: (versionId: string, profileRevision: number, explicitPlanId?: string, explicitPlanRevision?: number) => Promise<boolean>;
  replayVersion: (versionId: string) => Promise<ReplayResult | null>;
  fetchPlanReport: (planId?: string, versionId?: string) => Promise<PlanReport | null>;
}

const RetirementPlanContext = createContext<RetirementPlanContextValue | null>(null);

export function RetirementPlanProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();

  const [plans, setPlans] = useState<RetirementPlan[]>([]);
  const [activePlanId, setActivePlanId] = useState<string | null>(null);
  const [activePlan, setActivePlan] = useState<PlanDetail | null>(null);
  const [planVersions, setPlanVersions] = useState<PlanHistoryItem[]>([]);
  const [loadingPlans, setLoadingPlans] = useState(false);

  // Preview state
  const [previewData, setPreviewData] = useState<RetirementPreviewResult | null>(null);
  const [previewStatus, setPreviewStatus] = useState<PreviewStatus>("idle");
  const [previewIssues, setPreviewIssues] = useState<RetirementIssue[]>([]);
  const [previewWarnings, setPreviewWarnings] = useState<RetirementIssue[]>([]);
  const [previewError, setPreviewError] = useState<string | null>(null);
  const [lastPreviewInput, setLastPreviewInput] = useState<RetirementPreviewInput | null>(null);
  const [lastInputHash, setLastInputHash] = useState<string | null>(null);

  // Monotonic sequence counters to reject out-of-order responses
  const previewSeq = useRef(0);
  const planLoadSeq = useRef(0);
  const activeUserIdRef = useRef<string | null>(null);

  // Pending operations tracking for strict idempotency (key + body)
  const pendingSave = useRef<PendingOperation | null>(null);
  const pendingApply = useRef<PendingOperation | null>(null);

  const loadPlanDetail = useCallback(async (planId: string, expectedUserId?: string) => {
    const targetUserId = expectedUserId ?? user?.id;
    const currentSeq = ++planLoadSeq.current;
    try {
      const detail = await getPlanDetail(planId);
      if (currentSeq !== planLoadSeq.current || user?.id !== targetUserId) return;
      setActivePlan(detail);
      const versionsRes = await listPlanVersions(planId, 1, 50);
      if (currentSeq !== planLoadSeq.current || user?.id !== targetUserId) return;
      setPlanVersions(versionsRes.items);
      // If active plan has a current version and no manual preview has been set, initialize preview with it
      if (detail.current) {
        setPreviewData((prev) => prev ?? detail.current?.preview ?? null);
        setPreviewStatus((prev) => (prev === "idle" ? "ready" : prev));
        setLastInputHash((prev) => prev ?? detail.current?.preview.inputHash ?? null);
        setLastPreviewInput((prev) => prev ?? detail.current?.preview.selection ?? null);
      }
    } catch {
      if (currentSeq !== planLoadSeq.current || user?.id !== targetUserId) return;
      setActivePlan(null);
    }
  }, [user?.id]);

  const refreshPlans = useCallback(async (expectedUserId?: string) => {
    const targetUserId = expectedUserId ?? user?.id;
    if (user?.role !== "user" || !targetUserId) return;
    const currentSeq = ++planLoadSeq.current;
    setLoadingPlans(true);
    try {
      const res = await listRetirementPlans(1, 50);
      if (currentSeq !== planLoadSeq.current || user?.id !== targetUserId) return;
      setPlans(res.items);
      if (res.items.length > 0) {
        const targetId = activePlanId && res.items.some((p) => p.id === activePlanId)
          ? activePlanId
          : res.items[0].id;
        setActivePlanId(targetId);
        await loadPlanDetail(targetId, targetUserId);
      } else {
        setActivePlanId(null);
        setActivePlan(null);
        setPlanVersions([]);
        setPreviewData(null);
        setPreviewStatus("idle");
      }
    } catch {
      // Clear plans on network error to prevent showing stale or another account's state
      if (currentSeq !== planLoadSeq.current || user?.id !== targetUserId) return;
      setPlans([]);
      setActivePlanId(null);
      setActivePlan(null);
      setPlanVersions([]);
      setPreviewData(null);
      setPreviewStatus("error");
      setPreviewError("Không thể tải danh sách kế hoạch hưu trí.");
    } finally {
      if (currentSeq === planLoadSeq.current && user?.id === targetUserId) {
        setLoadingPlans(false);
      }
    }
  }, [user?.role, user?.id, activePlanId, loadPlanDetail]);

  // Clean state when user logs in/out or switches accounts
  useEffect(() => {
    const currentId = user?.id ?? null;
    if (activeUserIdRef.current !== currentId) {
      activeUserIdRef.current = currentId;
      // Invalidate sequences and pending requests
      previewSeq.current++;
      planLoadSeq.current++;
      pendingSave.current = null;
      pendingApply.current = null;

      // Wipe previous user's plan state immediately
      setPlans([]);
      setActivePlanId(null);
      setActivePlan(null);
      setPlanVersions([]);
      setPreviewData(null);
      setPreviewStatus("idle");
      setPreviewError(null);
      setLastPreviewInput(null);
      setLastInputHash(null);
    }

    if (user?.role === "user" && currentId) {
      refreshPlans(currentId);
    }
  }, [user?.role, user?.id, refreshPlans]);

  const selectPlan = async (planId: string) => {
    setActivePlanId(planId);
    setPreviewData(null);
    setPreviewStatus("idle");
    setPreviewError(null);
    setLastPreviewInput(null);
    setLastInputHash(null);
    await loadPlanDetail(planId);
  };

  const runPreview = async (input: RetirementPreviewInput): Promise<RetirementPreviewResult | null> => {
    const targetUserId = user?.id;
    const currentSeq = ++previewSeq.current;
    setPreviewStatus("loading");
    setPreviewError(null);
    setLastPreviewInput(input);

    try {
      const res = await previewMonthlyRetirement(input);
      if (currentSeq !== previewSeq.current || user?.id !== targetUserId) return null;

      setPreviewData(res);
      setPreviewIssues(res.issues || []);
      setPreviewWarnings(res.warnings || []);
      setLastInputHash(res.inputHash);

      if (res.status === "READY") {
        setPreviewStatus("ready");
      } else {
        setPreviewStatus("incomplete");
      }
      return res;
    } catch (e) {
      if (currentSeq !== previewSeq.current || user?.id !== targetUserId) return null;
      const message = e instanceof Error ? e.message : "Không thể tính toán dự phóng. Vui lòng thử lại.";
      setPreviewError(message);
      setPreviewStatus("error");
      return null;
    }
  };

  const savePlanVersion = async (
    previewInput: RetirementPreviewInput,
    inputHash: string
  ): Promise<SavedPlanVersionResult | null> => {
    const targetPlanId = activePlan?.id ?? null;
    const bodyObj = {
      expectedRevision: activePlan ? activePlan.revision : 0,
      expectedInputHash: inputHash,
      preview: previewInput,
    };
    const bodyStr = JSON.stringify(bodyObj);

    // Reuse key ONLY if retrying exact same planId and body
    let key: string;
    if (
      pendingSave.current &&
      pendingSave.current.planId === targetPlanId &&
      pendingSave.current.bodyStr === bodyStr
    ) {
      key = pendingSave.current.key;
    } else {
      key = crypto.randomUUID();
      pendingSave.current = { planId: targetPlanId, bodyStr, key };
    }

    try {
      let savedResult: SavedPlanVersionResult;
      if (!activePlan) {
        const result = await createRetirementPlan(bodyObj, key);
        pendingSave.current = null;
        savedResult = {
          ...result.saved,
          planId: result.planId,
          planRevision: result.revision,
        };
        setActivePlanId(result.planId);
        await refreshPlans();
      } else {
        const result = await createPlanVersion(activePlan.id, bodyObj, key);
        pendingSave.current = null;
        savedResult = {
          ...result.saved,
          planId: result.planId,
          planRevision: result.revision,
        };
        await loadPlanDetail(activePlan.id);
      }
      return savedResult;
    } catch (e) {
      // Clear key if client error (4xx) so next attempt gets a fresh key
      if (e instanceof Error && "status" in e && Number((e as any).status) >= 400 && Number((e as any).status) < 500) {
        pendingSave.current = null;
      }
      throw e;
    }
  };

  const applyVersion = async (
    versionId: string,
    expectedProfileRev: number,
    explicitPlanId?: string,
    explicitPlanRevision?: number
  ): Promise<boolean> => {
    const targetId = explicitPlanId || activePlan?.id;
    const targetRevision = explicitPlanRevision !== undefined ? explicitPlanRevision : activePlan?.revision;
    if (!targetId || targetRevision === undefined) return false;

    const bodyObj = {
      versionId,
      expectedRevision: targetRevision,
      expectedProfileRevision: expectedProfileRev,
      confirm: true as const,
    };
    const bodyStr = JSON.stringify(bodyObj);

    let key: string;
    if (
      pendingApply.current &&
      pendingApply.current.planId === targetId &&
      pendingApply.current.bodyStr === bodyStr
    ) {
      key = pendingApply.current.key;
    } else {
      key = crypto.randomUUID();
      pendingApply.current = { planId: targetId, bodyStr, key };
    }

    try {
      const result = await applyPlanVersion(targetId, bodyObj, key);
      pendingApply.current = null;
      await loadPlanDetail(targetId);
      return !!result;
    } catch (e) {
      if (e instanceof Error && "status" in e && Number((e as any).status) >= 400 && Number((e as any).status) < 500) {
        pendingApply.current = null;
      }
      throw e;
    }
  };

  const replayVersion = async (versionId: string): Promise<ReplayResult | null> => {
    if (!activePlan) return null;
    try {
      return await replayPlanVersion(activePlan.id, versionId);
    } catch {
      return null;
    }
  };

  const fetchPlanReport = async (planId?: string, versionId?: string): Promise<PlanReport | null> => {
    const targetId = planId || activePlanId;
    if (!targetId) return null;
    try {
      return await getPlanReport(targetId, versionId);
    } catch {
      return null;
    }
  };

  const value: RetirementPlanContextValue = {
    plans,
    activePlan,
    activePlanId,
    planVersions,
    currentVersion: activePlan?.current ?? null,
    loadingPlans,
    previewData,
    previewStatus,
    previewIssues,
    previewWarnings,
    previewError,
    lastPreviewInput,
    lastInputHash,
    refreshPlans,
    selectPlan,
    runPreview,
    savePlanVersion,
    applyVersion,
    replayVersion,
    fetchPlanReport,
  };

  return (
    <RetirementPlanContext.Provider value={value}>
      {children}
    </RetirementPlanContext.Provider>
  );
}

export function useRetirementPlan() {
  const context = useContext(RetirementPlanContext);
  if (!context) {
    throw new Error("useRetirementPlan must be used within RetirementPlanProvider");
  }
  return context;
}
