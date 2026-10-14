import { useEffect, useRef, useState } from 'react';
import { Alert, Button } from '../ui';
import { EvidenceEditor, emptyEvidence, submittedEvidence } from '../EvidenceEditor';
import { getActualMonth, type ActualMonthDetail } from '../../services/actuals';
import { generateContractPeriods, previewSourceReforecast, type SourceReforecastPreviewInput, type SourceReforecastPreviewResponse, type LoanSourceRevisionCommand, type LoanAllocation, type LoanComponents, type LoanContractV2, type LoanBalanceChange } from '../../services/plans';
import { Decimal } from '../../utils/decimal';

type Props = { planId: string; input: SourceReforecastPreviewInput; profileDebts: any; busy: boolean; commands: LoanSourceRevisionCommand[]; onDraftChange: (key: string) => void; onAdd: (command: LoanSourceRevisionCommand) => void };
const money = /^(0|[1-9]\d{0,15})(\.\d{1,2})?$/;
const date = (value: string) => /^\d{4}-\d{2}-\d{2}$/.test(value) && Number.isFinite(Date.parse(value)) && new Date(value).toISOString().slice(0, 10) === value;
const zero = (): LoanComponents => ({ principal: '', interest: '', prepaymentFee: '', otherFee: '' });
const total = (parts: LoanComponents) => Object.values(parts).reduce<Decimal>((sum, value) => sum.plus(value), new Decimal(0));
const labels: Record<keyof LoanComponents, string> = { principal: 'Gốc', interest: 'Lãi', prepaymentFee: 'Phí trả trước', otherFee: 'Phí khác' };
const displayMoney = (value: string) => {
  const [whole, fraction] = value.split('.');
  const isNeg = whole?.startsWith('-') ?? false;
  const digits = (whole || '0').replace(/^-/, '');
  const formatted = `${isNeg ? '-' : ''}${digits.replace(/\B(?=(\d{3})+(?!\d))/g, '.')}`;
  return formatted + (fraction ? ',' + fraction : '') + ' VND';
};

export function LoanRevisionEditor({ planId, input, profileDebts, busy, commands, onDraftChange, onAdd }: Props) {
  const [discovery, setDiscovery] = useState<SourceReforecastPreviewResponse | null>(null);
  const [loading, setLoading] = useState(false), [adding, setAdding] = useState(false), [error, setError] = useState('');
  const [sourceId, setSourceId] = useState(''), [operation, setOperation] = useState<'REVISE' | 'END'>('REVISE');
  const [principal, setPrincipal] = useState(''), [months, setMonths] = useState(''), [rate, setRate] = useState('');
  const [mode, setMode] = useState<LoanContractV2['mode']>('REDUCE_PAYMENT_KEEP_TERM'), [fixed, setFixed] = useState('');
  const [confirmed, setConfirmed] = useState(false), [proof, setProof] = useState(emptyEvidence);
  const [signed, setSigned] = useState(''), [effective, setEffective] = useState(''), [openingPaid, setOpeningPaid] = useState('');
  const [openingProof, setOpeningProof] = useState(emptyEvidence);
  const [period, setPeriod] = useState(input.throughMonth), [ledger, setLedger] = useState<ActualMonthDetail | null>(null), [ledgerLoading, setLedgerLoading] = useState(false), [ledgerError, setLedgerError] = useState('');
  const [eventId, setEventId] = useState(''), [parts, setParts] = useState(zero), [contractParts, setContractParts] = useState(zero);
  const [paymentStatus, setPaymentStatus] = useState<LoanAllocation['paymentStatus']>('CURRENT');
  const [allocationProof, setAllocationProof] = useState(emptyEvidence), [allocations, setAllocations] = useState<LoanAllocation[]>([]);
  const [advanceDate, setAdvanceDate] = useState(''), [advanceAmount, setAdvanceAmount] = useState('');
  const [advanceProof, setAdvanceProof] = useState(emptyEvidence), [advances, setAdvances] = useState<LoanBalanceChange[]>([]);
  const [advanceError, setAdvanceError] = useState('');
  const advanceDraft = Boolean(advanceDate || advanceAmount || advanceProof.reference || advanceProof.content || advanceProof.contentHash || advanceProof.confirmedOn);
  const [bankRows, setBankRows] = useState<Array<{ principal: string; interest: string }>>([]);
  const [amending, setAmending] = useState(false), [amendKind, setAmendKind] = useState<'' | 'CAPPED' | 'ALLOCATED_SHARE'>('');
  const [amendCap, setAmendCap] = useState(''), [amendedOn, setAmendedOn] = useState(''), [amendEffective, setAmendEffective] = useState(''), [amendPaid, setAmendPaid] = useState('');
  const [amendProof, setAmendProof] = useState(emptyEvidence), [amendConfirmed, setAmendConfirmed] = useState(false);
  const live = useRef(true), task = useRef(0), ledgerTask = useRef(0), addingRef = useRef(false);
  useEffect(() => { live.current = true; return () => { live.current = false; ++task.current; ++ledgerTask.current; onDraftChange(''); }; }, [onDraftChange]);
  const options = discovery?.loanRevisionOptions ?? [];
  const option = options.find(item => item.sourceId === sourceId);
  const snapshot = discovery?.candidate;
  const original = option && ([...(snapshot?.loanSources ?? []), ...(snapshot?.newLoanSources ?? [])].find((item: any) => item.sourceHash === option.sourceHash)?.evidence?.command?.contract
    ?? snapshot?.plannedRefinances?.find((item: any) => item.oldSourceHash === option.sourceHash && item.evidence?.command?.operation === 'CANCEL')?.evidence?.basis?.contract) as LoanContractV2 | undefined;
  const debt = option?.legacyOpeningRequired && profileDebts?.status === 'KNOWN' ? profileDebts.entries.find((item: any) => 'profile:debt:' + item.id === sourceId) : undefined;
  const legacyReady = debt && debt.outstandingBalance?.status === 'KNOWN' && debt.balanceAsOf?.status === 'KNOWN' && debt.paymentShare?.status === 'KNOWN' && debt.responsibility?.status === 'KNOWN' && debt.contract?.status === 'KNOWN' && (debt.responsibility.scope !== 'CAPPED' || debt.responsibility.limit?.status === 'KNOWN');
  const basisReady = Boolean(original || legacyReady);
  const openingBalance = original?.principalBalance ?? (legacyReady ? debt.outstandingBalance.value : '0');
  const openingDate = original?.balanceAsOf ?? (legacyReady ? debt.balanceAsOf.value : '');
  const scope = original?.balanceScope ?? 'FULL_CONTRACT';
  const share = original?.paymentShare ?? (legacyReady ? debt.paymentShare.value : '');
  const cap = original?.responsibility.kind === 'CAPPED' ? original.responsibility.limit : legacyReady && debt.responsibility.scope === 'CAPPED' ? debt.responsibility.limit.value : null;
  const knownPaid = original?.userPaidToDate ?? (original?.responsibility.kind === 'CAPPED' ? original.responsibility.previouslyPaid : undefined);
  const amendmentOpeningPaid = knownPaid ?? (legacyReady && cap !== null ? openingPaid : amendPaid);
  const allocatedUserPaid = allocations.reduce((sum, a) => sum.plus(total(a.components)), new Decimal(0));
  const amendmentTotalPaid = money.test(amendmentOpeningPaid) ? new Decimal(amendmentOpeningPaid).plus(allocatedUserPaid) : null;
  const [y, m] = input.throughMonth.split('-').map(Number);
  const cutoff = new Date(Date.UTC(y, m, 0)).toISOString().slice(0, 10);
  const draftKey = JSON.stringify([sourceId, operation, principal, months, rate, mode, fixed, confirmed, proof, signed, effective, openingPaid, openingProof, period, ledger?.revision, eventId, parts, contractParts, paymentStatus, allocationProof, allocations, bankRows, advanceDate, advanceAmount, advanceProof, advances, amending, amendKind, amendCap, amendedOn, amendEffective, amendPaid, amendProof, amendConfirmed]);
  useEffect(() => { onDraftChange(sourceId || loading ? draftKey + String(loading) : ''); }, [draftKey, sourceId, loading, onDraftChange]);
  const consumed: LoanAllocation[] = [...(snapshot?.loanSources ?? []), ...(snapshot?.newLoanSources ?? [])].flatMap((item: any) => item.evidence?.command?.allocations ?? []);
  const sourceEvidence = [...(snapshot?.loanSources ?? []), ...(snapshot?.newLoanSources ?? [])].find((item: any) => item.sourceHash === option?.sourceHash)?.evidence as any;
  const recordedAllocations: LoanAllocation[] = [...(sourceEvidence?.command?.allocations ?? []), ...(sourceEvidence?.consumed ?? []).filter((item: any) => item.sourceId === sourceId).map((item: any) => item.allocation)];
  const recordedUserPaid = [...new Map(recordedAllocations.map(a => [a.allocationId, a])).values()].reduce((sum, a) => sum.plus(total(a.components)), new Decimal(0));
  const blocked = busy || loading || adding;
  function changeAmendment() { setConfirmed(false); setAmendConfirmed(false); setError(''); }
  function cancelAmendment() {
    setAmending(false); setAmendKind(''); setAmendCap(''); setAmendedOn(''); setAmendEffective(''); setAmendPaid(''); setAmendProof(emptyEvidence()); changeAmendment();
  }
  function resetDraft() {
    cancelAmendment();
    ++ledgerTask.current; setSourceId(''); setOperation('REVISE'); setPrincipal(''); setMonths(''); setRate(''); setMode('REDUCE_PAYMENT_KEEP_TERM'); setFixed(''); setConfirmed(false); setProof(emptyEvidence()); setSigned(''); setEffective(''); setOpeningPaid(''); setOpeningProof(emptyEvidence()); setPeriod(input.throughMonth); setLedger(null); setLedgerError(''); setLedgerLoading(false); setEventId(''); setParts(zero()); setContractParts(zero()); setPaymentStatus('CURRENT'); setAllocationProof(emptyEvidence()); setAllocations([]); setBankRows([]); setError(''); clearAdvanceDraft(); setAdvances([]);
  }
  async function loadSources() {
    const request = ++task.current; setLoading(true); setError(''); setDiscovery(null);
    try {
      const result = await previewSourceReforecast(planId, { ...input, sourceCommands: [], pensionSelections: [], loanRevisions: [], loanCreations: [], refinances: [], assetCommands: [], plannedRefinances: [] });
      if (!live.current || request !== task.current) return;
      if (result.status !== 'READY' || !result.candidate) throw new Error(result.issues?.map(issue => issue.message || issue.code).join('; ') || 'Chưa đủ sổ đã đối soát để tải khoản vay.');
      setDiscovery(result);
    } catch (err) { if (live.current && request === task.current) setError(err instanceof Error ? err.message : 'Không tải được khoản vay.'); }
    finally { if (live.current && request === task.current) setLoading(false); }
  }
  async function loadLedger() {
    if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(period) || period > input.throughMonth || period < openingDate.slice(0, 7)) { setLedgerError('Chọn tháng từ ngày số dư gốc đến kỳ đối soát.'); return; }
    const request = ++ledgerTask.current; setLedgerLoading(true); setLedger(null); setEventId(''); setLedgerError('');
    try { const result = await getActualMonth(period, true); if (!live.current || request !== ledgerTask.current) return;
      if (result.reconciliation !== 'MATCHED' || !result.revision || result.period !== period) throw new Error('Sổ tháng chưa đối soát hoặc chưa được lưu.');
      setLedger(result);
      if (allocations.some(a => a.bookedOn.slice(0, 7) === period && a.actualRevision !== result.revision)) { setAllocations(previous => previous.filter(a => a.bookedOn.slice(0, 7) !== period)); changeAmendment(); setLedgerError('Sổ đã đổi phiên bản. Đã bỏ phân bổ cũ của tháng này; hãy chọn lại.'); }
    } catch (err) { if (live.current && request === ledgerTask.current) setLedgerError(err instanceof Error ? err.message : 'Không tải được sổ.'); }
    finally { if (live.current && request === ledgerTask.current) setLedgerLoading(false); }
  }
  const eligibleEvents = ledger?.data.entries.filter(entry => entry.kind === 'DEBT_PAYMENT' && entry.date > openingDate && entry.date <= cutoff && money.test(entry.amount) && new Decimal(entry.amount).gt(0)) ?? [];
  async function addAllocation() {
    if (addingRef.current || blocked || ledgerLoading) return;
    addingRef.current = true; setAdding(true); setError('');
    try {
      const entry = eligibleEvents.find(item => item.eventId === eventId);
      if (!entry || !ledger) throw new Error('Chọn khoản trả nợ từ sổ đã tải.');
      const full = scope === 'USER_SHARE' ? parts : contractParts;
      if (![...Object.values(parts), ...Object.values(full)].every(value => money.test(value))) throw new Error('Nhập đủ gốc, lãi và phí bằng số thập phân không âm (tối đa 16 chữ số và 2 số lẻ); nhập 0 nếu không có.');
      if (Object.keys(parts).some(key => new Decimal(parts[key as keyof LoanComponents]).gt(full[key as keyof LoanComponents]))) throw new Error('Phần bạn trả không được vượt phần toàn hợp đồng.');
      const used = [...consumed, ...commands.flatMap(c => c.allocations), ...allocations].filter(a => a.eventId === eventId).reduce((sum, a) => sum.plus(total(a.components)), new Decimal(0));
      if (!total(parts).gt(0) || used.plus(total(parts)).gt(entry.amount)) throw new Error('Tổng phân bổ phải lớn hơn 0 và không vượt khoản trả còn lại trong sổ.');
      if (allocations.length >= 500) throw new Error('Tối đa 500 phân bổ trong một lệnh.');
      const evidence = await submittedEvidence(allocationProof);
      if (!date(evidence[0].confirmedOn) || evidence[0].reference.length > 1000) throw new Error('Kiểm tra ngày và tên căn cứ phân bổ (tối đa 1000 ký tự).');
      if (!live.current) return;
      setAllocations(prev => [...prev, { allocationId: crypto.randomUUID(), eventId: entry.eventId, actualRevision: ledger.revision, bookedOn: entry.date, scope, components: { ...parts }, contractComponents: { ...full }, paymentStatus, allocationBasis: 'BANK_STATEMENT', evidence }]);
      setConfirmed(false); setAmendConfirmed(false);
      setEventId(''); setParts(zero()); setContractParts(zero()); setAllocationProof(emptyEvidence());
    } catch (err) { if (live.current) setError(err instanceof Error ? err.message : 'Không thêm được phân bổ.'); }
    finally { addingRef.current = false; if (live.current) setAdding(false); }
  }
  function clearAdvanceDraft() {
    setAdvanceDate(''); setAdvanceAmount(''); setAdvanceProof(emptyEvidence()); setAdvanceError(''); setConfirmed(false);
  }
  async function addAdvance() {
    if (addingRef.current || blocked) return;
    addingRef.current = true; setAdding(true); setAdvanceError('');
    try {
      if (!date(advanceDate) || advanceDate <= openingDate || advanceDate > cutoff) throw new Error('Ngày giải ngân phải sau ngày số dư gốc và không sau ngày cuối kỳ đối soát.');
      if (!money.test(advanceAmount) || !new Decimal(advanceAmount).gt(0)) throw new Error('Số tiền giải ngân phải lớn hơn 0, tối đa 16 chữ số nguyên và 2 số lẻ; không dùng ký pháp mũ.');
      if (advances.length >= 100) throw new Error('Tối đa 100 khoản giải ngân bổ sung trong một lệnh.');
      const evidence = await submittedEvidence(advanceProof);
      const today = new Intl.DateTimeFormat('sv-SE', { timeZone: 'Asia/Ho_Chi_Minh' }).format(new Date());
      if (!date(evidence[0].confirmedOn) || evidence[0].confirmedOn > today || evidence[0].reference.length > 1000) throw new Error('Kiểm tra ngày xác nhận căn cứ (không sau hôm nay) và tên căn cứ (tối đa 1000 ký tự).');
      if (advances.some(a => a.bookedOn === advanceDate && new Decimal(a.amount).minus(advanceAmount).isZero() && a.evidence.some(e => e.reference === evidence[0].reference && e.contentHash === evidence[0].contentHash))) throw new Error('Khoản này đã có cùng ngày, số tiền và căn cứ. Kiểm tra danh sách để tránh ghi trùng.');
      if (!live.current) return;
      setAdvances(prev => [...prev, { changeId: crypto.randomUUID(), bookedOn: advanceDate, amount: advanceAmount, kind: 'CONFIRMED_PRINCIPAL_ADVANCE', evidence }]);
      clearAdvanceDraft(); setError('');
    } catch (err) { if (live.current) setAdvanceError(err instanceof Error ? err.message : 'Không thêm được khoản giải ngân.'); }
    finally { addingRef.current = false; if (live.current) setAdding(false); }
  }
  async function addCommand() {
    if (addingRef.current || blocked) return;
    addingRef.current = true; setAdding(true); setError('');
    try {
      if (!option || !basisReady) throw new Error('Tải và chọn khoản vay có hợp đồng gốc đầy đủ.');
      if (!confirmed) throw new Error('Xác nhận số dư và điều khoản theo chứng từ trước khi thêm lệnh.');
      if (commands.some(c => c.sourceId === sourceId)) throw new Error('Nguồn này đã có lệnh. Xóa lệnh cũ trước khi thay thế.');
      if (commands.length >= 30) throw new Error('Tối đa 30 lệnh sửa khoản vay trong một lần xem trước.');
      if (eventId || Object.values(parts).some(Boolean) || Object.values(contractParts).some(Boolean) || allocationProof.reference || allocationProof.content || allocationProof.contentHash || allocationProof.confirmedOn) throw new Error('Thêm hoặc bỏ phần phân bổ đang nhập trước khi thêm lệnh.');
      if (advanceDraft) throw new Error('Thêm hoặc bỏ phần giải ngân đang nhập trước khi thêm lệnh.');
      const evidence = await submittedEvidence(proof); const knownOn = evidence[0].confirmedOn;
      const today = new Intl.DateTimeFormat('sv-SE', { timeZone: 'Asia/Ho_Chi_Minh' }).format(new Date());
      if (!date(knownOn) || knownOn < cutoff || knownOn > today || evidence[0].reference.length > 1000 || (original && knownOn < original.knownOn)) throw new Error('Ngày xác nhận phải từ ngày chốt số dư đến hôm nay; tên căn cứ tối đa 1000 ký tự.');
      if (openingDate > cutoff || cutoff >= (snapshot?.replayInput?.sourceRegistry?.endMonth ?? '9999-12') + '-31') throw new Error('Kỳ đối soát không còn phù hợp với nguồn khoản vay.');
      const paidPrincipal = allocations.reduce((sum, a) => sum.plus(a.contractComponents.principal), new Decimal(0));
      const paidUser = allocations.reduce((sum, a) => sum.plus(total(a.components)), new Decimal(0));
      const closing = operation === 'END' ? '0' : principal;
      const advanced = advances.reduce((sum, a) => sum.plus(a.amount), new Decimal(0));
      if (!money.test(closing) || !new Decimal(openingBalance).minus(paidPrincipal).plus(advanced).minus(closing).isZero()) throw new Error('Dư nợ cuối kỳ phải bằng dư nợ gốc trừ gốc đã trả cộng giải ngân bổ sung đã khai. Không tự bù chênh lệch.');
      if (advances.some(a => a.bookedOn <= openingDate || a.bookedOn > cutoff || a.evidence.some(e => e.confirmedOn > knownOn))) throw new Error('Kiểm tra ngày giải ngân và căn cứ: ngày xác nhận số dư không được trước căn cứ giải ngân bổ sung.');
      const days = new Map<string, { paid: Decimal; advanced: Decimal }>();
      for (const a of allocations) { const day = days.get(a.bookedOn) ?? { paid: new Decimal(0), advanced: new Decimal(0) }; day.paid = day.paid.plus(a.contractComponents.principal); days.set(a.bookedOn, day); }
      for (const a of advances) { const day = days.get(a.bookedOn) ?? { paid: new Decimal(0), advanced: new Decimal(0) }; day.advanced = day.advanced.plus(a.amount); days.set(a.bookedOn, day); }
      let running = new Decimal(openingBalance);
      for (const [day, amounts] of [...days].sort(([a], [b]) => a.localeCompare(b))) {
        if (amounts.paid.gt(0) && amounts.advanced.gt(0)) throw new Error('Ngày ' + day + ' có cả trả gốc và giải ngân. Chứng từ chỉ có ngày chưa xác định được thứ tự; cần rà soát chứng từ, không tự đổi ngày để tiếp tục.');
        running = running.plus(amounts.advanced).minus(amounts.paid);
        if (running.lt(0)) throw new Error('Gốc trả ngày ' + day + ' vượt dư nợ tại thời điểm đó. Giải ngân sau không bù được khoản trả trước.');
      }
      if (allocations.some(a => a.evidence.some(e => e.confirmedOn > knownOn))) throw new Error('Ngày xác nhận số dư không được trước căn cứ phân bổ.');
      // Re-read saved ledgers before attaching; never manufacture payment IDs or revisions.
      for (const month of new Set(allocations.map(a => a.bookedOn.slice(0, 7)))) {
        const fresh = await getActualMonth(month, true);
        if (fresh.reconciliation !== 'MATCHED' || allocations.some(a => a.bookedOn.startsWith(month) && (a.actualRevision !== fresh.revision || !fresh.data.entries.some(e => e.eventId === a.eventId && e.date === a.bookedOn && e.kind === 'DEBT_PAYMENT')))) throw new Error('Sổ trả nợ đã thay đổi. Tải lại tháng và phân bổ lại trước khi thêm lệnh.');
      }
      let legacyOpening: LoanSourceRevisionCommand['legacyOpening'];
      if (option.legacyOpeningRequired) {
        const openingEvidence = await submittedEvidence(openingProof);
        if (!date(signed) || !date(effective) || signed > effective || effective > openingDate || !date(openingEvidence[0].confirmedOn) || openingEvidence[0].confirmedOn < openingDate || openingEvidence[0].confirmedOn > knownOn || openingEvidence[0].reference.length > 1000 || !money.test(openingPaid) || (cap === null && !new Decimal(openingPaid).isZero()) || (cap !== null && new Decimal(openingPaid).gt(cap))) throw new Error('Kiểm tra căn cứ mở đầu: ngày ký ≤ ngày hiệu lực ≤ ngày số dư gốc, ngày xác nhận không sau căn cứ hiện tại; số đã trả theo trần không được thiếu hoặc vượt trần. Khoản không có trần khai 0.');
        legacyOpening = { signedOn: signed, amendedOn: null, effectiveOn: effective, knownOn: openingEvidence[0].confirmedOn, previouslyPaid: openingPaid, ...(cap !== null ? { capBasis: 'TOTAL_USER_PAYMENTS' as const } : {}), evidence: openingEvidence };
      }
      let responsibilityAmendment: LoanSourceRevisionCommand['responsibilityAmendment'];
      if (amending) {
        if (!amendKind || !amendConfirmed) throw new Error('Chọn loại trách nhiệm và xác nhận riêng thay đổi trách nhiệm theo chứng từ.');
        if (!date(amendedOn) || !date(amendEffective) || amendedOn < (original?.amendedOn ?? original?.signedOn ?? signed) || amendedOn > amendEffective || amendEffective < openingDate || amendEffective > cutoff) throw new Error('Ngày sửa đổi phải từ ngày ký/lần sửa trước đến ngày hiệu lực; ngày hiệu lực từ ngày số dư gốc đến cuối kỳ đối soát.');
        if (!money.test(amendmentOpeningPaid)) throw new Error('Nhập tổng tiền bạn đã trả tới ngày số dư gốc theo chứng từ, tối đa 16 chữ số nguyên và 2 số lẻ; không mặc định số chưa biết thành 0.');
        if (new Decimal(amendmentOpeningPaid).lt(recordedUserPaid)) throw new Error('Tổng lịch sử đã trả thấp hơn các phân bổ cùng khoản vay đã ghi nhận. Đối chiếu lại chứng từ, không đặt lại lịch sử.');
        const amendmentEvidence = await submittedEvidence(amendProof);
        if (!date(amendmentEvidence[0].confirmedOn) || amendmentEvidence[0].confirmedOn < amendEffective || amendmentEvidence[0].confirmedOn > knownOn || amendmentEvidence[0].reference.length > 1000) throw new Error('Căn cứ thay trách nhiệm phải được xác nhận từ ngày hiệu lực đến ngày xác nhận số dư; tên căn cứ tối đa 1000 ký tự.');
        if (amendKind === 'CAPPED' && !money.test(amendCap)) throw new Error('Nhập trần tổng tiền bạn trả bằng số không âm, tối đa 16 chữ số nguyên và 2 số lẻ.');
        if ((amendKind === 'ALLOCATED_SHARE' && cap === null) || (amendKind === 'CAPPED' && cap !== null && new Decimal(amendCap).minus(cap).isZero())) throw new Error('Trách nhiệm và trần chưa thay đổi. Hủy phần thay đổi trách nhiệm để tiếp tục cập nhật lịch.');
        responsibilityAmendment = { effectiveOn: amendEffective, openingUserPaid: amendmentOpeningPaid, confirm: true, evidence: amendmentEvidence };
      }
      const nextPaid = new Decimal(amending ? amendmentOpeningPaid : knownPaid ?? (cap !== null ? openingPaid : '0')).plus(paidUser).toString();
      if (!money.test(nextPaid)) throw new Error('Tổng tiền đã trả vượt giới hạn 16 chữ số nguyên và 2 số lẻ. Kiểm tra lại số đã trả và các phân bổ.');
      const nextCap = amending ? amendKind === 'CAPPED' ? amendCap : null : cap;
      if (nextCap !== null && new Decimal(nextPaid).gt(nextCap)) throw new Error(amending ? 'Trần mới thấp hơn tổng đã trả (gồm gốc, lãi và phí). Không tự hoàn tiền hoặc xóa lịch sử.' : 'Tổng đã trả vượt trần nghĩa vụ gốc. Cần xử lý thay đổi trách nhiệm bằng căn cứ riêng.');
      let periods: LoanContractV2['periods'] = [];
      if (operation === 'REVISE') {
        if (!/^[1-9]\d{0,2}$/.test(months) || Number(months) > 600 || !/^(0|[1-9]\d{0,2})(\.\d{1,10})?$/.test(rate) || new Decimal(rate).gt(100)) throw new Error('Nhập thời hạn nguyên từ 1–600 tháng và lãi suất từ 0–100%, tối đa 10 số lẻ.');
        if (mode === 'REDUCE_TERM_KEEP_PAYMENT' && (!money.test(fixed) || !new Decimal(fixed).gt(0))) throw new Error('Khoản trả cố định phải là số tiền dương.');
        periods = generateContractPeriods(cutoff, Number(months), rate).map(p => ({ ...p, rate: { ...(p.rate as any), percent: rate } }));
        if (mode === 'BANK_SCHEDULE' || mode === 'RESTRUCTURED') {
          if (bankRows.length !== periods.length || bankRows.some(row => !money.test(row.principal) || !money.test(row.interest))) throw new Error('Nhập gốc và lãi của từng kỳ ngân hàng; nhập 0 nếu không có.');
          periods = periods.map((p, i) => ({ ...p, bankPayment: bankRows[i] }));
        }
      }
      const contract: LoanContractV2 = { contractVersion: 2, currency: 'VND', signedOn: original?.signedOn ?? signed, amendedOn: amending ? amendedOn : cutoff, effectiveOn: amending ? amendEffective : cutoff, knownOn, confirmation: 'BANK_CONFIRMED', evidence, balanceAsOf: cutoff, principalBalance: closing, balanceScope: scope, paymentShare: share,
        responsibility: nextCap !== null ? { kind: 'CAPPED', capBasis: 'TOTAL_USER_PAYMENTS', limit: nextCap, previouslyPaid: nextPaid, evidence: responsibilityAmendment?.evidence ?? evidence } : { kind: 'ALLOCATED_SHARE' },
        ...(amending || knownPaid !== undefined ? { userPaidToDate: nextPaid } : {}), interestBasis: 'REDUCING_BALANCE', rounding: 'CENT_HALF_UP', mode: operation === 'END' ? 'BANK_SCHEDULE' : mode, fixedPayment: operation === 'REVISE' && mode === 'REDUCE_TERM_KEEP_PAYMENT' ? fixed : null, finalPayment: operation === 'REVISE' && mode === 'REDUCE_PAYMENT_KEEP_TERM' ? 'ADJUST_FINAL_PAYMENT' : 'NO_BALLOON', maturityDate: periods.at(-1)?.dueDate ?? cutoff, periods };
      if (!live.current) return;
      onAdd({ commandId: crypto.randomUUID(), sourceId, operation, expectedSourceRevision: option.sourceRevision, expectedSourceHash: option.sourceHash, expectedContractHash: option.contractHash, confirm: true, contract, ...(legacyOpening ? { legacyOpening } : {}), ...(responsibilityAmendment ? { responsibilityAmendment } : {}), allocations, principalAdvances: advances }); resetDraft();
    } catch (err) { if (live.current) setError(err instanceof Error ? err.message : 'Không thêm được lệnh.'); }
    finally { addingRef.current = false; if (live.current) setAdding(false); }
  }
  return <section className="loan-revision-editor" aria-labelledby="loan-revision-title">
    <h3 id="loan-revision-title">Sửa hoặc kết thúc nguồn khoản vay</h3>
    <p>Đối chiếu dư nợ với khoản trả đã lưu. Lệnh chỉ vào bản nháp; cần xem trước, lưu và xác nhận áp dụng. Đổi kỳ đối soát hoặc phiên bản kế hoạch sẽ xóa phần nhập dở của form này.</p>
    <fieldset disabled={blocked}>
      <Button variant="secondary" loading={loading} disabled={Boolean(sourceId) || !planId} onClick={loadSources}>Tải danh mục khoản vay</Button>
      {!discovery && !loading && <p>Tải danh mục từ phiên bản gốc trước khi chọn khoản vay.</p>}
      {discovery && !options.length && <p role="status">Không có khoản vay đủ điều kiện sửa trong kỳ này. Khoản thuộc phương án tái cấp vốn đang hoạt động phải được xử lý ở form tương ứng.</p>}
      <label htmlFor="lr-source">Khoản vay cần sửa</label><select id="lr-source" value={sourceId} disabled={!options.length || Boolean(sourceId)} onChange={e => { setSourceId(e.target.value); setError(''); }}><option value="">Chọn khoản vay</option>{options.map(o => <option key={o.sourceId} value={o.sourceId}>{o.sourceId} · r{o.sourceRevision}{o.legacyOpeningRequired ? ' · Cần căn cứ hợp đồng cũ' : ''}</option>)}</select>
      {sourceId && <>
        {!basisReady ? <Alert tone="warning" title="Thiếu hợp đồng gốc">Chưa đọc được số dư và điều khoản gốc. Bỏ nhập dở rồi tải lại; không tự điền số thay thế.</Alert> : <>
          <p className="loan-original">Dư nợ gốc: <strong>{displayMoney(openingBalance)}</strong> tại {openingDate}. Ngày ký: {original?.signedOn ?? 'Cần khai theo hồ sơ cũ'}. Phạm vi: {scope === 'USER_SHARE' ? 'Phần của bạn' : 'Toàn hợp đồng'}; tỷ lệ trả: {share}. {cap !== null ? 'Trần nghĩa vụ: ' + displayMoney(cap) : 'Trách nhiệm theo tỷ lệ gốc'}.<br />Giữ nguyên phạm vi và tỷ lệ đã lưu. Muốn thay trách nhiệm hoặc trần nghĩa vụ, khai phần thay đổi có căn cứ riêng bên dưới; không đặt lại số đã thanh toán.</p>
          <div className="loan-revision-grid">
            <label>Thao tác khoản vay<select id="lr-operation" value={operation} onChange={e => { setOperation(e.target.value as typeof operation); setConfirmed(false); }}><option value="REVISE">Cập nhật điều khoản</option><option value="END">Tất toán / Kết thúc</option></select></label>
            {operation === 'REVISE' && <><label>Dư nợ cuối kỳ (VND)<input id="lr-principal" inputMode="decimal" value={principal} onChange={e => { setPrincipal(e.target.value); setConfirmed(false); }} /></label>
            <label>Thời hạn còn lại (tháng)<input id="lr-months" inputMode="numeric" value={months} onChange={e => { setMonths(e.target.value); setBankRows([]); setConfirmed(false); }} /></label>
            <label>Lãi suất (%/năm)<input id="lr-rate" inputMode="decimal" value={rate} onChange={e => { setRate(e.target.value); setConfirmed(false); }} /></label>
            <label>Phương thức trả nợ<select id="lr-mode" value={mode} onChange={e => { setMode(e.target.value as typeof mode); setConfirmed(false); }}><option value="REDUCE_PAYMENT_KEEP_TERM">Giữ thời hạn, điều chỉnh tiền góp</option><option value="REDUCE_TERM_KEEP_PAYMENT">Giữ tiền góp, rút ngắn hạn</option><option value="BANK_SCHEDULE">Lịch theo ngân hàng</option><option value="RESTRUCTURED">Lịch cơ cấu lại nợ</option></select></label>
            {mode === 'REDUCE_TERM_KEEP_PAYMENT' && <label>Khoản trả cố định (VND)<input id="lr-fixed" inputMode="decimal" value={fixed} onChange={e => { setFixed(e.target.value); setConfirmed(false); }} /></label>}</>}
          </div>
          {operation === 'END' ? <p>Dư nợ sau tất toán phải bằng 0. Phân bổ đủ phần gốc đã trả; nút này không tự tạo giao dịch trả nợ hoặc trừ tiền quỹ.</p> : <p>Lịch ở form này trả cuối mỗi tháng, lãi đơn theo số ngày thực tế/365, phí và lãi chuyển kỳ bằng 0. Chỉ xác nhận nếu đúng chứng từ; lịch ngày khác cần xử lý riêng.</p>}
          {operation === 'REVISE' && (mode === 'BANK_SCHEDULE' || mode === 'RESTRUCTURED') && <div><Button variant="secondary" disabled={!/^[1-9]\d{0,2}$/.test(months) || Number(months) > 600} onClick={() => { setBankRows(Array.from({ length: Number(months) }, () => ({ principal: '', interest: '' }))); setConfirmed(false); }}>Tạo ô nhập lịch ngân hàng</Button><div className="loan-bank-rows">{bankRows.map((row, index) => <div className="loan-revision-grid" key={index}><strong>Kỳ {index + 1}</strong>{(['principal', 'interest'] as const).map(key => <label key={key}>{labels[key]} kỳ {index + 1}<input inputMode="decimal" value={row[key]} onChange={e => { setBankRows(prev => prev.map((p, i) => i === index ? { ...p, [key]: e.target.value } : p)); setConfirmed(false); }} /></label>)}</div>)}</div></div>}
          {option?.legacyOpeningRequired && <fieldset><legend>Căn cứ hợp đồng cũ</legend><div className="loan-revision-grid"><label>Ngày ký hợp đồng cũ<input id="lr-signed" type="date" value={signed} max={openingDate} onChange={e => { setSigned(e.target.value); setConfirmed(false); }} /></label><label>Ngày hiệu lực hợp đồng cũ<input id="lr-effective" type="date" value={effective} min={signed} max={openingDate} onChange={e => { setEffective(e.target.value); setConfirmed(false); }} /></label><label>Số đã trả theo trần trước số dư gốc (VND)<input id="lr-opening-paid" inputMode="decimal" value={openingPaid} onChange={e => { setOpeningPaid(e.target.value); changeAmendment(); }} /></label></div><EvidenceEditor description="Chỉ mã kiểm tra nội dung được gửi lên. Nhập thông tin từ hợp đồng hoặc sao kê ngân hàng; hệ thống không tự xác nhận chứng từ thay bạn." title="Căn cứ mở đầu khoản vay cũ" value={openingProof} onChange={value => { setOpeningProof(value); setConfirmed(false); }} /></fieldset>}
          <details className="loan-payment-details"><summary>Phân bổ khoản trả đã lưu ({allocations.length})</summary><fieldset><legend>Chi tiết phân bổ</legend><p>Chọn đúng giao dịch trong sổ đã đối soát; nhập riêng phần bạn trả và toàn hợp đồng theo chứng từ, không tự chia theo tỷ lệ.</p>
            <div className="loan-revision-grid"><label>Tháng sổ trả nợ<input id="lr-period" type="month" min={openingDate.slice(0, 7)} max={input.throughMonth} value={period} onChange={e => { ++ledgerTask.current; setPeriod(e.target.value); setLedger(null); setEventId(''); setLedgerError(''); setLedgerLoading(false); }} /></label><Button variant="secondary" loading={ledgerLoading} onClick={loadLedger}>Tải sổ trả nợ</Button></div>
            {ledgerError && <p role="alert">{ledgerError}</p>}{ledger && !eligibleEvents.length && <p role="status">Không có khoản trả nợ trong khoảng từ số dư gốc đến kỳ đối soát.</p>}
            <label>Khoản trả trong sổ<select id="lr-event" value={eventId} onChange={e => setEventId(e.target.value)}><option value="">Chọn khoản trả đã lưu</option>{eligibleEvents.map(entry => <option key={entry.eventId} value={entry.eventId}>{entry.date} · {displayMoney(entry.amount)} · {entry.note || entry.eventId}</option>)}</select></label>
            <div className="loan-revision-grid">{(Object.keys(labels) as Array<keyof LoanComponents>).map(key => <label key={key}>{labels[key]} bạn trả (VND)<input id={'lr-user-' + key} inputMode="decimal" value={parts[key]} onChange={e => setParts(prev => ({ ...prev, [key]: e.target.value }))} /></label>)}</div>
            {scope === 'FULL_CONTRACT' && <div className="loan-revision-grid">{(Object.keys(labels) as Array<keyof LoanComponents>).map(key => <label key={key}>{labels[key]} toàn hợp đồng (VND)<input id={'lr-contract-' + key} inputMode="decimal" value={contractParts[key]} onChange={e => setContractParts(prev => ({ ...prev, [key]: e.target.value }))} /></label>)}</div>}
            <label>Tình trạng khoản trả<select value={paymentStatus} onChange={e => setPaymentStatus(e.target.value as typeof paymentStatus)}><option value="CURRENT">Đúng kỳ</option><option value="OVERDUE">Quá hạn</option><option value="MIXED">Gồm đúng kỳ và quá hạn</option></select></label>
            <EvidenceEditor description="Chỉ mã kiểm tra nội dung được gửi lên. Nhập thông tin từ hợp đồng hoặc sao kê ngân hàng; hệ thống không tự xác nhận chứng từ thay bạn." title="Căn cứ phân bổ khoản trả" value={allocationProof} onChange={setAllocationProof} />
            <div className="future-actions"><Button variant="secondary" disabled={!eventId || ledgerLoading} onClick={addAllocation}>Thêm phân bổ khoản trả</Button><Button variant="ghost" onClick={() => { setEventId(''); setParts(zero()); setContractParts(zero()); setAllocationProof(emptyEvidence()); }}>Bỏ phần phân bổ đang nhập</Button></div>
            {allocations.map((a, index) => <div className="loan-allocation" key={a.allocationId}><p>{a.bookedOn} · {a.eventId} · sổ r{a.actualRevision} · Bạn trả {displayMoney(total(a.components).toString())} · Gốc toàn hợp đồng {displayMoney(a.contractComponents.principal)}</p><Button variant="ghost" onClick={() => { setAllocations(prev => prev.filter(item => item.allocationId !== a.allocationId)); changeAmendment(); }}>Bỏ phân bổ {index + 1}</Button></div>)}
          </fieldset></details>
          <details className="loan-advance-details"><summary>Giải ngân bổ sung ({advances.length})</summary>
            <fieldset><legend>Khoản giải ngân bổ sung theo chứng từ</legend>
              <p>Chỉ khai khoản đã giải ngân sau {openingDate} đến {cutoff}, theo phạm vi <strong>{scope === 'FULL_CONTRACT' ? 'toàn hợp đồng' : 'phần của bạn'}</strong>. Không nhân tỷ lệ trả nợ vào số tiền này. Việc khai ở đây tăng dư nợ, không tự ghi thu nhập hoặc cộng tiền vào quỹ hưu.</p>
              <div className="loan-revision-grid">
                <label htmlFor="lr-advance-date">Ngày giải ngân bổ sung<input id="lr-advance-date" type="date" min={openingDate ? new Date(Date.parse(openingDate + 'T00:00:00Z') + 86400000).toISOString().slice(0, 10) : undefined} max={cutoff} value={advanceDate} onChange={e => { setAdvanceDate(e.target.value); setAdvanceError(''); setConfirmed(false); }} /></label>
                <label htmlFor="lr-advance-amount">Số tiền giải ngân bổ sung (VND)<input id="lr-advance-amount" inputMode="decimal" value={advanceAmount} onChange={e => { setAdvanceAmount(e.target.value); setAdvanceError(''); setConfirmed(false); }} /></label>
              </div>
              <EvidenceEditor description="Nhập căn cứ khoản giải ngân đã xảy ra từ hợp đồng hoặc sao kê. Chỉ mã kiểm tra nội dung được gửi lên; không tự tạo chứng từ hoặc số tiền chênh lệch." title="Căn cứ giải ngân bổ sung" value={advanceProof} onChange={value => { setAdvanceProof(value); setAdvanceError(''); setConfirmed(false); }} />
              <div className="future-actions"><Button variant="secondary" onClick={addAdvance}>Thêm khoản giải ngân</Button><Button variant="ghost" onClick={clearAdvanceDraft}>Bỏ phần giải ngân đang nhập</Button></div>
              {advanceError && <p role="alert">{advanceError}</p>}
              <div role="region" aria-label="Danh sách giải ngân bổ sung" className="loan-advance-list">
                {!advances.length ? <p>Chưa thêm khoản giải ngân bổ sung.</p> : <>
                  <p><strong>Tổng giải ngân bổ sung: {displayMoney(advances.reduce((sum, a) => sum.plus(a.amount), new Decimal(0)).toString())}</strong>. Để sửa, bỏ dòng rồi nhập lại theo chứng từ.</p>
                  {advances.map((a, index) => <div className="loan-allocation" key={a.changeId}><p><strong>{a.bookedOn} · {displayMoney(a.amount)}</strong><br />Căn cứ: {a.evidence[0].reference} · Xác nhận: {a.evidence[0].confirmedOn}</p><Button variant="ghost" onClick={() => { setAdvances(prev => prev.filter(item => item.changeId !== a.changeId)); setConfirmed(false); setError(''); }}>Bỏ giải ngân {index + 1}</Button></div>)}
                </>}
              </div>
            </fieldset>
          </details>
          {advanceDraft && <p role="status" className="loan-advance-pending">Còn khoản giải ngân đang nhập: thêm hoặc bỏ phần này trước khi thêm lệnh, kể cả khi đã thu gọn.</p>}
          {!amending ? <Button className="lr-amend-start" variant="secondary" onClick={() => { setAmending(true); changeAmendment(); }}>Thay trách nhiệm / trần nghĩa vụ</Button> : <fieldset className="loan-amendment">
            <legend>Thay trách nhiệm và trần nghĩa vụ</legend>
            <p>Trần là tổng tiền bạn trả, gồm gốc, lãi và phí. Thay đổi chỉ điều chỉnh lịch sau kỳ đối soát; không đổi phạm vi, tỷ lệ, giao dịch cũ hoặc số dư quỹ.</p>
            <div className="loan-revision-grid">
              <label htmlFor="lr-amend-kind">Trách nhiệm mới<select id="lr-amend-kind" autoFocus value={amendKind} onChange={e => { setAmendKind(e.target.value as typeof amendKind); setAmendCap(''); changeAmendment(); }}><option value="">Chọn theo chứng từ sửa đổi</option><option value="CAPPED">Có trần tổng nghĩa vụ</option><option value="ALLOCATED_SHARE">Theo tỷ lệ đã lưu, không có trần</option></select></label>
              {amendKind === 'CAPPED' && <label htmlFor="lr-amend-cap">Trần tổng tiền bạn trả mới (VND)<input id="lr-amend-cap" inputMode="decimal" value={amendCap} onChange={e => { setAmendCap(e.target.value); changeAmendment(); }} /></label>}
              <label htmlFor="lr-amended-on">Ngày sửa đổi theo chứng từ<input id="lr-amended-on" type="date" min={original?.amendedOn ?? original?.signedOn ?? signed} max={amendEffective || cutoff} value={amendedOn} onChange={e => { setAmendedOn(e.target.value); changeAmendment(); }} /></label>
              <label htmlFor="lr-amend-effective">Ngày hiệu lực trách nhiệm mới<input id="lr-amend-effective" type="date" min={openingDate} max={cutoff} value={amendEffective} onChange={e => { setAmendEffective(e.target.value); changeAmendment(); }} /></label>
              <label htmlFor="lr-amend-paid">Tổng bạn đã trả tới ngày số dư gốc (VND)<input id="lr-amend-paid" inputMode="decimal" value={amendmentOpeningPaid} readOnly={knownPaid !== undefined || Boolean(legacyReady && cap !== null)} aria-describedby="lr-amend-paid-help" onChange={e => { setAmendPaid(e.target.value); changeAmendment(); }} /></label>
            </div>
            <p id="lr-amend-paid-help">Mốc lịch sử: {openingDate}, gồm gốc, lãi và phí bạn đã trả. {knownPaid !== undefined ? 'Số đã lưu được giữ nguyên, không nhập lại.' : legacyReady && cap !== null ? 'Lấy từ căn cứ hợp đồng cũ bạn đã khai ở trên.' : 'Chưa có tổng lịch sử: nhập theo chứng từ, không bỏ trống hoặc tự coi là 0.'} Không nhập dư gốc hoặc số đã trả tới ngày sửa đổi.</p>
            <div className="loan-amendment-summary" role="region" aria-label="Đối chiếu nghĩa vụ sau thay đổi">
              <p>Bạn trả thêm trong các phân bổ mới: <strong>{displayMoney(allocatedUserPaid.toString())}</strong>.</p>
              <p>Tổng đã trả sau đối soát: <strong>{amendmentTotalPaid ? displayMoney(amendmentTotalPaid.toString()) : 'Chưa đủ thông tin'}</strong>.</p>
              {amendKind === 'CAPPED' && <p>Phần còn lại theo trần mới: <strong>{amendmentTotalPaid && money.test(amendCap) ? amendmentTotalPaid.gt(amendCap) ? 'Trần thấp hơn tổng đã trả — cần kiểm tra' : displayMoney(new Decimal(amendCap).minus(amendmentTotalPaid).toString()) : 'Chưa đủ thông tin'}</strong>.</p>}
              {amendKind === 'ALLOCATED_SHARE' && <p>Bỏ trần vẫn giữ toàn bộ tổng đã trả để dùng cho các lần sửa tiếp theo.</p>}
            </div>
            <EvidenceEditor title="Căn cứ thay trách nhiệm" description="Nhập chứng từ sửa đổi và căn cứ tổng tiền đã trả. Mã kiểm tra nội dung không thay xác minh của ngân hàng; không tự suy việc hoàn tiền hoặc xóa nghĩa vụ." value={amendProof} onChange={value => { setAmendProof(value); changeAmendment(); }} />
            <label className="loan-confirm"><input type="checkbox" checked={amendConfirmed} onChange={e => { setAmendConfirmed(e.target.checked); setConfirmed(false); }} />Tôi xác nhận thay trách nhiệm theo chứng từ và giữ đầy đủ lịch sử đã trả.</label>
            <Button variant="ghost" onClick={() => { cancelAmendment(); requestAnimationFrame(() => document.querySelector<HTMLButtonElement>('.lr-amend-start')?.focus()); }}>Hủy thay đổi trách nhiệm</Button>
          </fieldset>}
          <EvidenceEditor description="Chỉ mã kiểm tra nội dung được gửi lên. Nhập thông tin từ hợp đồng hoặc sao kê ngân hàng; hệ thống không tự xác nhận chứng từ thay bạn." title="Căn cứ số dư và điều khoản khoản vay" value={proof} onChange={value => { setProof(value); setConfirmed(false); }} />
          <label className="loan-confirm"><input type="checkbox" checked={confirmed} onChange={e => setConfirmed(e.target.checked)} />Tôi xác nhận số dư, phân bổ, giải ngân bổ sung và lịch trả đúng chứng từ ngân hàng; {amending ? 'thay trách nhiệm theo phần đã khai, giữ nguyên phạm vi và tỷ lệ.' : 'giữ nguyên phạm vi, tỷ lệ và trách nhiệm gốc.'}</label>
          <Button variant="secondary" loading={adding} disabled={!confirmed || ledgerLoading} onClick={addCommand}>{operation === 'END' ? 'Thêm lệnh kết thúc khoản vay' : 'Thêm lệnh sửa khoản vay'}</Button>
        </>}
        <Button variant="ghost" onClick={resetDraft}>Bỏ nhập dở khoản vay</Button>
      </>}
    </fieldset>
    {error && <Alert tone="danger" title="Kiểm tra lệnh khoản vay">{error}</Alert>}
  </section>;
}
