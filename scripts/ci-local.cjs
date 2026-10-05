#!/usr/bin/env node

/**
 * An Hưu - Local CI/CD Pipeline Runner
 * Runs the exact verification steps performed by GitHub Actions:
 * - Frontend: Asset validation, Calculator tests, Typecheck, Production Build, Marketing SEO test, Audit
 * - Backend: Prisma Schema validation, Typecheck, Test suite (Vitest), Compilation (tsc), Production Startup test, Production Audit
 */

const { spawnSync } = require('node:child_process');
const path = require('node:path');
const fs = require('node:fs');

const rootDir = path.resolve(__dirname, '..');

const colors = {
  reset: '\x1b[0m',
  bold: '\x1b[1m',
  green: '\x1b[32m',
  red: '\x1b[31m',
  yellow: '\x1b[33m',
  cyan: '\x1b[36m',
  blue: '\x1b[34m',
  dim: '\x1b[2m',
};

function logStep(index, total, name, scope) {
  console.log(`\n${colors.bold}${colors.cyan}[${index}/${total}] ${scope ? `[${scope}] ` : ''}${name}${colors.reset}`);
  console.log(`${colors.dim}${'─'.repeat(64)}${colors.reset}`);
}

function runStep(cmd, args, cwd = rootDir) {
  const isWindows = process.platform === 'win32';
  const executable = isWindows && (cmd === 'npm' || cmd === 'npx') ? `${cmd}.cmd` : cmd;

  const start = Date.now();
  const res = spawnSync(executable, args, {
    cwd,
    stdio: 'inherit',
    env: { ...process.env, FORCE_COLOR: '1' },
    windowsHide: true,
    shell: isWindows,
  });

  const duration = ((Date.now() - start) / 1000).toFixed(2);
  if (res.status !== 0) {
    console.error(`\n${colors.red}${colors.bold}✖ THẤT BẠI sau ${duration}s (mã thoát: ${res.status})${colors.reset}`);
    return false;
  }

  console.log(`${colors.green}✔ THÀNH CÔNG (${duration}s)${colors.reset}`);
  return true;
}

const pipelineSteps = [
  // --- FRONTEND PIPELINE ---
  {
    name: 'Frontend Asset & Calculator Tests',
    scope: 'Frontend',
    cmd: 'npm',
    args: ['--prefix', 'frontend', 'run', 'test:assets'],
  },
  {
    name: 'Frontend TypeScript Typecheck',
    scope: 'Frontend',
    cmd: 'npm',
    args: ['--prefix', 'frontend', 'run', 'typecheck'],
  },
  {
    name: 'Frontend Production Build (Vite + SEO Prerender)',
    scope: 'Frontend',
    cmd: 'npm',
    args: ['--prefix', 'frontend', 'run', 'build'],
  },
  {
    name: 'Frontend Marketing SEO Output Verification',
    scope: 'Frontend',
    cmd: 'node',
    args: ['--test', 'frontend/scripts/marketing-seo.test.mjs'],
  },
  {
    name: 'Frontend Security Audit',
    scope: 'Frontend',
    cmd: 'npm',
    args: ['--prefix', 'frontend', 'audit', '--audit-level=high'],
  },

  // --- BACKEND PIPELINE ---
  {
    name: 'Backend Prisma Schema Validation',
    scope: 'Backend',
    cmd: 'npx',
    args: ['prisma', 'validate'],
    cwd: path.join(rootDir, 'backend'),
  },
  {
    name: 'Backend Source TypeScript Typecheck',
    scope: 'Backend',
    cmd: 'npm',
    args: ['--prefix', 'backend', 'run', 'typecheck'],
  },
  {
    name: 'Backend Test Suite TypeScript Typecheck',
    scope: 'Backend',
    cmd: 'npm',
    args: ['--prefix', 'backend', 'run', 'typecheck:tests'],
  },
  {
    name: 'Backend Unit & Feature Tests (Vitest)',
    scope: 'Backend',
    cmd: 'npm',
    args: ['--prefix', 'backend', 'test'],
  },
  {
    name: 'Backend TypeScript Production Compilation (tsc)',
    scope: 'Backend',
    cmd: 'npx',
    args: ['tsc'],
    cwd: path.join(rootDir, 'backend'),
  },
  {
    name: 'Backend Production Startup Verification',
    scope: 'Backend',
    cmd: 'node',
    args: ['scripts/check-production-startup.cjs'],
    cwd: path.join(rootDir, 'backend'),
  },
  {
    name: 'Backend Production Dependencies Security Audit',
    scope: 'Backend',
    cmd: 'npm',
    args: ['--prefix', 'backend', 'audit', '--audit-level=high', '--omit=dev'],
  },
];

async function main() {
  console.log(`\n${colors.bold}${colors.blue}================================================================${colors.reset}`);
  console.log(`${colors.bold}${colors.blue}           AN HƯU — LOCAL CI/CD PIPELINE RUNNER                 ${colors.reset}`);
  console.log(`${colors.bold}${colors.blue}================================================================${colors.reset}`);
  console.log(`Tổng số bước kiểm tra: ${pipelineSteps.length} bước\n`);

  const totalStart = Date.now();
  let passedCount = 0;

  for (let i = 0; i < pipelineSteps.length; i++) {
    const step = pipelineSteps[i];
    logStep(i + 1, pipelineSteps.length, step.name, step.scope);
    const success = runStep(step.cmd, step.args, step.cwd || rootDir);
    if (!success) {
      console.error(`\n${colors.red}${colors.bold}⛔ CI/CD LOCAL DỪNG LẠI TẠI BƯỚC ${i + 1}: ${step.name}${colors.reset}\n`);
      process.exit(1);
    }
    passedCount++;
  }

  const totalTime = ((Date.now() - totalStart) / 1000).toFixed(2);
  console.log(`\n${colors.bold}${colors.green}================================================================${colors.reset}`);
  console.log(`${colors.bold}${colors.green}  🎉 TẤT CẢ ${passedCount}/${pipelineSteps.length} BƯỚC CI/CD LOCAL ĐÃ VƯỢT QUA XUẤT SẮC! (${totalTime}s)  ${colors.reset}`);
  console.log(`${colors.bold}${colors.green}================================================================${colors.reset}\n`);
}

main();
