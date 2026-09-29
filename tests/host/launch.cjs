'use strict';

const assert = require('node:assert/strict');
const { mkdtemp, rm, writeFile } = require('node:fs/promises');
const { tmpdir } = require('node:os');
const path = require('node:path');
const { runTests } = require('@vscode/test-electron');

async function main() {
  assert(process.env.SRX_BIN, 'SRX_BIN must point to the pinned Syrox server');
  const project = await mkdtemp(path.join(tmpdir(), 'syrox-extension-host-'));
  try {
    await writeFile(path.join(project, 'main.srx'), 'fn example() -> std::PackageId { }\n');
    await runTests({
      vscodeVersion: '1.90.2',
      extensionDevelopmentPath: path.resolve(__dirname, '../..'),
      extensionTestsPath: path.join(__dirname, 'suite.cjs'),
      launchArgs: [project, '--no-sandbox', '--disable-gpu', '--skip-welcome', '--skip-release-notes'],
    });
  } finally {
    await rm(project, { recursive: true, force: true });
  }
}

main().catch(error => { console.error(error); process.exitCode = 1; });
