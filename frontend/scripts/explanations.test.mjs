import test from 'node:test';
import assert from 'node:assert/strict';
import { positionExplainPopup } from '../src/components/explanations/position.ts';

test('explanation popup flips and clamps within the viewport', () => {
  assert.deepEqual(positionExplainPopup({ x: 350, y: 760 }, { width: 300, height: 200 }, { width: 375, height: 812 }), { left: 38, top: 548 });
  assert.deepEqual(positionExplainPopup({ x: 3, y: 4 }, { width: 300, height: 200 }, { width: 375, height: 812 }), { left: 15, top: 16 });
});

test('selected phrases match glossary labels exactly, never fuzzily', async () => {
  const { matchGlossaryTerm } = await import('../src/components/explanations/glossaryMatch.ts');
  const terms = [
    { key: 'netWorth', label: { vi: 'Tài sản ròng', en: 'Net worth' } },
    { key: 'nav', label: { vi: 'Giá trị tài sản ròng của quỹ (NAV)', en: 'Net asset value (NAV)' } },
  ];
  assert.equal(matchGlossaryTerm('TÀI SẢN RÒNG (NET WORTH)', terms)?.key, 'netWorth');
  assert.equal(matchGlossaryTerm('  tài   sản ròng: ', terms)?.key, 'netWorth');
  assert.equal(matchGlossaryTerm('NAV', terms)?.key, 'nav');
  assert.equal(matchGlossaryTerm('tài sản', terms), undefined);
  assert.equal(matchGlossaryTerm('Tổng tài sản ròng hiện có', terms), undefined);
});

import { createExplanationCache, explanationRequestKey } from '../src/components/explanations/requestCache.ts';
import { productExplanations, mergeExplanationTerms } from '../src/components/explanations/catalog.ts';
import { explanationGlossary } from '../../backend/src/modules/explanations/glossary.ts';
import { matchGlossaryTerm } from '../src/components/explanations/glossaryMatch.ts';

test('prepared catalog is bilingual, unique and matches glossary aliases unambiguously', () => {
  const terms = mergeExplanationTerms(explanationGlossary.terms);
  assert.equal(new Set(productExplanations.map(t => t.key)).size, productExplanations.length);
  for (const term of terms) {
    for (const lang of ['vi', 'en']) {
      assert.ok(term.definition[lang].length > 20, `${term.key}/${lang}`);
      assert.equal(matchGlossaryTerm(term.label[lang], terms)?.key, term.key);
    }
    for (const alias of term.aliases ?? []) assert.equal(matchGlossaryTerm(alias, terms)?.key, term.key, alias);
  }
  assert.equal(matchGlossaryTerm('quỹ dự phòng khẩn cấp', terms)?.key, 'emergencyReserve');
  assert.equal(matchGlossaryTerm('Số dư thực tế', terms)?.key, 'actualBalance');
  assert.equal(matchGlossaryTerm('Giá trị tài sản ròng (NAV)', terms)?.key, 'nav');
  assert.equal(matchGlossaryTerm('tiền', terms), undefined);
});

test('server definitions override bundled copies; ambiguous aliases never pick an arbitrary term', () => {
  const server = { ...productExplanations[0], definition: { vi: 'Nội dung được cập nhật.', en: 'Updated definition.' } };
  assert.equal(mergeExplanationTerms([server]).find(t => t.key === server.key).definition.vi, server.definition.vi);
  const terms = productExplanations.slice(0, 2).map(t => ({ ...t, aliases: ['same phrase'] }));
  assert.equal(matchGlossaryTerm('same phrase', terms), undefined);
});

test('metric keys include input revision, amount, policy, source, raw value, detail and language', () => {
  const source = { kind: 'PREVIEW', input: { expectedProfileRevision: 3, monthlyContribution: '20', policyVersionId: 'p1' } };
  const base = { metricKey: 'fund', source, value: '100', detail: 'SUMMARY', language: 'vi' };
  assert.equal(explanationRequestKey(base), explanationRequestKey({ language: 'vi', detail: 'SUMMARY', value: '100', source, metricKey: 'fund' }));
  const variants = [ { ...base, value: '101' }, { ...base, detail: 'MONTHLY' }, { ...base, language: 'en' }, { ...base, metricKey: 'other' } ];
  for (const patch of [{ expectedProfileRevision: 4 }, { monthlyContribution: '21' }, { policyVersionId: 'p2' }]) variants.push({ ...base, source: { ...source, input: { ...source.input, ...patch } } });
  for (const versionId of ['v1', 'v2']) variants.push({ ...base, source: { kind: 'PLAN_VERSION', planId: 'p1', versionId } });
  const keys = [base, ...variants].map(explanationRequestKey);
  assert.equal(new Set(keys).size, keys.length);
});

test('reopening pending and resolved results shares one request; session caches are separate', async () => {
  const cache = createExplanationCache();
  let resolve, calls = 0;
  const loader = () => { calls++; return new Promise(done => { resolve = done; }); };
  const first = cache.get('same', loader), second = cache.get('same', loader);
  assert.equal(first, second);
  await Promise.resolve();
  assert.equal(calls, 1);
  resolve({ value: '100' }); await first; await cache.get('same', loader);
  assert.equal(calls, 1);
  assert.deepEqual(await createExplanationCache().get('same', async () => ({ value: '200' })), { value: '200' });
});

test('failures, expiry, eviction and invalidation allow fresh requests', async (t) => {
  let now = 100, calls = 0;
  t.mock.method(Date, 'now', () => now);
  const cache = createExplanationCache(2, 1000), load = async () => ++calls;
  await assert.rejects(cache.get('a', async () => { throw new Error('temporary'); }));
  assert.equal(await cache.get('a', load), 1);
  assert.equal(await cache.get('a', load), 1);
  now += 1001;
  assert.equal(await cache.get('a', load), 2);
  await cache.get('b', load); await cache.get('c', load);
  assert.equal(await cache.get('a', load), 5);
  cache.delete('a');
  assert.equal(await cache.get('a', load), 6);
});
