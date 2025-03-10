export type ChunkType = CriticalChunkType | AncillaryChunkType | AnimationChunkType;
export interface Chunk {
    type: ChunkType;
    length: number;

    buffer: Uint8Array;
    view: DataView;
    
    crc: number;
}

export type CriticalChunkType = "IHDR" | "IDAT" | "IEND" | "PLTE";
export type AncillaryChunkType = "gAMA" | "cHRM" | "sRGB" | "sBIT" | "iCCP" | "sPLT" | "hIST" | "tRNS" | "bKGD" | "pHYs" | "tIME";

export type AnimationChunkType = "acTL" | "fcTL" | "fdAT";