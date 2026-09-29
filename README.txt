Syrox for VS Code

Source: https://github.com/ryro-hq/syrox-vscode
Language server: https://github.com/ryro-hq/syrox

The extension starts the shared Rust server, srx lsp, over stdio. Install srx in
the extension host environment or configure syrox.serverPath. For WSL/SSH use
VS Code Remote so that the Linux server and project run in that environment.

Development: run npm ci in this directory, then start VS Code with
  code --extensionDevelopmentPath=/absolute/path/to/syrox-vscode PROJECT

Checks: npm ci --ignore-scripts, npm run check, npm run package.
The tests exercise activation, project-root selection, virtual sources and
server startup failure with a simulated VS Code host. Packaging creates
syrox.vsix; neither check starts the real Syrox language server.
The client requires an external server implementing srx lsp. Both are pre-release.
The client repository and its releases are independent of the Rust server.

Set syrox.standardLibraryRoot to the absolute std directory when editing the
standard library itself. Ordinary consumers use the server's bundled std.

Types, ownership diagnostics, completion, semantic colors, navigation and hints
come from srx. Lexical highlighting is available before project analysis finishes.
The syrox.inlayHints.types/parameters/ownership settings control hint categories.
Virtual standard-library sources use syrox-source URIs, are read-only and expire
when the server advances to a new analysis generation. Repeat navigation to obtain
a fresh source. Changing server path/root settings requires restarting the client.

No server binary is downloaded or bundled by this extension.
