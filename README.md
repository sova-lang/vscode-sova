# Sova for VS Code

Language support for [Sova](https://github.com/sova-lang/sova) - a multi-tier language whose backend transpiles to Go and whose frontend transpiles to JavaScript.

## Features

This extension is a thin client for `sova lsp` (the language server built into the `sova` binary). All the actual analysis lives there; this extension wires it up to VS Code.

- **Diagnostics** - compile errors and warnings on every keystroke, sourced from the same pass pipeline `sova build` uses.
- **Hover, go-to-definition, find references, rename** - across the workspace + dependencies materialised under `.sova/deps/`.
- **Document & workspace symbols** - for the Outline pane, breadcrumbs, and `Cmd+T`.
- **Completion** - in-scope names, package members after `.`, struct/enum/interface members, chan methods.
- **Signature help** - while you're typing inside a function call's arguments.
- **Code actions** - `Source: Organize Imports`, plus quick fixes for diagnostics that suggest a known repair.
- **Code lens** - `▶ Run` over `main`, `▶ Run test` over each `test`, and a `N references` count over every top-level declaration.
- **Folding ranges** - collapses functions/types/blocks/imports/comments.
- **Semantic tokens** - richer highlighting than the TextMate grammar can give you.
- **Call hierarchy** - `Show Call Hierarchy` (Shift+Alt+H) to see who calls a function and who it calls.
- **Formatting** - `Format Document` runs `sova fmt` over the buffer.

## Installation

1. Install the `sova` toolchain so the `sova` binary is on your PATH. (Or set `sova.serverPath` in VS Code settings to an absolute path.)
2. Install this extension.
3. Open any `.sova` file.

## Settings

| Setting | Default | Description |
| --- | --- | --- |
| `sova.serverPath` | `"sova"` | Path or PATH-resolvable name of the `sova` binary. The extension invokes `<serverPath> lsp`. |
| `sova.trace.server` | `"off"` | LSP traffic trace level. Set to `"messages"` or `"verbose"` while debugging; output appears in **Output → Sova Language Server**. |

## Commands

| Command | Description |
| --- | --- |
| `Sova: Restart Language Server` | Stops and restarts the LSP child process - useful after updating the `sova` binary. |
| `Sova: Run main()` | Spawns `sova run <file>` in a terminal. Invoked from the `▶ Run` code lens. |
| `Sova: Run Test` | Spawns `sova test <file> --filter <test-name>` in a terminal. Invoked from the `▶ Run test` code lens. |

## Developing

```sh
npm install
npm run compile           # builds out/extension.js
code --extensionDevelopmentPath=$PWD
```

That last command opens a "Extension Development Host" window with this extension active. Open a `.sova` file in it to exercise the integration end-to-end against your local `sova` binary.

To produce a `.vsix` for sharing:

```sh
npx vsce package
```

## Architecture

```
+-----------------+      stdio JSON-RPC      +-------------+
|  VS Code        |  <--------------------> |  sova lsp   |
|  extension      |                          |  (Go)       |
|  (this repo)    |                          |             |
+-----------------+                          +-------------+
        |                                          |
        | spawns                                    | reads/writes
        v                                          v
   subprocess                                   files on disk +
                                                .sova/deps/ via the
                                                pkgmgr resolver
```

Everything language-aware happens in the LSP. The extension's job is to spawn it, route notifications, and let VS Code render the results.
