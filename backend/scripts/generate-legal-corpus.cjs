// Offline draft builder. No database, credentials, network, or publication actions.
const fs = require('node:fs');
const path = require('node:path');
const { createHash } = require('node:crypto');
const root = path.resolve(__dirname, '../seed-data/legal-2026');
const sha256 = bytes => createHash('sha256').update(bytes).digest('hex');
const encode = value => JSON.stringify(value, null, 2) + '\n';

function verifySources(directory = root) {
  const manifest = JSON.parse(fs.readFileSync(path.join(directory, 'sources.json'), 'utf8'));
  const ids = new Set();
  for (const source of manifest.sources) {
    if (ids.has(source.id) || !/^[A-Z0-9]+\.(pdf|html\.txt)$/.test(source.file)) throw Error('Invalid source identity');
    ids.add(source.id);
    const bytes = fs.readFileSync(path.join(directory, 'sources', source.file));
    if (bytes.length !== source.bytes || sha256(bytes) !== source.sha256) throw Error('Source integrity failed: ' + source.id);
  }
  return manifest;
}

// Independently transcribed cohort blocks: ND135 Annex I, PDF pages 7–10.
// Do not import normalCohortAge: these tables must be checked against the engine.
const cohorts = {
  MALE: [['1961-01',723],['1961-10',726],['1962-07',729],['1963-04',732],['1964-01',735],['1964-10',738],['1965-07',741],['1966-04',744]],
  FEMALE: [['1966-01',664],['1966-09',668],['1967-05',672],['1968-01',676],['1968-09',680],['1969-05',684],['1970-01',688],['1970-09',692],['1971-05',696],['1972-01',700],['1972-09',704],['1973-05',708],['1974-01',712],['1974-09',716],['1975-05',720]],
};
// CV340/BHXH-CSXH signed pages 1–2, wage column (not voluntary income).
const factors = ['5.81','4.91','4.65','4.50','4.18','4.01','4.07','4.09','3.94','3.81','3.54','3.27','3.05','2.81','2.29','2.14','1.96','1.65','1.51','1.42','1.36','1.36','1.32','1.28','1.23','1.20','1.16','1.14','1.11','1.07','1.03','1.00','1.00'];
function buildDrafts(directory = root) {
  const manifest = verifySources(directory), sources = Object.fromEntries(manifest.sources.map(s => [s.id, s]));
  const citation = (id, sourceId, instrument, locator, effectiveFrom, effectiveTo = null) => {
    const source = sources[sourceId];
    if (!source) throw Error('Missing source ' + sourceId);
    return { id, instrument, locator, url: source.url, contentHash: source.sha256, effectiveFrom, effectiveTo };
  };
  const citations = [
    ...[5,31,64,66,68,69,72,73].map(article => citation('LAW_ART' + article, 'R02', 'Luật BHXH 41/2024/QH15, bản hợp nhất Công báo 133/2026', 'Điều ' + article + '; phạm vi hưu trí thông thường', '2025-07-01')),
    citation('LAW_ART140_13', 'R02', 'Luật BHXH 41/2024/QH15, bản hợp nhất Công báo 133/2026', 'Điều 140 khoản 13: mức tham chiếu', '2025-07-01'),
    citation('ND135_ANNEX_I', 'AGE', 'Nghị định 135/2020/NĐ-CP', 'Phụ lục I; PDF trang 7–10; tuổi theo tháng sinh', '2021-01-01'),
    ...[12,13,15,16].map(article => citation('ND158_ART' + article, 'R03', 'Nghị định 158/2025/NĐ-CP', 'Điều ' + article + '; bản toàn văn trên Cổng TTĐT Chính phủ', '2025-07-01')),
    citation('TT12_ART14', 'R05', 'Thông tư 12/2025/TT-BNV', 'Điều 14: trợ cấp một lần khi nghỉ hưu', '2025-07-01'),
    citation('TT12_ART15_16', 'R05', 'Thông tư 12/2025/TT-BNV', 'Điều 15–16: thời điểm hưởng và bình quân tiền lương', '2025-07-01'),
    citation('CV340_2026', 'FACTORS2026', 'Công văn 340/BHXH-CSXH ngày 03/02/2026', 'PDF trang 1–2, cột hệ số điều chỉnh tiền lương; năm hưởng 2026', '2026-01-01', '2027-01-01'),
    citation('ND73_ART3', 'BASE2024', 'Nghị định 73/2024/NĐ-CP', 'Điều 3 khoản 2; PDF trang 3', '2024-07-01', '2026-07-01'),
    citation('ND161_ART3', 'BASE2026', 'Nghị định 161/2026/NĐ-CP', 'Điều 3 khoản 2; PDF trang 3', '2026-07-01'),
  ];
  const table = (kind, key, value, citationId, effectiveFrom = '2026-01-01', effectiveTo = '2027-01-01') => ({ kind, key, value, citationId, effectiveFrom, effectiveTo });
  const tables = [];
  for (const [sex, blocks] of Object.entries(cohorts)) {
    for (let year = Number(blocks[0][0].slice(0,4)); year <= 2008; year++) {
      for (let month = 1; month <= 12; month++) {
        const birth = `${year}-${String(month).padStart(2,'0')}`;
        const block = blocks.filter(([start]) => start <= birth).at(-1);
        tables.push(table('AGE_MONTHS', `NORMAL:${sex}:${birth}`, String(block[1]), 'ND135_ANNEX_I'));
      }
    }
  }
  factors.forEach((value, i) => tables.push(table('WAGE_FACTOR', `2026:${i === 0 ? 'PRE_1995' : 1994 + i}`, value, 'CV340_2026')));
  tables.push(table('REFERENCE_AMOUNT', 'GENERAL', '2340000', 'ND73_ART3', '2026-01-01', '2026-07-01'),
    table('REFERENCE_AMOUNT', 'GENERAL', '2530000', 'ND161_ART3', '2026-07-01', '2027-01-01'));
  const requiredTableKeys = [...new Set(tables.filter(t => t.kind !== 'AGE_MONTHS').map(t => `${t.kind}:${t.key}`))];
  return [
    ['bh1-employer.draft.json','VN_BH1_EMPLOYER_2026','vn-pension-benefit-v2','BH1_COMPULSORY_EMPLOYER_NORMAL','vn-bh1-employer-2025-v2'],
    ['bh2-state-mixed.draft.json','VN_BH2_STATE_MIXED_2026','vn-pension-state-v1','BH2_COMPULSORY_STATE_MIXED_NORMAL','vn-bh2-state-mixed-2025-v1'],
  ].map(([file, code, engineCode, branch, strategyCode]) => ({ file, draft: {
    code, effectiveFrom: '2026-01-01', effectiveTo: '2027-01-01', supersedesId: null,
    document: { schemaVersion: 1, engineCode, coverage: [{ branch, strategyCode, citationIds: citations.map(c => c.id), requiredTableKeys }], citations, tables },
  } }));
}
function run(check) {
  for (const { file, draft } of buildDrafts()) {
    const target = path.join(root, file), bytes = encode(draft);
    if (check) {
      if (fs.readFileSync(target, 'utf8') !== bytes) throw Error('Draft is stale: ' + file);
    } else fs.writeFileSync(target, bytes);
    process.stdout.write(`${check ? 'CHECKED' : 'GENERATED'} ${file} ${draft.document.tables.length} rows\n`);
  }
}
module.exports = { buildDrafts, verifySources };
if (require.main === module) {
  if (process.argv.slice(2).some(a => a !== '--check')) throw Error('Usage: generate-legal-corpus.cjs [--check]');
  run(process.argv.includes('--check'));
}
