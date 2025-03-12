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

export const CHUNK_METADATA_LENGTH: number = 12;
export const CHUNK_LENGTHS: Record<Exclude<CriticalChunkType, "IDAT" | "PLTE"> | Exclude<AnimationChunkType, "fdAT">, number> = {
    IHDR: 13,
    IEND: 0,

    acTL: 8,
    fcTL: 26
};