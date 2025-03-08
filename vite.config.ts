/// <reference types="vitest" />

import path from "path";

import { defineConfig } from "vite";
import dtsPlugin from "vite-plugin-dts";

import type { ModuleFormat } from "rollup";
import terser from "@rollup/plugin-terser";

const output = (<ModuleFormat[]>["es", "iife"]).map((format) => ({
    format,
    
    entryFileNames: `index${format === "iife" ? "" : ".[format]"}.min.js`,
    name: "APNG",

    plugins: [terser()]
}));

export default defineConfig({
    root: "tests/client",
    resolve: { alias: { "apng-fest": path.join(__dirname, "src") } },

    test: { include: ["../unit/**/*.ts"] },
    build: {
        outDir: path.join(__dirname, "dist"),

        sourcemap: true,
        rollupOptions: { output },

        lib: { entry: path.join(__dirname, "src/index.ts") }
    },

    plugins: [dtsPlugin({
        root: __dirname,
        tsconfigPath: "tsconfig.lib.json",

        rollupTypes: true
    })]
});
