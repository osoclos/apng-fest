export class DataManager {
    buffer: Uint8Array;
    view: DataView;

    constructor(buffer: ArrayBufferLike = new ArrayBuffer(), public pointer: number = 0) {
        this.buffer = new Uint8Array(buffer);
        this.view = new DataView(buffer);
    }

    get length(): number {
        return this.buffer.byteLength;
    }

    readUint8(): number {
        return this.view.getUint8(this.advance(1));
    }

    readUint16(): number {
        return this.view.getUint16(this.advance(2));
    }

    readUint32(): number {
        return this.view.getUint32(this.advance(4));
    }

    readUint64(): bigint {
        return this.view.getBigUint64(this.advance(8));
    }

    writeUint8(uint8: number) {
        if (this.pointer + 1 > this.length) this.resize(this.pointer + 1);
        return this.view.setUint8(this.advance(1), uint8);
    }

    writeUint16(uint16: number) {
        if (this.pointer + 2 > this.length) this.resize(this.pointer + 2);
        return this.view.setUint16(this.advance(2), uint16);
    }

    writeUint32(uint32: number) {
        if (this.pointer + 4 > this.length) this.resize(this.pointer + 4);
        return this.view.setUint32(this.advance(4), uint32);
    }

    writeUint64(uint64: bigint | number) {
        if (this.pointer + 8 > this.length) this.resize(this.pointer + 8);
        return this.view.setBigUint64(this.advance(8), BigInt(uint64));
    }

    slice(length: number) {
        return this.buffer.slice(this.advance(length), this.pointer);
    }

    copy(arr: ArrayBufferLike | Iterable<number>, offset: number = 0, length: number = (Symbol.iterator in arr ? [...arr].length : arr.byteLength) - offset) {
        if (this.pointer + length > this.length) this.resize(this.pointer + length);
        this.buffer.set(Symbol.iterator in arr ? [...arr].slice(offset, offset + length) : new Uint8Array(arr).slice(offset, offset + length), this.advance(length));
    }

    resize(length: number) {
        const { buffer } = this;
            
        this.buffer = new Uint8Array(length);
        this.buffer.set(buffer);

        this.view = new DataView(this.buffer.buffer);
    }

    advance(step: number): number {
        return (this.pointer += step) - step;
    }
}