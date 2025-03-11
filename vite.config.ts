/// <reference types="vitest" />

import fs from "fs/promises";
import path from "path";

import { defineConfig } from "vite";
import dtsPlugin from "vite-plugin-dts";

import type { ModuleFormat, OutputOptions  } from "rollup";
import terser from "@rollup/plugin-terser";

const output = <OutputOptions[]>(<ModuleFormat[]>["es", "iife"]).map((format) => ({
    format,
    
    entryFileNames: `index${format === "iife" ? "" : ".[format]"}.min.js`,
    
    name: "AF",
    exports: "named",

    plugins: [terser()]
}));

export default defineConfig({
    root: "tests/client",
    resolve: { alias: { "apng-fest": path.join(__dirname, "src") } },

    test: { include: ["../unit/**/*.ts"] },
    build: {
        outDir: path.join(__dirname, "dist"),
        emitAssets: false,

        emptyOutDir: true,

        sourcemap: true,
        rollupOptions: { output, external: path.join(__dirname, "tests") },

        lib: { entry: path.join(__dirname, "src/index.ts") }
    },

    plugins: [dtsPlugin({
        root: __dirname,
        tsconfigPath: "tsconfig.lib.json",

        rollupTypes: true,
        async afterBuild() {
            const files = await fs.readdir(path.join(__dirname, "tests/client/public"));
            for (const file of files) await fs.unlink(path.join(__dirname, "dist", file));
        }
    })]
});
