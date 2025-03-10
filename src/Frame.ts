import { Base64 } from "./utils";

const canvas = new OffscreenCanvas(1, 1);
const ctx = canvas.getContext("2d", { willReadFrequently: true })!;

let bitmapHistory: ImageBitmap[] = [canvas.transferToImageBitmap()];

export class Frame {
    bitmap: ImageBitmap;
    delay: number;

    constructor(image: HTMLImageElement, options: Partial<FrameOptions> = {}, canvasOptions: Partial<FrameCanvasOptions> = {}) {
        if (!image.complete) throw new Error("Image has not been fully loaded yet.");
        const { naturalWidth, naturalHeight } = image;

        const {
            width = naturalWidth,
            height = naturalHeight,

            top = 0,
            left = 0,

            delay = 0,
            
            disposeOperation = FrameDisposeOperation.None,
            blendOperation = FrameBlendOperation.Overwrite
        } = options;

        const {
            imageWidth = width,
            imageHeight = height,

            clearBitmapHistory = false,
            backgroundColor: [
                r = 0x00,
                g = 0x00,
                b = 0x00,
                a = 0x00
            ] = new Uint8Array(4).fill(0x00),
        } = canvasOptions;

        canvas.width = imageWidth;
        canvas.height = imageHeight;

        switch (disposeOperation) {
            case FrameDisposeOperation.None: {
                const [bitmap] = bitmapHistory;
                ctx.drawImage(bitmap, 0, 0);

                break;
            }

            case FrameDisposeOperation.ToBackground: {
                ctx.fillStyle = `rgb(${r} ${g} ${b} / ${a / 0xff})`;
                ctx.fillRect(0, 0, imageWidth, imageHeight);

                break;
            }

            case FrameDisposeOperation.ToPrevious: {
                const [bitmap] = bitmapHistory.slice(-1);
                ctx.drawImage(bitmap, 0, 0);

                break;
            }
        }

        switch (blendOperation) {
            case FrameBlendOperation.Overwrite: {
                ctx.clearRect(left, top, width, height);
                break;
            }

            case FrameBlendOperation.Blend: break;
        }

        ctx.drawImage(image, 0, 0, width, height, left, top, width, height);
        
        this.bitmap = canvas.transferToImageBitmap();
        this.delay = delay;

        if (clearBitmapHistory) bitmapHistory = [];

        bitmapHistory.pop();
        bitmapHistory.unshift(this.bitmap);
    }

    static async fromBlob(blob: Blob, options?: Partial<FrameOptions>, canvasOptions?: Partial<FrameCanvasOptions>) {
        return this.fromURL(URL.createObjectURL(blob), options, canvasOptions);
    }

    static fromBuffer(buffer: ArrayBufferView, options?: Partial<FrameOptions>, canvasOptions?: Partial<FrameCanvasOptions>) {
        return this.fromRawBuffer(buffer.buffer, options, canvasOptions);
    }

    static fromRawBuffer(buffer: ArrayBufferLike, options?: Partial<FrameOptions>, canvasOptions?: Partial<FrameCanvasOptions>) {
        return this.fromBase64(Base64.to(buffer), options, canvasOptions);
    }

    static fromBase64(base64: string, options?: Partial<FrameOptions>, canvasOptions?: Partial<FrameCanvasOptions>) {
        return this.fromURL(Base64.addURLData(base64, "image/png"), options, canvasOptions);
    }

    static async fromURL(path: string, options?: Partial<FrameOptions>, canvasOptions?: Partial<FrameCanvasOptions>) {
        const image = await new Promise<HTMLImageElement>((res, rej) => {
            const image = new Image();
            image.src = path;

            image.addEventListener("load", () => res(image));
            image.addEventListener("error", () => rej(`Unexpectedly encountered an error while loading from: "${path}". Please check that the file exists at that location and is not corrupted.`));
        });

        return new Frame(image, options, canvasOptions);
    }
}

export interface FrameOptions {
    width: number;
    height: number;

    top: number;
    left: number;

    delay: number;

    disposeOperation: FrameDisposeOperation;
    blendOperation: FrameBlendOperation;
}

export interface FrameCanvasOptions {
    imageWidth: number;
    imageHeight: number;

    clearBitmapHistory: boolean;
    backgroundColor: Uint8Array;
}

export const enum FrameDisposeOperation {
    None         = 0b00, // 0 - APNG_DISPOSE_OP_NONE

    ToBackground = 0b01, // 1 - APNG_DISPOSE_OP_BACKGROUND
    ToPrevious   = 0b10  // 2 - APNG_DISPOSE_OP_PREVIOUS
}

export const enum FrameBlendOperation {
    Overwrite = 0b0, // 0 - APNG_BLEND_OP_SOURCE
    Blend     = 0b1  // 1 - APNG_BLEND_OP_OVER
}