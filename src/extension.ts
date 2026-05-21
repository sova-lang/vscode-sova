// Sova VS Code extension entry point.
//
// Spawns `sova lsp` as a child process and wires it up to the editor through
// `vscode-languageclient/node`. Re-exposes the LSP code-lens commands
// (`sova.runMain`, `sova.runTest`) as VS Code commands so clicking a code
// lens above a function or test actually runs something instead of being a
// dead pixel.

import * as path from "path";
import {
    workspace,
    window,
    commands,
    Disposable,
    ExtensionContext,
    OutputChannel,
    Uri,
} from "vscode";
import {
    LanguageClient,
    LanguageClientOptions,
    RevealOutputChannelOn,
    ServerOptions,
    TransportKind,
} from "vscode-languageclient/node";

let client: LanguageClient | undefined;
let outputChannel: OutputChannel | undefined;

// activate is VS Code's entry hook - called the first time a `.sova` file is opened. We construct the language client, start it, and register the run-main / run-test commands. The client stays alive for the rest of the session; deactivate() shuts it down cleanly.
export async function activate(context: ExtensionContext): Promise<void> {
    outputChannel = window.createOutputChannel("Sova Language Server");
    context.subscriptions.push(outputChannel);
    outputChannel.appendLine(`[sova] activate at ${new Date().toISOString()}`);

    const serverPath = resolveServerPath();
    outputChannel.appendLine(`[sova] server command: ${serverPath} lsp`);

    const serverOptions: ServerOptions = {
        run: { command: serverPath, args: ["lsp"], transport: TransportKind.stdio },
        debug: { command: serverPath, args: ["lsp"], transport: TransportKind.stdio },
    };

    const traceSetting = workspace.getConfiguration("sova").get<string>("trace.server", "off");
    const clientOptions: LanguageClientOptions = {
        documentSelector: [
            { scheme: "file", language: "sova" },
            { scheme: "untitled", language: "sova" },
        ],
        synchronize: {
            fileEvents: workspace.createFileSystemWatcher("**/*.sova"),
            configurationSection: "sova",
        },
        outputChannel,
        revealOutputChannelOn: RevealOutputChannelOn.Error,
        initializationOptions: { trace: traceSetting },
    };

    client = new LanguageClient("sova", "Sova Language Server", serverOptions, clientOptions);

    context.subscriptions.push(...registerCommands(serverPath));

    try {
        await client.start();
        outputChannel.appendLine("[sova] language server started");
    } catch (err) {
        const msg = String(err && (err as Error).message ? (err as Error).message : err);
        outputChannel.appendLine(`[sova] failed to start language server: ${msg}`);
        outputChannel.show(true);
        window.showErrorMessage(
            `Sova: failed to start language server (${serverPath} lsp). ` +
                "Check the 'sova.serverPath' setting and confirm the binary is on PATH. " +
                "See Output → Sova Language Server for details.",
        );
    }
}

// deactivate gracefully stops the client so the language server gets a clean shutdown + exit. Returning the stop promise lets VS Code wait on it during window close.
export function deactivate(): Thenable<void> | undefined {
    if (!client) {
        return undefined;
    }
    return client.stop();
}

// resolveServerPath picks the `sova` binary to spawn. The `sova.serverPath` setting wins when set; otherwise we fall back to the bare command name and rely on PATH resolution. Either way the actual subprocess invocation is `<path> lsp`.
function resolveServerPath(): string {
    const configured = workspace.getConfiguration("sova").get<string>("serverPath");
    if (configured && configured.trim() !== "") {
        return configured;
    }
    return "sova";
}

// registerCommands wires the code-lens commands the LSP emits (`sova.runMain`, `sova.runTest`) plus an explicit "restart server" command users may need when sova was updated mid-session. Returns Disposables the activate() caller pushes into context.subscriptions.
function registerCommands(serverPath: string): Disposable[] {
    return [
        commands.registerCommand("sova.restartServer", async () => {
            if (!client) {
                return;
            }
            await client.stop();
            await client.start();
            window.showInformationMessage("Sova: language server restarted");
        }),

        commands.registerCommand("sova.runMain", async (uriString: string) => {
            const target = parseUriArg(uriString);
            if (!target) {
                window.showWarningMessage("Sova: runMain invoked without a target URI");
                return;
            }
            await runSova(serverPath, ["run", target.fsPath], target);
        }),

        commands.registerCommand("sova.runTest", async (uriString: string, testName: string) => {
            const target = parseUriArg(uriString);
            if (!target) {
                window.showWarningMessage("Sova: runTest invoked without a target URI");
                return;
            }
            const args = ["test", target.fsPath];
            if (testName) {
                args.push("--filter", testName);
            }
            await runSova(serverPath, args, target);
        }),
    ];
}

// parseUriArg converts the LSP-emitted `string` (a `file://` URI) into a VS Code Uri. Returns undefined on malformed input so the caller can decline to spawn anything.
function parseUriArg(raw: string | undefined): Uri | undefined {
    if (!raw) {
        return undefined;
    }
    try {
        return Uri.parse(raw);
    } catch {
        return undefined;
    }
}

// runSova spawns the binary in a VS Code integrated terminal so the user sees the build/run output and can interact with it (e.g. Ctrl+C). The terminal's CWD is the workspace root of `target`, or the file's directory when there's no workspace.
async function runSova(serverPath: string, args: string[], target: Uri): Promise<void> {
    const folder = workspace.getWorkspaceFolder(target);
    const cwd = folder ? folder.uri.fsPath : path.dirname(target.fsPath);
    const terminal = window.createTerminal({
        name: "Sova",
        cwd,
    });
    terminal.show(true);
    terminal.sendText(`${quoteArg(serverPath)} ${args.map(quoteArg).join(" ")}`);
}

// quoteArg wraps an argument in double quotes when it contains whitespace; otherwise returns it verbatim. The terminal we spawn into runs through a shell, so we have to opt-in to quoting.
function quoteArg(arg: string): string {
    if (/\s/.test(arg)) {
        return `"${arg.replace(/"/g, '\\"')}"`;
    }
    return arg;
}
