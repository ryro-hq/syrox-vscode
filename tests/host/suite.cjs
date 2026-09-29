'use strict';

const assert = require('node:assert/strict');
const path = require('node:path');
const vscode = require('vscode');

async function run() {
  const project = vscode.workspace.workspaceFolders?.[0];
  assert(project, 'test project was not opened');
  await vscode.workspace.getConfiguration('syrox').update('serverPath', process.env.SRX_BIN, vscode.ConfigurationTarget.Global);
  const uri = vscode.Uri.file(path.join(project.uri.fsPath, 'main.srx'));
  const document = await vscode.workspace.openTextDocument(uri);
  assert.equal(document.languageId, 'syrox');
  await vscode.window.showTextDocument(document);
  const extension = vscode.extensions.getExtension('ryro-hq.syrox');
  assert(extension, 'Syrox extension installed in the Extension Host');
  await extension.activate();

  const deadline = Date.now() + 15000;
  let diagnostics = [];
  while (Date.now() < deadline) {
    diagnostics = vscode.languages.getDiagnostics(uri);
    if (diagnostics.some(item => item.source === 'syrox' && item.message.length)) break;
    await new Promise(resolve => setTimeout(resolve, 100));
  }
  assert(diagnostics.some(item => item.source === 'syrox'), `no server diagnostics: ${JSON.stringify(diagnostics)}`);
  const symbols = await vscode.commands.executeCommand('vscode.executeDocumentSymbolProvider', uri);
  assert(symbols?.some(item => item.name === 'example'), `no server symbols: ${JSON.stringify(symbols)}`);
}

module.exports = { run };
