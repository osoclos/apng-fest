import { APNG, Frame } from "apng-fest";
import "./style.css";

const test = await APNG.fromURL("generated.png");
await test.createFrames();

const apng = await APNG.create(100, 100);

const canvas = document.querySelector<HTMLCanvasElement>("#preview")!;
canvas.width = 100;
canvas.height = 100;

const ctx = canvas.getContext("2d", { willReadFrequently: true })!;

let hue: number = 0;

requestAnimationFrame(render);
async function render() {
    ctx.fillStyle = `hsl(${hue} 100% 50%)`;
    ctx.fillRect(0, 0, 100, 100);

    const frame = Frame.fromCtx(ctx, { delay: 1 / 60 });
    apng.frames.push(frame);

    hue++;
    if (hue < 360) {
        requestAnimationFrame(render);
        return;
    }

    const image = await apng.toImg();
    document.body.appendChild(image);
}