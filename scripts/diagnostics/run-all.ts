#!/usr/bin/env node
/**
 * Run All Diagnostics
 *
 * Purpose:
 * Execute all diagnostic scripts in sequence.
 *
 * Usage:
 *   npm run diagnostic:all
 */

import { spawn } from 'child_process';
import { promisify } from 'util';

// Use spawn for better output handling
function runCommand(command: string, args: string[]): Promise<{ success: boolean }> {
  return new Promise((resolve) => {
    const child = spawn(command, args, {
      stdio: 'inherit',
      shell: true,
      env: process.env,
    });

    child.on('close', (code) => {
      resolve({ success: code === 0 });
    });

    child.on('error', () => {
      resolve({ success: false });
    });
  });
}

const diagnostics = [
  { name: 'API Connections', script: 'diagnostic:apis' },
  { name: 'Validations', script: 'diagnostic:validations' },
  { name: 'GPT Prompt', script: 'diagnostic:gpt-prompt' },
  { name: 'Error Handling', script: 'diagnostic:errors' },
];

async function runDiagnostic(name: string, script: string): Promise<boolean> {
  console.log(`\n${'='.repeat(60)}`);
  console.log(`Running: ${name}`);
  console.log('='.repeat(60));
  console.log('');

  const result = await runCommand('npm', ['run', script]);
  return result.success;
}

async function main(): Promise<void> {
  console.log('═══════════════════════════════════════════════════════════');
  console.log('🔬 RUNNING ALL DIAGNOSTICS');
  console.log('═══════════════════════════════════════════════════════════');
  console.log('');
  console.log('This will run all diagnostic scripts in sequence.');
  console.log('Note: Some diagnostics require valid API credentials.');
  console.log('');

  const results: Array<{ name: string; passed: boolean }> = [];

  for (const diagnostic of diagnostics) {
    const passed = await runDiagnostic(diagnostic.name, diagnostic.script);
    results.push({ name: diagnostic.name, passed });
  }

  // Final summary
  console.log('\n');
  console.log('═══════════════════════════════════════════════════════════');
  console.log('📊 FINAL SUMMARY');
  console.log('═══════════════════════════════════════════════════════════');
  console.log('');

  results.forEach((result) => {
    console.log(`${result.passed ? '✓' : '✗'} ${result.name}`);
  });

  console.log('');
  const passedCount = results.filter((r) => r.passed).length;
  console.log(`Results: ${passedCount}/${results.length} diagnostics passed`);

  if (passedCount === results.length) {
    console.log('\n✅ All diagnostics passed');
    process.exit(0);
  } else {
    console.log('\n⚠️  Some diagnostics failed - review output above');
    process.exit(1);
  }
}

main().catch((err) => {
  console.error('Fatal error:', err);
  process.exit(1);
});
