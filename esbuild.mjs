// Bundle the extension into a single self-contained out/extension.js.
// `vscode` is marked external because the host injects it at runtime;
// every other dependency (vscode-languageclient et al) gets inlined,
// which means the published .vsix doesn't need node_modules — fixes
// the "Cannot find module 'vscode-languageclient/node'" activation
// failure that happens when .vscodeignore excludes node_modules.

import { build, context } from "esbuild";

const watch = process.argv.includes("--watch");
const production = process.argv.includes("--production");

const baseConfig = {
    entryPoints: ["src/extension.ts"],
    bundle: true,
    outfile: "out/extension.js",
    external: ["vscode"],
    format: "cjs",
    platform: "node",
    target: "node18",
    sourcemap: !production,
    minify: production,
    logLevel: "info",
};

if (watch) {
    const ctx = await context(baseConfig);
    await ctx.watch();
    console.log("watching…");
} else {
    await build(baseConfig);
}
