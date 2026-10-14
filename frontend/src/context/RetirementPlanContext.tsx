import { createContext, useContext, useState, useEffect, useCallback, useMemo, useRef, type ReactNode } from "react";
import { useAuth } from "./AuthContext";
import { useFinancialProfile } from "./FinancialProfileContext";
import { usePlanSynchronization } from "../hooks/usePlanSynchronization";
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
  synchronization: ReturnType<typeof usePlanSynchronization>;
  plans: RetirementPlan[];
  activePlan: PlanDetail | null;
  activePlanId: string | null;
  planVersions: PlanHistoryItem[];
  currentVersion: PlanVersion | null;
  loadingPlans: boolean;
  plansError: string | null;
  previewData: RetirementPreviewResult | null;
  previewStatus: PreviewStatus;
  previewIssues: RetirementIssue[];
  previewWarnings: RetirementIssue[];
  previewError: string | null;
  lastPreviewInput: RetirementPreviewInput | null;
  lastInputHash: string | null;
  draftSelection: Partial<RetirementPreviewInput> | null;
  updateDraft: (changes: Partial<RetirementPreviewInput>) => void;
  clearDraft: () => void;
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
  const { v2Profile, profileRevision, loading: loadingProfile, loadError: profileError } = useFinancialProfile();

  const [plans, setPlans] = useState<RetirementPlan[]>([]);
  const [activePlanId, setActivePlanIdState] = useState<string | null>(null);
  // refreshPlans reads the selection through a ref so selecting a plan does not
  // change its identity and re-trigger the account-load effect (double fetch).
  const activePlanIdRef = useRef<string | null>(null);
  const setActivePlanId = useCallback((id: string | null) => { activePlanIdRef.current = id; setActivePlanIdState(id); }, []);
  const [activePlan, setActivePlan] = useState<PlanDetail | null>(null);
  const [planVersions, setPlanVersions] = useState<PlanHistoryItem[]>([]);
  const [loadingPlans, setLoadingPlans] = useState(false);
  const [plansError, setPlansError] = useState<string | null>(null);

  // Preview state
  const [previewData, setPreviewData] = useState<RetirementPreviewResult | null>(null);
  const [previewStatus, setPreviewStatus] = useState<PreviewStatus>("idle");
  const [previewIssues, setPreviewIssues] = useState<RetirementIssue[]>([]);
  const [previewWarnings, setPreviewWarnings] = useState<RetirementIssue[]>([]);
  const [previewError, setPreviewError] = useState<string | null>(null);
  const [lastPreviewInput, setLastPreviewInput] = useState<RetirementPreviewInput | null>(null);
  const [lastInputHash, setLastInputHash] = useState<string | null>(null);
  const [draftSelection, setDraftSelection] = useState<Partial<RetirementPreviewInput> | null>(null);
  const draftRef = useRef<Partial<RetirementPreviewInput> | null>(null);
  const draftKey = (id: string) => `anhuu:plan-draft:${id}`;
  const updateDraft = (changes: Partial<RetirementPreviewInput>) => {
    const next = { ...draftRef.current, ...changes };
    // Session storage survives refresh, stays scoped to the account, and does not apply a plan.
    if (user?.id) sessionStorage.setItem(draftKey(user.id), JSON.stringify(next));
    draftRef.current = next;
    setDraftSelection(next);
  };
  const clearDraft = () => {
    try { if (user?.id) sessionStorage.removeItem(draftKey(user.id)); } catch { /* Keep clearing in-memory state if storage is unavailable. */ }
    draftRef.current = null;
    setDraftSelection(null);
  };

  // Monotonic sequence counters to reject out-of-order responses
  const previewSeq = useRef(0);
  const planLoadSeq = useRef(0);
  const planListSeq = useRef(0);
  const activeUserIdRef = useRef<string | null>(null);

  // Pending operations tracking for strict idempotency (key + body)
  const pendingSave = useRef<PendingOperation | null>(null);
  const pendingApply = useRef<PendingOperation | null>(null);

  const loadPlanDetail = useCallback(async (planId: string, expectedUserId?: string) => {
    const targetUserId = expectedUserId ?? user?.id;
    const currentSeq = ++planLoadSeq.current;
    try {
      const [detail, versionsRes] = await Promise.all([
        getPlanDetail(planId),
        listPlanVersions(planId, 1, 50),
      ]);
      if (currentSeq !== planLoadSeq.current || activeUserIdRef.current !== targetUserId) return;
      setActivePlan(detail);
      setPlanVersions(versionsRes.items);
      // If active plan has a current version and no manual preview has been set, initialize preview with it
      if (detail.current) {
        setPreviewData((prev) => prev ?? detail.current?.preview ?? null);
        setPreviewStatus((prev) => (prev === "idle" ? "ready" : prev));
        setLastInputHash((prev) => prev ?? detail.current?.preview.inputHash ?? null);
        setLastPreviewInput((prev) => prev ?? detail.current?.preview.selection ?? null);
      }
    } catch {
      if (currentSeq !== planLoadSeq.current || activeUserIdRef.current !== targetUserId) return;
      setActivePlan(null);
      setPlansError("Không thể tải chi tiết kế hoạch. Hãy thử lại.");
    }
  }, [user?.id]);

  const refreshPlans = useCallback(async (expectedUserId?: string) => {
    const targetUserId = expectedUserId ?? user?.id;
    if (user?.role !== "user" || !targetUserId) return;
    const currentSeq = ++planListSeq.current;
    setLoadingPlans(true);
    setPlansError(null);
    try {
      const res = await listRetirementPlans(1, 50);
      if (currentSeq !== planListSeq.current || activeUserIdRef.current !== targetUserId) return;
      setPlans(res.items);
      if (res.items.length > 0) {
        const selected = activePlanIdRef.current;
        const targetId = selected && res.items.some((p) => p.id === selected)
          ? selected
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
      if (currentSeq !== planListSeq.current || activeUserIdRef.current !== targetUserId) return;
      setPlans([]);
      setActivePlanId(null);
      setActivePlan(null);
      setPlanVersions([]);
      setPreviewData(null);
      setPreviewStatus("error");
      setPlansError("Không thể tải danh sách kế hoạch hưu trí. Hãy thử lại.");
    } finally {
      if (currentSeq === planListSeq.current && activeUserIdRef.current === targetUserId) {
        setLoadingPlans(false);
      }
    }
  }, [user?.role, user?.id, loadPlanDetail, setActivePlanId]);

  // Clean state when user logs in/out or switches accounts
  useEffect(() => {
    const currentId = user?.id ?? null;
    if (activeUserIdRef.current !== currentId) {
      const previousId = activeUserIdRef.current;
      try { if (previousId) sessionStorage.removeItem(draftKey(previousId)); } catch { /* Account state is cleared below. */ }
      activeUserIdRef.current = currentId;
      // Invalidate sequences and pending requests
      previewSeq.current++;
      planLoadSeq.current++;
      planListSeq.current++;
      setPlansError(null);
      setLoadingPlans(false);
      pendingSave.current = null;
      pendingApply.current = null;
      let restored: Partial<RetirementPreviewInput> | null = null;
      try {
        const raw = currentId ? sessionStorage.getItem(draftKey(currentId)) : null;
        const parsed = raw ? JSON.parse(raw) : null;
        if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) restored = parsed;
      } catch { /* An unavailable or invalid local draft must not block loading the account. */ }
      draftRef.current = restored;
      setDraftSelection(restored);

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
  }, [user?.role, user?.id, refreshPlans, setActivePlanId]);

  const selectPlan = async (planId: string) => {
    clearDraft();
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
      if (currentSeq !== previewSeq.current || activeUserIdRef.current !== targetUserId) return null;

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
      if (currentSeq !== previewSeq.current || activeUserIdRef.current !== targetUserId) return null;
      const message = (e as { code?: string })?.code === "PROFILE_V2_REQUIRED"
        ? "Hồ sơ đang ở dạng khảo sát nhanh. Mở Tài khoản → Hồ sơ tài chính, bấm “Bổ sung hồ sơ chi tiết” và khai tháng sinh, tháng muốn nghỉ hưu để tính kế hoạch."
        : e instanceof Error ? e.message : "Không thể tính toán dự phóng. Vui lòng thử lại.";
      setPreviewError(message);
      setPreviewStatus("error");
      return null;
    }
  };

  const savePlanVersion = async (
    previewInput: RetirementPreviewInput,
    inputHash: string
  ): Promise<SavedPlanVersionResult | null> => {
    if (activePlan?.current?.preview.reforecast) {
      throw new Error("Kế hoạch này dùng số dư thực tế đã ghi. Hãy cập nhật tại Theo dõi thực tế để giữ đúng số dư và lịch sử giao dịch.");
    }
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
      clearDraft();
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

  // Implementations close over current state; consumers get stable identities.
  const actionsRef = useRef({ updateDraft, clearDraft, selectPlan, runPreview, savePlanVersion, applyVersion, replayVersion, fetchPlanReport });
  actionsRef.current = { updateDraft, clearDraft, selectPlan, runPreview, savePlanVersion, applyVersion, replayVersion, fetchPlanReport };
  const actions = useMemo(() => ({
    updateDraft: (changes: Partial<RetirementPreviewInput>) => actionsRef.current.updateDraft(changes),
    clearDraft: () => actionsRef.current.clearDraft(),
    selectPlan: (planId: string) => actionsRef.current.selectPlan(planId),
    runPreview: (input: RetirementPreviewInput) => actionsRef.current.runPreview(input),
    savePlanVersion: (input: RetirementPreviewInput, hash: string) => actionsRef.current.savePlanVersion(input, hash),
    applyVersion: (versionId: string, profileRev: number, planId?: string, planRevision?: number) => actionsRef.current.applyVersion(versionId, profileRev, planId, planRevision),
    replayVersion: (versionId: string) => actionsRef.current.replayVersion(versionId),
    fetchPlanReport: (planId?: string, versionId?: string) => actionsRef.current.fetchPlanReport(planId, versionId),
  }), []);
  const synchronization = usePlanSynchronization(user?.id, activePlan?.current ?? null, v2Profile, profileRevision, draftSelection, loadingProfile || loadingPlans, profileError || plansError);
  const currentVersion = activePlan?.current ?? null;
  const value = useMemo<RetirementPlanContextValue>(() => ({
    synchronization, plans, activePlan, activePlanId, planVersions, currentVersion, loadingPlans, plansError,
    previewData, previewStatus, previewIssues, previewWarnings, previewError, lastPreviewInput, lastInputHash, draftSelection,
    refreshPlans: () => refreshPlans(), ...actions,
  }), [synchronization, plans, activePlan, activePlanId, planVersions, currentVersion, loadingPlans, plansError,
    previewData, previewStatus, previewIssues, previewWarnings, previewError, lastPreviewInput, lastInputHash, draftSelection, refreshPlans, actions]);

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
