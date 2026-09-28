'use strict';

const vscode = require('vscode');
const path = require('node:path');
const fs = require('node:fs/promises');
const { LanguageClient } = require('vscode-languageclient/node');

const clients = new Map();
const starting = new Map();
let stopping = false;

function within(root, file) {
  const relative = path.relative(root, file);
  return relative === '' || (!relative.startsWith(`..${path.sep}`) && relative !== '..' && !path.isAbsolute(relative));
}

async function rootFor(document, standardLibraryRoot) {
  if (standardLibraryRoot && within(standardLibraryRoot, document.uri.fsPath)) return standardLibraryRoot;
  let directory = path.dirname(document.uri.fsPath);
  const folder = vscode.workspace.getWorkspaceFolder(document.uri);
  for (;;) {
    try {
      if ((await fs.stat(path.join(directory, 'main.srx'))).isFile()) return directory;
    } catch (error) {
      if (error.code !== 'ENOENT' && error.code !== 'ENOTDIR') throw error;
    }
    if (folder && directory === folder.uri.fsPath) return directory;
    const parent = path.dirname(directory);
    if (parent === directory) return path.dirname(document.uri.fsPath);
    directory = parent;
  }
}

function hints(configuration) {
  return {
    types: configuration.get('inlayHints.types', true),
    parameters: configuration.get('inlayHints.parameters', true),
    ownership: configuration.get('inlayHints.ownership', false),
  };
}

async function startFor(document, context) {
  if (stopping || document.languageId !== 'syrox' || document.uri.scheme !== 'file') return;
  const configuration = vscode.workspace.getConfiguration('syrox', document.uri);
  const std = configuration.get('standardLibraryRoot', '');
  const root = await rootFor(document, std);
  if (stopping || clients.has(root)) return;
  if (starting.has(root)) return starting.get(root);
  const start = (async () => {
    const watcher = vscode.workspace.createFileSystemWatcher(new vscode.RelativePattern(root, '**/*.{srx,lock}'));
    const client = new LanguageClient('syrox', `Syrox (${path.basename(root)})`, {
      command: configuration.get('serverPath', 'srx'),
      args: ['lsp', root],
    }, {
      documentSelector: [
        { language: 'syrox', scheme: 'file', pattern: new vscode.RelativePattern(root, '**/*.srx') },
        { language: 'syrox', scheme: 'syrox-source' },
      ],
      workspaceFolder: { uri: vscode.Uri.file(root), name: path.basename(root), index: 0 },
      initializationOptions: {
        workspaceMode: std && path.resolve(root) === path.resolve(std) ? 'standard-library' : 'project',
        inlayHints: hints(configuration),
      },
      synchronize: { configurationSection: 'syrox', fileEvents: watcher },
    });
    try {
      await client.start();
      if (stopping) { await client.stop(); watcher.dispose(); return; }
      clients.set(root, client);
      context.subscriptions.push(watcher);
    } catch (error) {
      watcher.dispose();
      await client.dispose();
      throw error;
    }
  })();
  starting.set(root, start);
  try { await start; } finally { starting.delete(root); }
}

function activate(context) {
  context.subscriptions.push(vscode.workspace.registerTextDocumentContentProvider('syrox-source', {
    async provideTextDocumentContent(uri, cancellation) {
      for (const client of clients.values()) {
        if (cancellation.isCancellationRequested) return '';
        try {
          const source = await client.sendRequest('syrox/readSource', { uri: uri.toString() }, cancellation);
          if (source && typeof source.text === 'string') return source.text;
        } catch (error) {
          if (cancellation.isCancellationRequested) return '';
        }
      }
      throw new Error('Syrox source expired or its server stopped. Repeat Go to Definition from the project document.');
    },
  }));
  const open = document => startFor(document, context).catch(error => {
    vscode.window.showErrorMessage(`Syrox: ${error.message}`);
  });
  context.subscriptions.push(vscode.workspace.onDidOpenTextDocument(open));
  for (const document of vscode.workspace.textDocuments) void open(document);
}

async function deactivate() {
  stopping = true;
  await Promise.allSettled(starting.values());
  await Promise.allSettled([...clients.values()].map(client => client.stop()));
  clients.clear();
}

module.exports = { activate, deactivate };
