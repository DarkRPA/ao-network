export class BinaryReader {
    constructor(buf, isBig = true, encoding = 'ascii') {
        this.buf        = buf;
        this.isBig      = isBig;
        this.encoding   = encoding;
        this.length     = this.buf.length;
        this.position   = 0;
    }

    setPosition(position) {
        this.position = position;
    }

     ReadByte() {
        if (this.position >= this.buf.length) {
            throw new Error("Unexpected end of stream.");
        }
        return this.buf[this.position++];
    }

    ReadBytes(count) {
        if (count === 0) return Buffer.alloc(0);
        if (this.position + count > this.buf.length) {
            throw new Error(`Unable to Read ${count} byte(s); got ${this.remaining}.`);
        }
        const slice = this.buf.subarray(this.position, this.position + count);
        this.position += count;
        return slice;
    }

    ReadInt16() {
        const b = this.ReadBytes(2);
        // Construcción Little-Endian coincidente con el C# original
        return ((b[0] | (b[1] << 8)) << 16) >> 16; 
    }

    ReadUInt16() {
        const b = this.ReadBytes(2);
        return b[0] | (b[1] << 8);
    }

    ReadInt32() {
        const b = this.ReadBytes(4);
        // Construcción Big-Endian coincidente con el C# original
        return (b[0] << 24) | (b[1] << 16) | (b[2] << 8) | b[3];
    }

    ReadSingle() {
        const b = this.ReadBytes(4);
        // C# hace reverse si es LittleEndian, indicando que el stream original es BigEndian
        return b.ReadFloatBE(0);
    }

    ReadDouble() {
        const b = this.ReadBytes(8);
        return b.ReadDoubleBE(0);
    }
}