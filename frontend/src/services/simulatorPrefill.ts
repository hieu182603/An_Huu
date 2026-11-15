export interface SimulatorPrefillData {
  currentAge: number;
  retirementAge: number;
  monthlyExpenseToday: number;
  savedAt: number;
  desiredRetirementAge?: number;
  timestamp?: number;
}

const STORAGE_KEY = "anhuu_simulator_prefill";
const EXPIRATION_MS = 24 * 60 * 60 * 1000; // 24 hours

export function saveSimulatorPrefill(data: {
  currentAge: number;
  retirementAge?: number;
  desiredRetirementAge?: number;
  monthlyExpenseToday: number;
}): void {
  if (typeof window === "undefined" || !window.sessionStorage) return;
  try {
    const retAge = data.retirementAge ?? data.desiredRetirementAge ?? 60;
    const now = Date.now();
    const payload: SimulatorPrefillData = {
      currentAge: data.currentAge,
      retirementAge: retAge,
      desiredRetirementAge: retAge,
      monthlyExpenseToday: data.monthlyExpenseToday,
      savedAt: now,
      timestamp: now,
    };
    sessionStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
  } catch {
    // Ignore storage quota or disabled storage errors
  }
}

export function clearSimulatorPrefill(): void {
  try { sessionStorage.removeItem(STORAGE_KEY); } catch { /* Storage may be disabled. */ }
}

export function readAndClearSimulatorPrefill(): SimulatorPrefillData | null {
  const value = readSimulatorPrefill();
  clearSimulatorPrefill();
  return value;
}

export function readSimulatorPrefill(): SimulatorPrefillData | null {
  if (typeof window === "undefined" || !window.sessionStorage) return null;
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    const currentAge = typeof parsed.currentAge === "number" ? parsed.currentAge : null;
    const retirementAge =
      typeof parsed.retirementAge === "number"
        ? parsed.retirementAge
        : typeof parsed.desiredRetirementAge === "number"
        ? parsed.desiredRetirementAge
        : null;
    const monthlyExpenseToday =
      typeof parsed.monthlyExpenseToday === "number" ? parsed.monthlyExpenseToday : null;
    const savedAt =
      typeof parsed.savedAt === "number"
        ? parsed.savedAt
        : typeof parsed.timestamp === "number"
        ? parsed.timestamp
        : null;

    if (
      currentAge !== null &&
      retirementAge !== null &&
      monthlyExpenseToday !== null &&
      savedAt !== null
    ) {
      if (Date.now() - savedAt <= EXPIRATION_MS) {
        return {
          currentAge,
          retirementAge,
          desiredRetirementAge: retirementAge,
          monthlyExpenseToday,
          savedAt,
          timestamp: savedAt,
        };
      }
    }
    return null;
  } catch {
    return null;
  }
}

