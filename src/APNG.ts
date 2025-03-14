import { CHUNK_LENGTHS, CHUNK_METADATA_LENGTH, ColorType, type Chunk, type ChunkType } from "./types";
import { Base64, computeCRC, DataManager, floatToFrac, InternalCanvas } from "./utils";

import { Frame, FrameBlendOperation, FrameDisposeOperation, type FrameOptions } from "./Frame";

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

const { canvas, ctx } = InternalCanvas;

export class APNG {
    frames: Frame[];
    #hasCreatedFrames: boolean;

    width: number;
    height: number;

    #numOfLoops: number;

    private chunks: Chunk[];

    private writeBuffer: Uint8Array;
    private writeNumOfFrames: number;

    private hasWrittenIHDR: boolean;
    private hasWrittenIEND: boolean;

    private writeSequenceNumber: number;
    private writeFrameIdx: number;

    constructor(private buffer: ArrayBufferLike, public name: string = "image.png") {
        const manager = new DataManager(buffer);

        const signature = manager.readUint64();
        if (signature !== SIGNATURE) throw new Error("Buffer is not a valid .PNG image.");

        this.chunks = [];
        do this.chunks.push(this.readChunk(manager)); while (this.chunks[this.chunks.length - 1].type !== "IEND" || manager.pointer < manager.length);

        const { IHDR, IDATs, IEND } = this;
        if (!IHDR || !IDATs.length || !IEND) throw new Error("Unable to find mandatory chunks for .PNG file. File may be corrupted or tampered with.");
        
        this.width = IHDR.view.getUint32(0) & (-1 >>> 1);
        this.height = IHDR.view.getUint32(4) & (-1 >>> 1);

        const { bitDepth, colorType } = this;
        if (!ALLOWED_BIT_DEPTHS[colorType].includes(bitDepth)) throw new Error("Invalid color type or illegal bit depth used.");

        if (colorType === ColorType.Indexed) {
            const PLTE = this.findChunk("PLTE");
            if (!PLTE) throw new Error("Unable to find mandatory PLTE chunk for indexed .PNG file. File may be corrupted or tampered with.");
        }

        const acTL = this.findChunk("acTL");
        this.#numOfLoops = acTL ? acTL.view.getUint32(4) : 0;
        
        this.frames = [];
        this.#hasCreatedFrames = false;

        this.writeBuffer = new Uint8Array();
        this.writeNumOfFrames = 0;

        this.hasWrittenIHDR = false;
        this.hasWrittenIEND = false;

        this.writeSequenceNumber = 0;
        this.writeFrameIdx = 0;
    }

    get hasCreatedFrames(): boolean {
        return this.#hasCreatedFrames;
    }

    private get IHDR(): Chunk {
        const IHDR = this.findChunk("IHDR");
        if (!IHDR) throw new Error("Unable to find IHDR chunk in file.");

        return IHDR;
    }

    private get IDATs(): Chunk[] {
        const IDATs = this.filterChunks("IDAT");
        if (!IDATs.length) throw new Error("Unable to find IDAT chunks in file.");

        return IDATs;
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

    get bitDepth(): number {
        return this.IHDR.view.getUint8(8);
    }

    get colorType(): ColorType {
        return this.IHDR.view.getUint8(9);
    }

    get duration(): number {
        return this.frames.reduce((sum, { delay }) => sum + delay, 0);
    }

    get numOfFrames(): number {
        return this.frames.length;
    }

    get numOfLoops(): number {
        return this.#numOfLoops === 0 ? Infinity : this.#numOfLoops;
    }

    set numOfLoops(numOfLoops: number) {
        this.#numOfLoops = numOfLoops > (-1 >>> 0) ? 0 : Math.max(numOfLoops, 0);
    }

    static async create(width: number, height: number, name?: string) {
        canvas.width = width;
        canvas.height = height;

        const blob = await canvas.convertToBlob({ type: "image/png" });
        const buffer = await blob.arrayBuffer();

        return new APNG(buffer, name);
    }

    async createFrames() {
        const { hasCreatedFrames } = this;
        if (hasCreatedFrames) throw new Error("APNG frames have already been created.");
        
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

        const { IHDR, IEND } = this;
        const { ancillaryChunks } = this;

        const animationChunks = this.filterChunks("IDAT", "fcTL", "fdAT");

        // if the first fcTL chunk is after the IDAT chunk, remove IDAT from the list.
        const isIDAT_InAnimation = animationChunks.findIndex(({ type }) => type === "fcTL") < animationChunks.findIndex(({ type }) => type === "IDAT");
        
        const IDATs: Chunk[] = [];
        for (let i: number = 0; i < animationChunks.length; i++) animationChunks[i].type === "IDAT" && IDATs.push(...animationChunks.splice(i--, 1));

        animationChunks.sort(({ view: a }, { view: b }) => a.getUint32(0) - b.getUint32(0));
        if (isIDAT_InAnimation) animationChunks.splice(animationChunks.findIndex(({ type }) => type === "fcTL") + 1, 0, ...IDATs);

        const numOfFrames = acTL.view.getUint32(0);

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

        const writeIHDR = (chunk: Chunk, manager: DataManager, width: number, height: number) => {
            const { type, buffer: oldBuffer } = chunk;
            if (type !== "IHDR") throw new Error("Chunk is not an IHDR chunk.");

            const buffer = oldBuffer.slice();
            const view = new DataView(buffer.buffer);

            view.setUint32(0, width);
            view.setUint32(4, height);

            this.writeChunk({ ...chunk, buffer, view }, manager, true);
        };

        const write_fdAT = (chunk: Chunk, manager: DataManager) => {
            const { type, buffer: chunkBuffer } = chunk;

            if (type === "IDAT") {
                this.writeChunk(chunk, manager);
                return;
            }
            
            if (type !== "fdAT") throw new Error("Chunk is not an fdAT chunk.");

            const buffer = chunkBuffer.slice(4);
            const view = new DataView(buffer.buffer);

            this.writeChunk({ ...chunk, type: "IDAT", buffer, view }, manager, true);
        };

        while (this.frames.length < numOfFrames) {
            const manager = new DataManager();

            const fcTL = animationChunks.shift();
            if (!fcTL || fcTL.type !== "fcTL") throw new Error("Error creating frames: Frame data is misaligned.");

            const next_fcTL_Idx = animationChunks.findIndex(({ type }) => type === "fcTL");
            const fdATs = animationChunks.splice(0, next_fcTL_Idx < 0 ? animationChunks.length : next_fcTL_Idx);

            const options = getFrameOptions(fcTL);
            const { width, height } = options;

            manager.writeUint64(SIGNATURE);
            writeIHDR(IHDR, manager, width, height);

            for (let i: number = 0; i < ancillaryChunks.length; i++) this.writeChunk(ancillaryChunks[i], manager);
            for (let i: number = 0; i < fdATs.length; i++) write_fdAT(fdATs[i], manager);

            this.writeChunk(IEND, manager);

            const frame = await Frame.fromBuffer(manager.buffer, options, { imageWidth, imageHeight, backgroundColor, clearBitmapHistory: !this.frames.length });
            this.frames.push(frame);
        }

        this.#hasCreatedFrames = true;

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
    }

    update() {
        this.frames.forEach((frame) => frame.update());
    }

    reset(clearFrames: boolean = true) {
        if (clearFrames) this.frames = [];

        this.writeBuffer = new Uint8Array();
        this.writeNumOfFrames = 0;

        this.hasWrittenIHDR = false;
        this.hasWrittenIEND = false;

        this.writeSequenceNumber = 0;
        this.writeFrameIdx = 0;
    }

    writeHeader() {
        if (this.hasWrittenIHDR) throw new Error("Header has already been written to buffer.");
        
        this.reset(false);

        const manager = new DataManager(this.writeBuffer.buffer);
        manager.writeUint64(SIGNATURE);

        const {
            width: imageWidth,
            height: imageHeight
        } = this;

        const writeIHDR = (manager: DataManager, width: number, height: number) => {
            const length: number = CHUNK_LENGTHS.IHDR;
            const type: ChunkType = "IHDR";

            const buffer = new Uint8Array(length);
            const view = new DataView(buffer.buffer);

            view.setUint32(0, width);
            view.setUint32(4, height);

            view.setUint8(8, 8); // bit depth.
            view.setUint8(9, ColorType.RGB_Alpha); // color type

            view.setUint8(10, 0); // compression method
            view.setUint8(11, 0); // filtering method
            view.setUint8(12, 0); // interlacing method

            const crc: number = 0; // will be recalculated later.

            this.writeChunk({ length, type, buffer, view, crc }, manager, true);
        };

        writeIHDR(manager, imageWidth, imageHeight);

        this.writeBuffer = manager.buffer;
        this.writeNumOfFrames = 0;

        this.hasWrittenIHDR = true;

        return this.writeBuffer;
    }

    async writeFrame(frame: Frame = this.frames[this.writeFrameIdx]) {
        const manager = new DataManager(this.writeBuffer.buffer, this.writeBuffer.byteLength);

        const {
            width: imageWidth,
            height: imageHeight
        } = this;

        const write_fcTL = (manager: DataManager, width: number, height: number, top: number, left: number, delay: number) => {
            const length: number = CHUNK_LENGTHS.fcTL;
            const type: ChunkType = "fcTL";

            const buffer = new Uint8Array(length);
            const view = new DataView(buffer.buffer);

            view.setUint32(0, this.writeSequenceNumber++);

            view.setUint32(4, width);
            view.setUint32(8, height);

            view.setUint32(12, left);
            view.setUint32(16, top);

            const [delayNum, delayDen] = floatToFrac(delay);
            view.setUint16(20, delayNum);
            view.setUint16(22, delayDen);

            view.setUint8(24, FrameDisposeOperation.None);
            view.setUint8(25, FrameBlendOperation.Overwrite);

            const crc: number = 0; // will be recalculated later.

            this.writeChunk({ length, type, buffer, view, crc }, manager, true);
        };

        const write_fdAT = (chunk: Chunk, manager: DataManager) => {
            const {
                length: chunkLength,
                type,

                buffer: chunkBuffer,
                view: chunkView
            } = chunk;

            if (type === "fdAT") {
                chunkView.setUint32(0, this.writeSequenceNumber++);
                this.writeChunk(chunk, manager);

                return;
            }

            if (type !== "IDAT") throw new Error("Chunk is not an IDAT chunk.");

            const length = chunkLength + 4;

            const buffer = new Uint8Array(length);
            buffer.set(chunkBuffer, 4);

            const view = new DataView(buffer.buffer);
            view.setUint32(0, this.writeSequenceNumber++);

            this.writeChunk({ ...chunk, length, type: "fdAT", buffer, view }, manager, true);
        };

        const writeFrame = async (frame: Frame, writeIDAT: boolean) => {
            let { data, width, height, top, left, delay } = frame;

            let buffer: Uint8Array;
            if (left < 0 || left + width > imageWidth || top < 0 || top + height > imageHeight) {
                canvas.width = imageWidth;
                canvas.height = imageHeight;

                ctx.putImageData(data, left, top);

                width = imageWidth;
                height = imageHeight;

                top = 0;
                left = 0;
                
                const blob = await canvas.convertToBlob({ type: "image/png" });
                buffer = new Uint8Array(await blob.arrayBuffer());
            } else buffer = await frame.toBuffer();

            const frameManager = new DataManager(buffer.buffer);

            const signature = frameManager.readUint64();
            if (signature !== SIGNATURE) throw new Error("Frame buffer is not a valid .PNG image.");
            
            const chunks = [];
            do chunks.push(this.readChunk(frameManager)); while (chunks[chunks.length - 1].type !== "IEND" || frameManager.pointer < frameManager.length);

            const IDATs = chunks.filter(({ type }) => type === "IDAT");
            if (!IDATs.length) throw new Error("Unable to find IDAT chunks in frame file.");
            
            write_fcTL(manager, width, height, top, left, delay);
            for (let j: number = 0; j < IDATs.length; j++) (writeIDAT ? this.writeChunk : write_fdAT)(IDATs[j], manager);
        }

        await writeFrame(frame, !this.writeNumOfFrames);

        this.writeBuffer = manager.buffer;
        this.writeNumOfFrames++;

        frame === this.frames[this.writeFrameIdx] && this.writeFrameIdx++;

        return this.writeBuffer;
    }

    writeFooter() {
        if (this.hasWrittenIEND) throw new Error("Footer has already been written to buffer.");

        const { writeNumOfFrames } = this;
        const numOfLoops = this.#numOfLoops;

        const { IEND } = this;
        const write_acTL = (manager: DataManager, numOfFrames: number, numOfLoops: number) => {
            const length: number = CHUNK_LENGTHS.acTL;
            const type: ChunkType = "acTL";

            const buffer = new Uint8Array(length);
            const view = new DataView(buffer.buffer);

            view.setUint32(0, numOfFrames);
            view.setUint32(4, numOfLoops);

            const crc: number = 0; // will be recalculated later.

            this.writeChunk({ length, type, buffer, view, crc }, manager, true);
        };

        const buffer = new Uint8Array(this.writeBuffer.length + CHUNK_LENGTHS.acTL + CHUNK_METADATA_LENGTH);
        const manager = new DataManager(buffer.buffer);

        manager.copy(this.writeBuffer.buffer, 0, 8 + CHUNK_LENGTHS.IHDR + CHUNK_METADATA_LENGTH);
        write_acTL(manager, writeNumOfFrames, numOfLoops);
        manager.copy(this.writeBuffer.buffer, 8 + CHUNK_LENGTHS.IHDR + CHUNK_METADATA_LENGTH);
        
        this.writeChunk(IEND, manager);

        this.writeBuffer = manager.buffer;
        this.hasWrittenIEND = true;

        return this.writeBuffer;
    }

    private findChunk(chunkType: ChunkType): Chunk | null {
        return this.chunks.find(({ type }) => type === chunkType) ?? null;
    }

    private filterChunks(...types: ChunkType[]): Chunk[] {
        return this.chunks.filter(({ type }) => types.includes(type));
    }

    private readChunk(manager: DataManager): Chunk {
        const length = manager.readUint32();

        const typeBytes = manager.slice(4);
        const type = <ChunkType>String.fromCharCode(...typeBytes);

        const buffer = manager.slice(length);
        const view = new DataView(buffer.buffer);

        const crcBuffer = new Uint8Array([...typeBytes, ...buffer]).buffer;
        const crc = computeCRC(crcBuffer);

        const fileCRC = manager.readUint32();
        if (crc !== fileCRC) throw new Error("CRC Checksum does not match computed checksum. File may be corrupted or tampered with.");

        return { type, length, buffer, view, crc };
    }

    private writeChunk(chunk: Chunk, manager: DataManager, recalculateCRC: boolean = false) {
        const { type, length, buffer, crc } = chunk;

        const typeBytes = type.split("").map((char) => char.charCodeAt(0))

        manager.writeUint32(length);
        manager.copy(typeBytes);

        manager.copy(buffer);

        const crcBuffer = new Uint8Array(length + 4);
        crcBuffer.set(typeBytes);
        crcBuffer.set(buffer, 4);

        manager.writeUint32(recalculateCRC ? computeCRC(crcBuffer.buffer) : crc);
    }

    static async fromBlob(blob: Blob) {
        return new APNG(await blob.arrayBuffer(), blob instanceof File ? blob.name : undefined);
    }

    static fromBuffer(buffer: ArrayBufferView) {
        return new APNG(buffer.buffer);
    }

    static fromBase64(base64: string) {
        return new APNG(Base64.to(base64));
    }

    static async fromURL(path: string) {
        return new APNG(await fetch(path).then((res) => res.arrayBuffer()), path.split("/").pop());
    }

    async toBlob(): Promise<Blob> {
        return new Blob([await this.toBuffer()], { type: "image/png" });
    }

    async toImg(): Promise<HTMLImageElement> {
        const blob = await this.toBlob();
        const url = URL.createObjectURL(blob);

        const image = await new Promise<HTMLImageElement>((res, rej) => {
            const image = new Image();
            image.src = url;

            image.addEventListener("load", () => res(image));
            image.addEventListener("error", () => rej("2: Unexpectedly encountered an error while creating image."));
        });

        return image;
    }

    async toBuffer(): Promise<Uint8Array> {
        const { frames } = this;

        this.reset(false);
        
        this.writeHeader();
        for (let i: number = 0; i < frames.length; i++) await this.writeFrame();
        this.writeFooter();

        return this.writeBuffer;
    }

    async toBase64(addURL: boolean = true): Promise<string> {
        const { buffer } = await this.toBuffer();
        const base64 = Base64.from(buffer);

        return addURL ? Base64.addURLData(base64, "image/png") : base64;
    }
}