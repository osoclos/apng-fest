const canvas = new OffscreenCanvas(1, 1);

const ctx = canvas.getContext("2d", { willReadFrequently: true })!;
if (!ctx) throw new Error("Canvas 2D API is not supported on this browser.");

export { canvas, ctx };