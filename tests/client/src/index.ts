import { APNG, Frame } from "apng-fest";
import "./style.css";

const RADIUS: number = 20;

const RECT_WIDTH: number = 60;
const RECT_HEIGHT: number = 60;

const WIDTH: number = 180 + 2 * RADIUS;
const HEIGHT: number = 120;

const FPS: number = 60;

const apng = await APNG.create(WIDTH, HEIGHT);

let hasStarted: boolean = false;

const startButton = document.querySelector<HTMLButtonElement>("#start")!;
startButton.addEventListener("click", startDemo);

const encoderRenderCheckbox = document.querySelector<HTMLInputElement>("#encode-render")!;

function startDemo() {
    if (hasStarted) return;
    hasStarted = true;

    const canvas = document.createElement("canvas");
    canvas.id = "demo";
    
    canvas.width = WIDTH;
    canvas.height = HEIGHT;
    
    const ctx = canvas.getContext("2d", { willReadFrequently: true })!;

    const text = document.createElement("p");
    text.innerText = "Rendering...";
    
    document.body.appendChild(canvas);
    document.body.appendChild(text);
    
    let x: number = RADIUS;
    let y: number = HEIGHT / 2;
    
    let speedX: number = 1;
    
    let hue: number = 0;
    let angle: number = 0;

    apng.reset();
    if (encoderRenderCheckbox.checked) apng.writeHeader();
    
    const intervalId = setInterval(async () => {
        ctx.clearRect(0, 0, WIDTH, HEIGHT);
    
        ctx.save();
    
        ctx.translate(x, y);
        ctx.rotate(angle);
    
        ctx.fillStyle = "black";
        ctx.fillRect(-RECT_WIDTH / 2, -RECT_HEIGHT / 2, RECT_WIDTH, RECT_HEIGHT);
    
        ctx.restore();
    
        ctx.beginPath();
        ctx.arc(x, y, RADIUS, 0, Math.PI * 2);
        ctx.closePath();
    
        ctx.fillStyle = `hsl(${hue} 100% 50%)`;
        ctx.fill();
    
        const frame = Frame.fromCtx(ctx, { delay: 1 / FPS });
        encoderRenderCheckbox.checked ? apng.writeFrame(frame) : apng.frames.push(frame);
    
        x += speedX;
        if (x > WIDTH - RADIUS) speedX *= -1;
    
        hue++;
        angle += Math.PI / 180;
    
        if (x > RADIUS) return;
        clearInterval(intervalId);

        const start = performance.now();
        text.innerText = "Generating...";

        let image: HTMLImageElement;
        if (encoderRenderCheckbox.checked) {
            const buffer = apng.writeFooter();

            const blob = new Blob([buffer], { type: "image/png" });
            const url = URL.createObjectURL(blob);

            image = await new Promise<HTMLImageElement>((res, rej) => {
                const image = new Image();
                image.src = url;

                image.addEventListener("load", () => res(image));
                image.addEventListener("error", () => rej("1: Unexpectedly encountered an error while creating image."));
            });
        } else image = await apng.toImg();

        document.body.appendChild(image);

        const end = performance.now();
        text.innerText = `Done! Took ${Math.floor((end - start) * 100) / 100}ms`;
    }, 1000 / FPS);
}