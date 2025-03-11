/// <reference types="vitest" />

import path from "path";

import { defineConfig, type Plugin } from "vite";
import dtsPlugin from "vite-plugin-dts";

import type { ModuleFormat } from "rollup";
import terser from "@rollup/plugin-terser";

const TEST_SITE_FOLDER_PATH: string = path.join(__dirname, "tests/client");

const stopAfterBuildPlugin = (): Plugin => {
    return {
        name: "stop-after-build",
        buildEnd: () => process.exit()
    }
}

const output = (<ModuleFormat[]>["es", "iife"]).map((format) => ({
    format,
    
    entryFileNames: `index${format === "iife" ? "" : ".[format]"}.min.js`,
    name: "APNG",

    plugins: [terser()]
}));

export default defineConfig({
    root: TEST_SITE_FOLDER_PATH,
    resolve: { alias: { "apng-fest": path.join(__dirname, "src") } },

    test: { include: ["../unit/**/*.ts"] },
    build: {
        outDir: path.join(__dirname, "dist"),
        emitAssets: false,

        sourcemap: true,
        rollupOptions: { output, external: path.join(__dirname, "tests"),  },

        lib: { entry: path.join(__dirname, "src/index.ts") }
    },

    plugins: [dtsPlugin({
        root: __dirname,
        tsconfigPath: "tsconfig.lib.json",

        rollupTypes: true
    }), stopAfterBuildPlugin()]
});
