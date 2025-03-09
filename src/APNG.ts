import type { Chunk } from "./types";
import { computeCRC } from "./utils";

const SIGNATURE: bigint = 0x89_50_4E_47_0D_0A_1A_0An;

export class APNG {
    frames: Blob[];

    private buffer: Uint8Array;
    private chunks: Chunk[];

    constructor(buffer: ArrayBufferLike, public name: string = "image.png") {
        let pointer: number = 0;

        const arrView = new Uint8Array(buffer);
        const dataView = new DataView(buffer);

        const advance = (step: number) => (pointer += step) - step;

        const signature = dataView.getBigUint64(advance(8));
        if (signature !== SIGNATURE) throw new Error("Buffer is not a valid .PNG image.");

        this.buffer = arrView;

        this.chunks = [];
        do this.chunks.push(readChunk()); while (this.chunks[this.chunks.length - 1].type !== "IEND" || pointer < arrView.length);

        this.frames = [];
        
        function readChunk(): Chunk {
            const length = dataView.getUint32(advance(4));

            const typeBytes = arrView.subarray(advance(4), pointer);
            const type = String.fromCharCode(...typeBytes);

            const buffer = arrView.subarray(advance(length), pointer);
            const view = new DataView(buffer.buffer, buffer.byteOffset, buffer.byteLength);

            const crcBuffer = new Uint8Array([...typeBytes, ...buffer]).buffer;
            const crc = computeCRC(crcBuffer);

            const fileCRC = dataView.getUint32(advance(4));
            if (crc !== fileCRC) throw new Error("CRC Checksum does not match computed checksum. File may be corrupted or tampered with.");

            return { type, length, buffer, view, crc };
        }
    }

    static async from(path: string): Promise<APNG>;
    static async from(blob: Blob): Promise<APNG>;
    static async from(file: File): Promise<APNG>;
    static async from(view: ArrayBufferView): Promise<APNG>;
    static async from(buffer: ArrayBufferLike): Promise<APNG>;
    static async from(arg: string | Blob | File | ArrayBufferView | ArrayBufferLike) {
        switch (true) {
            case typeof arg === "string": return new APNG(await fetch(arg).then((res) => res.arrayBuffer()), arg.split("/").pop());
            
            case arg instanceof Blob:
            case arg instanceof File: return new APNG(await arg.arrayBuffer(), arg instanceof File ? arg.name : undefined);
            
            case arg instanceof ArrayBuffer || arg instanceof SharedArrayBuffer: return new APNG(arg);
            default: return new APNG(arg.buffer);
        }
    }

    async createFrames() {
        this.frames = [];

        const { IHDR, IDAT, IEND, PLTE, gAMA, cHRM, sRGB, sBIT, iCCP, sPLTs, hIST, tRNS, bkGD, pHYs, tIME, acTL, fcTLs, fdATs } = this;
        if (!acTL) {
            this.frames.push(new Blob([this.buffer]));
            return;
        }
        
        fdATs.unshift(IDAT);

        const numOfFrames = acTL.view.getUint32(0);
        for (let i = 0; i < numOfFrames; i++) this.frames.push(await createFrame(fcTLs[i], fdATs[i]));

        async function createFrame(fcTL: Chunk, fdAT: Chunk): Promise<Blob> {
            const frameWidth = fcTL.view.getUint32(4);
            const frameHeight = fcTL.view.getUint32(8);

            const x = fcTL.view.getUint32(12);
            const y = fcTL.view.getUint32(16);

            const delay = fcTL.view.getUint16(20) / fcTL.view.getUint16(22);

            const disposeOperation = fcTL.view.getUint8(24);
            const blendOperation = fcTL.view.getUint8(25);

            const view = new DataView(new ArrayBuffer(8));
            view.setBigUint64(0, SIGNATURE);

            const arr: number[] = [...new Uint8Array(view.buffer), ...reformIHDR(IHDR, frameWidth, frameHeight)];

            if (gAMA) arr.push(...reformChunk(gAMA));
            if (cHRM) arr.push(...reformChunk(cHRM));

            if (sRGB) arr.push(...reformChunk(sRGB));
            if (sBIT) arr.push(...reformChunk(sBIT));

            if (iCCP) arr.push(...reformChunk(iCCP));

            if (PLTE) arr.push(...reformChunk(PLTE));
            for (const sPLT of sPLTs) arr.push(...reformChunk(sPLT));
            if (hIST) arr.push(...reformChunk(hIST));

            if (tRNS) arr.push(...reformChunk(tRNS));
            if (bkGD) arr.push(...reformChunk(bkGD));

            if (pHYs) arr.push(...reformChunk(pHYs));
            if (tIME) arr.push(...reformChunk(tIME));

            arr.push(...reform_fdAT(fdAT));
            arr.push(...reformChunk(IEND));

            return new Blob([new Uint8Array(arr)]);

            function reformIHDR(chunk: Chunk, width: number, height: number) {
                const { type, view } = chunk;
                if (type !== "IHDR") throw new Error("Chunk is not an IHDR chunk.");

                view.setUint32(0, width);
                view.setUint32(4, height);

                return reformChunk(chunk, true);
            }

            function reform_fdAT(chunk: Chunk) {
                const { type, buffer: chunkBuffer } = chunk;

                if (type === "IDAT") return reformChunk(chunk);
                if (type !== "fdAT") throw new Error("Chunk is not an fdAT chunk.");

                const buffer = chunkBuffer.subarray(4);
                const view = new DataView(buffer.buffer, buffer.byteOffset, buffer.byteLength);

                return reformChunk({ ...chunk, type: "IDAT", buffer, view }, true);
            }
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

    private get IHDR(): Chunk {
        const IHDR = this.chunks.find(({ type }) => type === "IHDR");
        if (!IHDR) throw new Error("Unable to find IHDR chunk in file.");

        return IHDR;
    }

    private get IDAT(): Chunk {
        const IDAT = this.chunks.find(({ type }) => type === "IDAT");
        if (!IDAT) throw new Error("Unable to find IDAT chunk in file.");

        return IDAT;
    }

    private get IEND(): Chunk {
        const IEND = this.chunks.find(({ type }) => type === "IEND");
        if (!IEND) throw new Error("Unable to find IEND chunk in file.");

        return IEND;
    }

    private get gAMA(): Chunk | null {
        return this.chunks.find(({ type }) => type === "gAMA") ?? null;
    }

    private get cHRM(): Chunk | null {
        return this.chunks.find(({ type }) => type === "cHRM") ?? null;
    }

    private get sRGB(): Chunk | null {
        return this.chunks.find(({ type }) => type === "sRGB") ?? null;
    }

    private get sBIT(): Chunk | null {
        return this.chunks.find(({ type }) => type === "sBIT") ?? null;
    }

    private get iCCP(): Chunk | null {
        return this.chunks.find(({ type }) => type === "iCCP") ?? null;
    }

    private get PLTE(): Chunk | null {
        return this.chunks.find(({ type }) => type === "PLTE") ?? null;
    }

    private get sPLTs(): Chunk[] {
        return this.chunks.filter(({ type }) => type === "sPLT");
    }

    private get hIST(): Chunk | null {
        return this.chunks.find(({ type }) => type === "hIST") ?? null;
    }

    private get tRNS(): Chunk | null {
        return this.chunks.find(({ type }) => type === "tRNS") ?? null;
    }

    private get bkGD(): Chunk | null {
        return this.chunks.find(({ type }) => type === "bkGD") ?? null;
    }

    private get pHYs(): Chunk | null {
        return this.chunks.find(({ type }) => type === "pHYs") ?? null;
    }

    private get tIME(): Chunk | null {
        return this.chunks.find(({ type }) => type === "tIME") ?? null;
    }

    private get acTL(): Chunk | null {
        return this.chunks.find(({ type }) => type === "acTL") ?? null;
    }

    private get fcTLs(): Chunk[] {
        return this.chunks.filter(({ type }) => type === "fcTL");
    }

    private get fdATs(): Chunk[] {
        return this.chunks.filter(({ type }) => type === "fdAT");
    }
}