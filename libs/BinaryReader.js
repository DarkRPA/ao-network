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
        return this.Read(2, this.isBig ? 'readUInt16BE' : 'readUInt16LE');
    }

    ReadUInt32() {
        return this.Read(4, this.isBig ? 'readUInt32BE' : 'readUInt32LE');
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
        return this.Read(2, this.isBig ? 'readInt16BE' : 'readInt16LE');
    }

    ReadUInt16() {
        return this.Read(2, this.isBig ? 'readUInt16BE' : 'readUInt16LE');
    }

    ReadInt32() {
        return this.Read(4, this.isBig ? 'readInt32BE' : 'readInt32LE');
    }

    ReadFloat() {
        return this.Read(4, this.isBig ? 'readFloatBE' : 'readFloatLE');
    }

    ReadSingle() {
        const b = this.ReadBytes(4);
        // C# hace reverse si es LittleEndian, indicando que el stream original es BigEndian
        return b.ReadFloatBE(0);
    }

    ReadDouble() {
        return this.Read(8, this.isBig ? 'readDoubleBE' : 'readDoubleLE');
    }
}