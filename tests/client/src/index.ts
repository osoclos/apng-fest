import { APNG } from "apng-fest";
import "./style.css";

const canvas = document.querySelector<HTMLCanvasElement>("#preview")!;
const ctx = canvas.getContext("2d")!;

const test = await APNG.fromURL("test-2.png");
await test.createFrames();

const { width, height } = test;
canvas.width = width;
canvas.height = height;

let frameIdx: number = 0;
setInterval(() => {
    ctx.clearRect(0, 0, width, height);
    ctx.drawImage(test.frames[frameIdx++ % test.frames.length].bitmap, 0, 0);
}, 1000 / 5)