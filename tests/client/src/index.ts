import { APNG } from "apng-fest";
import "./style.css";

const test = await APNG.from("test.png");
await test.createFrames();

for (const frame of test.frames) {
    const url = URL.createObjectURL(frame);

    const image = await new Promise<HTMLImageElement>((res, rej) => {
        const image = new Image();
        image.src = url;

        image.addEventListener("load", () => res(image));
        image.addEventListener("error", (err) => rej(`Unable to load image from "${url}". Reason: ${err.error}`));
    });

    document.body.appendChild(image);
}