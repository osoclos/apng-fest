export interface Chunk {
    type: string;
    length: number;

    buffer: Uint8Array;
    view: DataView;
    
    crc: number;
}