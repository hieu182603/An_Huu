// Display-only wording overrides for published policy questions. The policy documents are
// approved by hash, so their stored prompt stays unchanged; only the end-user text differs.
const VI_PROMPT_OVERRIDES: Record<string, string> = {
  Q_FINANCIAL_CAPACITY: "Dòng tiền dư hàng tháng sau khi trừ các khoản chi tiêu",
};

export function policyQuestionPrompt(question: { id: string; prompt: string }, language: string): string {
  return language === "en" ? question.prompt : VI_PROMPT_OVERRIDES[question.id] ?? question.prompt;
}
