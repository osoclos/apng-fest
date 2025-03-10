const BASE64_BASE_CHARACTERS: string = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
const BASE64_SPECIAL_CHARACTERS: string[] = ["+/", "-_"];
const BASE64_PADDING_CHARACTER: string = "=";

const BASE64_URL_DATA_REGEX = /data:(?:\w+)\/(?:[\w\.-]+)(?:\+(?:[\w\.-]+))*;base64(url)?,/;

export function from(base64: string) {
    const data = format(removeURLData(base64)).replaceAll("=", "");
    const characters = BASE64_BASE_CHARACTERS + BASE64_SPECIAL_CHARACTERS[0];

    const view = new DataView(new ArrayBuffer(data.length * 6 / 8));
    let i: number = 0;

    for (; i < data.length; i += 4) {
        let bits: number = 0;
        
        const chunk = data.slice(i, i + 4);
        for (let j = 0; j < chunk.length; j++) bits = bits << 6 | Math.max(characters.indexOf(chunk[j]), 0);
    
        const misalignmentLength = 4 - chunk.length;
        if (misalignmentLength) {
            bits >>= 8 - (misalignmentLength * 6 % 8);
            view[misalignmentLength === 2 ? "setUint8" : "setUint16"](i * 6 / 8, bits);
            
            continue;
        }

        view.setUint16(i * 6 / 8, bits >> 8);
        view.setUint8(i * 6 / 8 + 2, bits & 0xff);
    }

    return view.buffer;
}

export function to(buffer: ArrayBufferLike, useBase64URL: boolean = false): string {
    const characters = BASE64_BASE_CHARACTERS + BASE64_SPECIAL_CHARACTERS[+useBase64URL];
    const view = new DataView(buffer);

    let base64: string = "";
    let i: number = 0;

    for (; i < Math.floor(view.byteLength / 3) * 3; i += 3) {
        const bytes = (view.getUint16(i) << 8) | view.getUint8(i + 2);
        for (let j: number = 3; j >= 0; j--) base64 += characters[(bytes >> j * 6) & 0b11_1111];
    }

    const remainder = view.byteLength - i;
    if (!remainder) return base64;

    let lastChunk: number = 0;
    for (; i < view.byteLength; i++) {
        const byte = view.getUint8(i);
        lastChunk = lastChunk << 8 | byte;
    }

    lastChunk <<= 6 - (remainder * 8) % 6;
    for (let j = remainder; j >= 0; j--) base64 += characters[(lastChunk >> j * 6) & 0b11_1111];

    return base64 + BASE64_PADDING_CHARACTER.repeat(4 - Math.ceil(remainder * 8 / 6));
}

export function format(base64: string, useBase64URL: boolean = false): string {
    for (let i = 0; i < Math.min(...BASE64_SPECIAL_CHARACTERS.map((str) => str.length)); i++) for (let j = 1; j < BASE64_SPECIAL_CHARACTERS.length; j++) base64 = base64.replaceAll(BASE64_SPECIAL_CHARACTERS[j][i], BASE64_SPECIAL_CHARACTERS[0][i]);
    if (useBase64URL) for (let i = 0; i < BASE64_SPECIAL_CHARACTERS[0].length; i++) base64 = base64.replaceAll(BASE64_SPECIAL_CHARACTERS[0][i], BASE64_SPECIAL_CHARACTERS[+useBase64URL][i]);

    return base64;
}

export function addURLData(base64: string, mimeType: string, useBase64URL: boolean = false): string {
    return `data:${mimeType};base64${useBase64URL ? "url" : ""},${format(removeURLData(base64), useBase64URL)}`;
}

export function removeURLData(base64: string): string {
    return base64.replace(BASE64_URL_DATA_REGEX, "");
}

export function hasURLData(base64: string): boolean {
    return !!base64.match(BASE64_URL_DATA_REGEX);
}