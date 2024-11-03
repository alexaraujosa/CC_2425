//#region ============== Types ==============
const BufferSize = {
    UInt8:  1,
    UInt16: 2,
    UInt32: 4,
    UInt64: 8,

    Int8:  1,
    Int16: 2,
    Int32: 4,
    Int64: 8,

    Float: 4,
    Double: 8
} as const;
type BufferSize = typeof BufferSize[keyof typeof BufferSize];

/**
 * Type safety for ensuring the {@link BufferWriter} class always has the correspondent write methods for every key 
 * in {@link BufferSize}.
 */
type _BufferWriterIndex = {
    [key in `write${keyof typeof BufferSize}`]: (value: number) => void;
};

/**
 * Type safety for ensuring the {@link BufferReader} class always has the correspondent read methods for every key 
 * in {@link BufferSize}.
 */
type _BufferReaderIndex = {
    [key in `read${keyof typeof BufferSize}`]: () => number;
};
//#endregion ============== Types ==============

/**
 * Utility class for writing operations for buffers.
 * Writes using Big Endian.
 */
class BufferWriter implements _BufferWriterIndex {
    protected buffers: Buffer[];
    protected _totalLength: number;

    constructor() {
        this.buffers = [];
        this._totalLength = 0;

        for (const key of Object.keys(BufferSize)) {
            Object.defineProperty(this, `write${key}`, {
                configurable: true,
                enumerable: true,
                value: this._write.bind(this, BufferSize[<keyof typeof BufferSize>key]),
                writable: false
            });
        }
    }

    public finish(): Buffer {
        return Buffer.concat(this.buffers);
    }

    //#region ======= Writers =======
    private _write(size: BufferSize, value: number) {
        const buf = Buffer.alloc(size);

        for (let i = 0; i < Math.ceil(size / 6); i++) {
            buf.writeUintBE(value, i * 6, Math.min(6, size - i * 6));
        }

        this.buffers.push(buf);
        this._totalLength += size;
    }

    public write(value: Buffer): void {
        this.buffers.push(value);
        this._totalLength += value.byteLength;
    }

    public writeUInt8!: (value: number) => number;
    public writeUInt16!: (value: number) => number;
    public writeUInt32!: (value: number) => number;
    public writeUInt64!: (value: number) => number;
    public writeInt8!: (value: number) => number;
    public writeInt16!: (value: number) => number;
    public writeInt32!: (value: number) => number;
    public writeInt64!: (value: number) => number;
    public writeFloat!: (value: number) => number;
    public writeDouble!: (value: number) => number;
    //#endregion ====== Writers =======
}

/**
 * Sequential buffer reader with automatic offset.
 */
class BufferReader implements _BufferReaderIndex {
    protected buffer: Buffer;
    protected offset: number;

    constructor(buffer: Buffer, offset?: number) {
        this.buffer = buffer;
        this.offset = offset ?? 0;

        for (const key of Object.keys(BufferSize)) {
            Object.defineProperty(this, `read${key}`, {
                configurable: true,
                enumerable: true,
                value: this._read.bind(this, BufferSize[<keyof typeof BufferSize>key]),
                writable: false
            });
        }
    }

    //#region ======= Readers =======
    private _read(size: BufferSize) {
        const value = this.buffer.readUIntBE(this.offset, size);
        this.offset += size;

        return value;
    }

    public read(size: number): Buffer {
        const value = this.buffer.subarray(this.offset, this.offset + size);
        this.offset += size;

        return value;
    }

    public readUInt8!: () => number;
    public readUInt16!: () => number;
    public readUInt32!: () => number;
    public readUInt64!: () => number;
    public readInt8!: () => number;
    public readInt16!: () => number;
    public readInt32!: () => number;
    public readInt64!: () => number;
    public readFloat!: () => number;
    public readDouble!: () => number;
    //#endregion ====== Readers =======
}

export {
    BufferWriter,
    BufferReader
};