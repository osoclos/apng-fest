import { ColorType, type Chunk, type ChunkType } from "./types";
import { Base64, computeCRC } from "./utils";

import { Frame, type FrameOptions } from "./Frame";

const SIGNATURE: bigint = 0x89_50_4E_47_0D_0A_1A_0An;
const ALLOWED_BIT_DEPTHS: Record<ColorType, number[]> = {
    [ColorType.Greyscale]: [
        0b0_0001, // 1
        0b0_0010, // 2
        0b0_0100, // 4
        0b0_1000, // 8
        0b1_0000  // 16
    ],

    [ColorType.RGB]: [
        0b0_1000, // 8
        0b1_0000  // 16
    ],

    [ColorType.Indexed]: [
        0b0_0001, // 1
        0b0_0010, // 2
        0b0_0100, // 4
        0b0_1000  // 8
    ],

    [ColorType.GreyscaleAlpha]: [
        0b0_1000, // 8
        0b1_0000  // 16
    ],

    [ColorType.RGB_Alpha]: [
        0b0_1000, // 8
        0b1_0000  // 16
    ],
};

export class APNG {
    frames: Frame[];
    private chunks: Chunk[];

    constructor(private buffer: ArrayBufferLike, public name: string = "image.png") {
        let pointer: number = 0;

        const arrView = new Uint8Array(buffer);
        const dataView = new DataView(buffer);

        const advance = (step: number) => (pointer += step) - step;

        const signature = dataView.getBigUint64(advance(8));
        if (signature !== SIGNATURE) throw new Error("Buffer is not a valid .PNG image.");

        this.chunks = [];
        do this.chunks.push(readChunk()); while (this.chunks[this.chunks.length - 1].type !== "IEND" || pointer < arrView.length);

        const { IHDR, IDAT, IEND } = this;
        if (!IHDR || !IDAT || !IEND) throw new Error("Unable to find mandatory chunks for .PNG file. File may be corrupted or tampered with.");
        
        const { bitDepth, colorType } = this;
        if (!ALLOWED_BIT_DEPTHS[colorType].includes(bitDepth)) throw new Error("Invalid color type or illegal bit depth used.");

        if (colorType === ColorType.Indexed) {
            const PLTE = this.findChunk("PLTE");
            if (!PLTE) throw new Error("Unable to find mandatory PLTE chunk for indexed .PNG file. File may be corrupted or tampered with.");
        }
        
        this.frames = [];
        
        function readChunk(): Chunk {
            const length = dataView.getUint32(advance(4));

            const typeBytes = arrView.subarray(advance(4), pointer);
            const type = <ChunkType>String.fromCharCode(...typeBytes);

            const buffer = arrView.slice(advance(length), pointer);
            const view = new DataView(buffer.buffer);

            const crcBuffer = new Uint8Array([...typeBytes, ...buffer]).buffer;
            const crc = computeCRC(crcBuffer);

            const fileCRC = dataView.getUint32(advance(4));
            if (crc !== fileCRC) throw new Error("CRC Checksum does not match computed checksum. File may be corrupted or tampered with.");

            return { type, length, buffer, view, crc };
        }
    }

    private get IHDR(): Chunk {
        const IHDR = this.findChunk("IHDR");
        if (!IHDR) throw new Error("Unable to find IHDR chunk in file.");

        return IHDR;
    }

    private get IDAT(): Chunk {
        const IDAT = this.findChunk("IDAT");
        if (!IDAT) throw new Error("Unable to find IDAT chunk in file.");

        return IDAT;
    }

    private get IEND(): Chunk {
        const IEND = this.findChunk("IEND");
        if (!IEND) throw new Error("Unable to find IEND chunk in file.");

        return IEND;
    }

    private get ancillaryChunks(): Chunk[] {
        const chunks = <Chunk[]>(<ChunkType[]>["gAMA", "cHRM", "sRGB", "sBIT", "iCCP", "PLTE", "hIST", "tRNS", "bKGD", "pHYs", "tIME"]).map((type) => this.findChunk(type)).filter((chunk) => chunk);
        chunks.push(...this.filterChunks("sPLT"));

        return chunks;
    }

    get width(): number {
        // bitwise operation must be done for compatibility with signed-only systems.
        return this.IHDR.view.getUint32(0) & (-1 >>> 1);
    }

    get height(): number {
        // bitwise operation must be done for compatibility with signed-only systems.
        return this.IHDR.view.getUint32(4) & (-1 >>> 1);
    }

    get bitDepth(): number {
        return this.IHDR.view.getUint8(8);
    }

    get colorType(): ColorType {
        return this.IHDR.view.getUint8(9);
    }

    async createFrames() {
        this.frames = [];

        const acTL = this.findChunk("acTL");
        const {
            width: imageWidth,
            height: imageHeight
        } = this;

        if (!acTL) {
            const options: FrameOptions = {
                width: imageWidth,
                height: imageHeight,

                top: 0,
                left: 0,

                delay: 0,

                disposeOperation: 0,
                blendOperation: 0
            };

            const frame = await Frame.fromRawBuffer(this.buffer, options, { clearBitmapHistory: true });
            this.frames.push(frame);

            return;
        }

        const { IHDR, IDAT, IEND } = this;
        const ancillaryChunkBuffer = new Uint8Array(this.ancillaryChunks.flatMap((chunk) => [...reformChunk(chunk)]));

        const [fcTLs, fdATs] = (<ChunkType[]>["fcTL", "fdAT"]).map((type) => this.filterChunks(type));

        const first_fcTL_Idx = fcTLs.findIndex((chunk) => getSequenceNumber(chunk) === 0);
        if (first_fcTL_Idx < 0) throw new Error("Unable to find starting fcTL chunk. File may be corrupted or tampered with.");

        const [first_fcTL] = fcTLs.splice(first_fcTL_Idx, 1);

        const animationChunks: Chunk[] = [];
        const numOfFrames = acTL.view.getUint32(0);

        for (let i: number = 1; i < numOfFrames * 2 -1 ; i += 2) {
            const fcTL_Idx = fcTLs.findIndex((chunk) => getSequenceNumber(chunk) === i);
            if (fcTL_Idx < 0) throw new Error("Unable to find following fcTL chunk. File may be corrupted or tampered with.");

            const fdAT_Idx = fdATs.findIndex((chunk) => getSequenceNumber(chunk) === i + 1);
            if (fdAT_Idx < 0) throw new Error("Unable to find following fdAT chunk. File may be corrupted or tampered with.");

            const [fcTL] = fcTLs.splice(fcTL_Idx, 1);
            const [fdAT] = fdATs.splice(fdAT_Idx, 1);

            animationChunks.push(fcTL, fdAT);
        }

        animationChunks.unshift(first_fcTL, IDAT);

        const getBackgroundColor = (): Uint8Array => {
            const bKGD = this.findChunk("bKGD");
            if (!bKGD) return new Uint8Array(4).fill(0x00);
            
            const { bitDepth, colorType } = this;
            const { view } = bKGD;

            const readUint16 = bitDepth > 8;
            switch (colorType) {
                case ColorType.Greyscale:
                case ColorType.GreyscaleAlpha: {
                    let val = view[readUint16 ? "getUint16" : "getUint8"](0);
                    if (readUint16) val /= 0xffff;

                    return new Uint8Array([...Array(3).fill(val), 0xff]);
                }

                case ColorType.RGB:
                case ColorType.RGB_Alpha: {
                    const rgb = Array(3).fill(null).map((_, i) => view[readUint16 ? "getUint16" : "getUint8"](i * (1 + +readUint16))).map((val) => readUint16 ? val / 0xffff : val);
                    return new Uint8Array([...rgb, 0xff]);
                }

                case ColorType.Indexed: {
                    const PLTE = this.findChunk("PLTE");
                    if (!PLTE) throw new Error("Unable to find mandatory PLTE chunk for indexed .PNG file. File may be corrupted or tampered with.");
                    
                    const { buffer } = PLTE;

                    const i = view.getUint8(0);
                    const rgb = buffer.slice(i * 3, (i + 1) * 3);

                    return new Uint8Array([...rgb, 0xff]);
                }
            }
        };

        const backgroundColor = getBackgroundColor();

        for (let i: number = 0; i < animationChunks.length; i += 2) {
            const [fcTL, fdAT] = animationChunks.slice(i, i + 2);

            const options = getFrameOptions(fcTL);
            const { width, height } = options;

            const view = new DataView(new ArrayBuffer(8));
            view.setBigUint64(0, SIGNATURE);

            const blob = new Blob([view, reformIHDR(IHDR, width, height), ancillaryChunkBuffer, reform_fdAT(fdAT), reformChunk(IEND)]);
            const buffer = await blob.arrayBuffer();

            const frame = await Frame.fromRawBuffer(buffer, options, { imageWidth, imageHeight, backgroundColor });
            this.frames.push(frame);
        }

        function getFrameOptions(chunk: Chunk): FrameOptions {
            const { type, view } = chunk;
            if (type !== "fcTL") throw new Error("Chunk is not a fcTL chunk.");

            const width = view.getUint32(4);
            const height = view.getUint32(8);

            const left = view.getUint32(12);
            const top = view.getUint32(16);

            const delay = view.getUint16(20) / view.getUint16(22);

            const disposeOperation = view.getUint8(24);
            const blendOperation = view.getUint8(25);

            return { width, height, left, top, delay, disposeOperation, blendOperation };
        }

        function getSequenceNumber(chunk: Chunk): number | null {
            const { type, view } = chunk;
            switch (type) {
                case "fcTL":
                case "fdAT": return view.getUint32(0);
                case "IDAT": return 0;

                default: return null;
            }
        }

        function reformIHDR(chunk: Chunk, width: number, height: number) {
            const { type, buffer: oldBuffer } = chunk;
            if (type !== "IHDR") throw new Error("Chunk is not an IHDR chunk.");

            const buffer = oldBuffer.slice();
            const view = new DataView(buffer.buffer);

            view.setUint32(0, width);
            view.setUint32(4, height);

            return reformChunk({ ...chunk, buffer, view }, true);
        }

        function reform_fdAT(chunk: Chunk) {
            const { type, buffer: chunkBuffer } = chunk;

            if (type === "IDAT") return reformChunk(chunk);
            if (type !== "fdAT") throw new Error("Chunk is not an fdAT chunk.");

            const buffer = chunkBuffer.slice(4);
            const view = new DataView(buffer.buffer);

            return reformChunk({ ...chunk, type: "IDAT", buffer, view }, true);
        }

        function reformChunk(chunk: Chunk, recalculateCRC: boolean = false) {
            const { type, length, buffer, crc } = chunk;

            const arr = new Uint8Array(length + 12);
            const view = new DataView(arr.buffer);

            view.setUint32(0, length);
            arr.set(type.split("").map((char) => char.charCodeAt(0)), 4);

            arr.set(buffer, 8);
            view.setUint32(length + 8, recalculateCRC ? computeCRC(arr.buffer, 4, length + 8) : crc);

            return arr;
        }
    }

    private findChunk(chunkType: ChunkType): Chunk | null {
        return this.chunks.find(({ type }) => type === chunkType) ?? null;
    }

    private filterChunks(chunkType: ChunkType): Chunk[] {
        return this.chunks.filter(({ type }) => type === chunkType);
    }

    static async fromBlob(blob: Blob) {
        return new APNG(await blob.arrayBuffer(), blob instanceof File ? blob.name : undefined);
    }

    static fromBuffer(buffer: ArrayBufferView) {
        return new APNG(buffer.buffer);
    }

    static fromBase64(base64: string) {
        return new APNG(Base64.from(base64));
    }

    static async fromURL(path: string) {
        return new APNG(await fetch(path).then((res) => res.arrayBuffer()), path.split("/").pop());
    }

    toBlob() {

    }

    toBuffer() {

    }

    toBase64() {

    }

    toURL() {

    }
}