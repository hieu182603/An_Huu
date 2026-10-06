type Question = { id: string; choices: { id: string }[] };
const key = (userId: string, policyId: string) => `anhuu:risk:${userId}:${policyId}`;

export function readRiskDraft(userId: string, policyId: string, questions: Question[]): Record<string, string> {
  try {
    const raw = JSON.parse(localStorage.getItem(key(userId, policyId)) || "{}");
    return Object.fromEntries(questions.flatMap(q =>
      typeof raw?.[q.id] === "string" && q.choices.some(c => c.id === raw[q.id]) ? [[q.id, raw[q.id]]] : []));
  } catch { return {}; }
}

export function writeRiskDraft(userId: string, policyId: string, answers: Record<string, string>): boolean {
  try {
    localStorage.setItem(key(userId, policyId), JSON.stringify(answers));
    window.dispatchEvent(new Event("anhuu_risk_survey_updated"));
    return true;
  } catch { return false; }
}
