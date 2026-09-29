'use strict';

const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const { mkdtemp, mkdir, rm, writeFile } = require('node:fs/promises');
const { tmpdir } = require('node:os');
const path = require('node:path');
const { test } = require('node:test');
const vm = require('node:vm');

function host(root, options = {}) {
  const clients = [];
  const watchers = [];
  const errors = [];
  let opened;
  let provider;
  const vscode = {
    Uri: { file: fsPath => ({ fsPath }) },
    RelativePattern: class { constructor(base, pattern) { this.base = base; this.pattern = pattern; } },
    workspace: {
      textDocuments: [],
      getWorkspaceFolder: () => ({ uri: { fsPath: root } }),
      getConfiguration: () => ({ get: (key, fallback) => options[key] ?? fallback }),
      createFileSystemWatcher: pattern => {
        const watcher = { pattern, disposed: false, dispose() { this.disposed = true; } };
        watchers.push(watcher);
        return watcher;
      },
      registerTextDocumentContentProvider: (_scheme, handler) => {
        provider = handler;
        return { dispose() {} };
      },
      onDidOpenTextDocument: handler => { opened = handler; return { dispose() {} }; },
    },
    window: { showErrorMessage: message => errors.push(message) },
  };
  class LanguageClient {
    constructor(id, label, server, config) {
      Object.assign(this, { id, label, server, config, stopped: false });
      clients.push(this);
    }
    async start() { if (options.failStart) throw new Error('could not start'); }
    async stop() { this.stopped = true; }
    async dispose() { this.stopped = true; }
    async sendRequest(method, input) {
      assert.equal(method, 'syrox/readSource');
      assert.equal(input.uri, 'syrox-source:fixture');
      return { text: 'value Fixture(int)' };
    }
  }
  const module = { exports: {} };
  vm.runInNewContext(readFileSync(path.join(__dirname, 'extension.js'), 'utf8'), {
    module,
    require: id => id === 'vscode' ? vscode
      : id === 'vscode-languageclient/node' ? { LanguageClient }
      : require(id),
  }, { filename: 'extension.js' });
  return {
    extension: module.exports, clients, watchers, errors,
    open: document => opened(document),
    source: () => provider,
  };
}

test('activates once per project, routes virtual sources and stops the client', async t => {
  const root = await mkdtemp(path.join(tmpdir(), 'syrox-vscode-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  await mkdir(path.join(root, 'nested'));
  await writeFile(path.join(root, 'main.srx'), 'fn run() {}');
  const current = host(root);
  const context = { subscriptions: [] };
  current.extension.activate(context);
  const document = { languageId: 'syrox', uri: { scheme: 'file', fsPath: path.join(root, 'nested', 'other.srx') } };
  await current.open(document);
  await current.open(document);
  assert.equal(current.clients.length, 1);
  assert.equal(current.clients[0].server.command, 'srx');
  assert.deepEqual(Array.from(current.clients[0].server.args), ['lsp', root]);
  assert.equal(current.clients[0].config.initializationOptions.workspaceMode, 'project');
  assert.equal(current.watchers[0].pattern.base, root);
  assert.equal(await current.source().provideTextDocumentContent({ toString: () => 'syrox-source:fixture' }, {
    isCancellationRequested: false,
  }), 'value Fixture(int)');
  await current.extension.deactivate();
  assert.equal(current.clients[0].stopped, true);
  assert.equal(current.errors.length, 0);
});

test('failed server start reports the error and disposes its watcher', async t => {
  const root = await mkdtemp(path.join(tmpdir(), 'syrox-vscode-failure-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  await writeFile(path.join(root, 'main.srx'), 'fn run() {}');
  const current = host(root, { failStart: true });
  current.extension.activate({ subscriptions: [] });
  await current.open({ languageId: 'syrox', uri: { scheme: 'file', fsPath: path.join(root, 'main.srx') } });
  assert.deepEqual(current.errors, ['Syrox: could not start']);
  assert.equal(current.watchers[0].disposed, true);
  assert.equal(current.clients[0].stopped, true);
});
