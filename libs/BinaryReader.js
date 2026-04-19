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

    Read(byte, func) {
        if(this.buf.length < (this.position + byte)) {
            return 0;
        }

        let value = this.buf[func](this.position);
        this.position += byte;

        return value;
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

    ReadUInt8() {
        return this.Read(1, 'readUInt8');
    }

    ReadUInt16() {
        return this.Read(2, 'readUInt16LE');
    }

    ReadUInt32() {
        return this.Read(4, 'readUInt32LE');
    }
    

    ReadUInt16BE() {
        return this.Read(2, 'readUInt16BE');
    }

    ReadUInt32BE() {
        return this.Read(4, 'readUInt32BE');
    }
    
    ReadInt8() {
        return this.Read(1, 'readInt8');
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

    ReadFloat() {
        return this.Read(4, 'readFloatLE');
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