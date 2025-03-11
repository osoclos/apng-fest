import { Base64, InternalCanvas } from "./utils";

const { canvas, ctx } = InternalCanvas;
let bitmapHistory: ImageBitmap[] = [];

export class Frame {
    data: ImageData;
    bitmap: ImageBitmap;

    top: number;
    left: number;

    delay: number;

    constructor(image: HTMLImageElement | ImageData | ImageBitmap, options: Partial<FrameOptions> = {}, canvasOptions: Partial<FrameCanvasOptions> = {}) {
        let inferredWidth: number;
        let inferredHeight: number;

        switch (true) {
            case image instanceof HTMLImageElement: {
                if (!image.complete) throw new Error("Image has not been fully loaded yet.");

                const { naturalWidth, naturalHeight } = image;
                inferredWidth = naturalWidth;
                inferredHeight = naturalHeight;

                break;
            }

            case image instanceof ImageData:
            case image instanceof ImageBitmap: {
                const { width, height } = image;
                inferredWidth = width;
                inferredHeight = height;
                
                break;
            }

            default: {
                inferredWidth = 0;
                inferredHeight = 0;
            }
        }

        const {
            width = inferredWidth,
            height = inferredHeight,

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

        if (clearBitmapHistory) bitmapHistory = [];

        canvas.width = imageWidth;
        canvas.height = imageHeight;

        switch (disposeOperation) {
            case FrameDisposeOperation.None: {
                const [bitmap] = bitmapHistory;
                if (bitmap) ctx.drawImage(bitmap, 0, 0);

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

        image instanceof ImageData ? ctx.putImageData(image, left, top) : ctx.drawImage(image, 0, 0, width, height, left, top, width, height);
        
        this.data = ctx.getImageData(left, top, width, height);
        this.bitmap = canvas.transferToImageBitmap();

        this.top = top;
        this.left = left;

        this.delay = delay;

        bitmapHistory.length >= 2 && bitmapHistory.pop();
        bitmapHistory.unshift(this.bitmap);
    }

    get pixels(): Uint8Array {
        return new Uint8Array(this.data.data);
    }

    get width(): number {
        return this.data.width;
    }

    set width(newWidth: number) {
        const { pixels, width, height } = this;

        const data = new ImageData(newWidth, height);
        for (let y: number = 0; y < height; y++) data.data.set(pixels.slice(y * width, y * width + Math.min(width, newWidth)), y * newWidth);

        this.data = data;
    }

    get height(): number {
        return this.data.height;
    }

    set height(newHeight: number) {
        const { pixels, width, height } = this;

        const data = new ImageData(width, newHeight);
        for (let y: number = 0; y < Math.min(height, newHeight); y++) data.data.set(pixels.slice(y * width, (y + 1) * width), y * width);

        this.data = data;
    }

    get(x: number, y: number): Uint8Array {
        const { pixels, width, height } = this;

        if (x < 0 || x >= width) throw new Error("Invalid x position.");
        if (y < 0 || y >= height) throw new Error("Invalid y position.");

        const i = (x + y * width) * 4;
        return pixels.slice(i, i + 4);
    }

    set(pixel: Uint8Array, x: number, y: number) {
        const { pixels, width, height } = this;

        if (x < 0 || x >= width) throw new Error("Invalid x position.");
        if (y < 0 || y >= height) throw new Error("Invalid y position.");

        pixels.set(pixel, (x + y * width) * 4);
    }

    update() {
        const { data, width, height } = this;
        canvas.width = width;
        canvas.height = height;

        ctx.putImageData(data, 0, 0);
        this.bitmap = canvas.transferToImageBitmap();
    }

    static fromPixels(pixels: ArrayBufferLike, options: Partial<FrameOptions> & Pick<FrameOptions, "width" | "height">, canvasOptions?: Partial<FrameCanvasOptions>) {
        const { width, height } = options;
        const data = new ImageData(new Uint8ClampedArray(pixels), width, height);

        return new Frame(data, options, canvasOptions);
    }

    static fromCtx(ctx: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D, options?: Partial<FrameOptions>, canvasOptions?: Partial<FrameCanvasOptions>) {
        const {
            width: canvasWidth,
            height: canvasHeight
        } = ctx.canvas;

        const {
            width = canvasWidth,
            height = canvasHeight,

            top = 0,
            left = 0
        } = options ?? {};

        const data = ctx.getImageData(left, top, width, height);
        return new Frame(data, { width, height, top, left, ...options }, canvasOptions);
    }

    static fromBlob(blob: Blob, options?: Partial<FrameOptions>, canvasOptions?: Partial<FrameCanvasOptions>) {
        return this.fromURL(URL.createObjectURL(blob), options, canvasOptions);
    }

    static fromBuffer(buffer: ArrayBufferView, options?: Partial<FrameOptions>, canvasOptions?: Partial<FrameCanvasOptions>) {
        return this.fromRawBuffer(buffer.buffer, options, canvasOptions);
    }

    static fromRawBuffer(buffer: ArrayBufferLike, options?: Partial<FrameOptions>, canvasOptions?: Partial<FrameCanvasOptions>) {
        return this.fromBase64(Base64.from(buffer), options, canvasOptions);
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

    async toBlob(): Promise<Blob> {
        const { data, width, height } = this;
        canvas.width = width;
        canvas.height = height;

        ctx.putImageData(data, 0, 0);
        
        const blob = await canvas.convertToBlob();
        return blob;
    }

    async toImg(): Promise<HTMLImageElement> {
        const blob = await this.toBlob();
        const url = URL.createObjectURL(blob);

        const image = await new Promise<HTMLImageElement>((res, rej) => {
            const image = new Image();
            image.src = url;

            image.addEventListener("load", () => res(image));
            image.addEventListener("error", () => rej("Unexpectedly encountered an error while creating image."));
        });

        return image;
    }

    async toBuffer(): Promise<Uint8Array> {
        const blob = await this.toBlob();
        const buffer = await blob.arrayBuffer();

        return new Uint8Array(buffer);
    }

    async toBase64(): Promise<string> {
        const { buffer } = await this.toBuffer();
        return Base64.from(buffer);
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