import { Buffer } from "buffer"

const Protocol18Type = {
    Unknown: 0,
    Boolean: 2,
    Byte: 3,
    Short: 4,
    Float: 5,
    Double: 6,
    String: 7,
    Null: 8,
    CompressedInt: 9,
    CompressedLong: 10,
    Int1: 11,
    Int1Negative: 12,
    Int2: 13,
    Int2Negative: 14,
    Long1: 15,
    Long1Negative: 16,
    Long2: 17,
    Long2Negative: 18,
    Custom: 19,
    Dictionary: 20,
    Hashtable: 21,
    ObjectArray: 23,
    OperationRequest: 24,
    OperationResponse: 25,
    EventData: 26,
    BooleanFalse: 27,
    BooleanTrue: 28,
    ShortZero: 29,
    IntZero: 30,
    LongZero: 31,
    FloatZero: 32,
    DoubleZero: 33,
    ByteZero: 34,
    Array: 0x40,
    CustomTypeSlim: 0x80,
};

class OperationRequest {
    constructor(operationCode, parameters) {
        this.operationCode = operationCode;
        this.parameters = parameters; // Map
    }

}

class OperationResponse {
    constructor(operationCode, returnCode, debugMessage, parameters) {
        this.operationCode = operationCode;
        this.returnCode = returnCode;
        this.debugMessage = debugMessage;
        this.parameters = parameters; // Map
    }
}

class EventData {
    constructor(code, parameters) {
        this.code = code;
        this.parameters = parameters; // Map
    }

    toString(){
        let result = "";
        let paramKeys = this.parameters.keys();
        paramKeys.forEach(key => result = result.concat(`${key}:${this.parameters.get(key)}\n`));

        return result;
    }
}

// Clase auxiliar para reemplazar el uso de System.IO.Stream
class ByteBuffer {
    constructor(buffer) {
        this.buffer = buffer;
        this.position = 0;
    }

    get remaining() {
        return this.buffer.length - this.position;
    }

    ReadByte() {
        if (this.position >= this.buffer.length) {
            throw new Error("Unexpected end of stream.");
        }
        return this.buffer[this.position++];
    }

    ReadBytes(count) {
        if (count === 0) return Buffer.alloc(0);
        if (this.position + count > this.buffer.length) {
            throw new Error(`Unable to Read ${count} byte(s); got ${this.remaining}.`);
        }
        const slice = this.buffer.subarray(this.position, this.position + count);
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

export class Protocol18Deserializer {
    static deserializeOperationRequest(input) {
        const operationCode = input.ReadByte();
        const parameters = this._deserializeParameterTable(input);
        return new OperationRequest(operationCode, parameters);
    }

    static deserializeOperationResponse(input) {
        const operationCode = input.ReadByte();
        const returnCode = input.ReadInt16();
        let debugMessage = "";

        if (input.remaining > 0) {
            const debugValue = this.deserialize(input, input.ReadByte());
            debugMessage = typeof debugValue === 'string' ? debugValue : "";
        }

        const parameters = this._deserializeParameterTable(input);
        return new OperationResponse(operationCode, returnCode, debugMessage, parameters);
    }

    static deserializeEventData(input) {
        let code = input.ReadByte();
        let parameters = this._deserializeParameterTable(input);

        return new EventData(code, parameters);
    }

    static deserializeAuto(input) {
        return this.deserialize(input, input.ReadByte());
    }

    static deserialize(input, typeCode) {
        if (typeCode >= Protocol18Type.CustomTypeSlim) {
            return this._deserializeCustom(input, typeCode);
        }

        switch (typeCode) {
            case Protocol18Type.Unknown:
            case Protocol18Type.Null:
                return null;
            case Protocol18Type.Boolean:
                return input.ReadByte() !== 0;
            case Protocol18Type.Byte:
                return input.ReadByte();
            case Protocol18Type.Short:
                return input.ReadInt16();
            case Protocol18Type.Float:
                return input.ReadFloat();
            case Protocol18Type.Double:
                return input.ReadDouble();
            case Protocol18Type.String:
                let r = this._ReadString(input);
                return r
            case Protocol18Type.CompressedInt:
                return this._ReadCompressedInt32(input);
            case Protocol18Type.CompressedLong:
                return this._ReadCompressedInt64(input);
            case Protocol18Type.Int1:
                return input.ReadByte();
            case Protocol18Type.Int1Negative:
                return -input.ReadByte();
            case Protocol18Type.Int2:
                return input.ReadUInt16();
            case Protocol18Type.Int2Negative:
                return -input.ReadUInt16();
            case Protocol18Type.Long1:
                return BigInt(input.ReadByte());
            case Protocol18Type.Long1Negative:
                return -BigInt(input.ReadByte());
            case Protocol18Type.Long2:
                return BigInt(input.ReadUInt16());
            case Protocol18Type.Long2Negative:
                return -BigInt(input.ReadUInt16());
            case Protocol18Type.Custom:
                return this._deserializeCustom(input, 0);
            case Protocol18Type.Dictionary:
                return this._deserializeDictionary(input);
            case Protocol18Type.Hashtable:
                return this._deserializeHashtable(input);
            case Protocol18Type.ObjectArray:
                return this._deserializeObjectArray(input);
            case Protocol18Type.OperationRequest:
                return this.deserializeOperationRequest(input);
            case Protocol18Type.OperationResponse:
                return this.deserializeOperationResponse(input);
            case Protocol18Type.EventData:
                return this.deserializeEventData(input);
            case Protocol18Type.BooleanFalse:
                return false;
            case Protocol18Type.BooleanTrue:
                return true;
            case Protocol18Type.ShortZero:
                return 0; // JS numbers
            case Protocol18Type.IntZero:
                return 0;
            case Protocol18Type.LongZero:
                return 0n; // BigInt
            case Protocol18Type.FloatZero:
                return 0.0;
            case Protocol18Type.DoubleZero:
                return 0.0;
            case Protocol18Type.ByteZero:
                return 0;
            case Protocol18Type.Array:
                return this._deserializeNestedArray(input);
            default:
                if ((typeCode & Protocol18Type.Array) === Protocol18Type.Array) {
                    return this._deserializeTypedArray(input, typeCode & ~Protocol18Type.Array);
                }
                throw new Error(`Type code: ${typeCode} not implemented.`);
        }
    }

    static _deserializeParameterTable(input) {
        const dictionarySize = this._ReadCount(input);
        const dictionary = new Map();

        for (let i = 0; i < dictionarySize; i++) {
            const key = input.ReadByte();
            const valueTypeCode = input.ReadByte();
            try {
                const value = this.deserialize(input, valueTypeCode);
                dictionary.set(key, value);
                
            } catch (ex) {
                throw new Error(`Failed to deserialize parameter key=${key} valueType=0x${valueTypeCode} remaining=${input.remaining}. Original: ${ex.message}`);
            }
        }
        return dictionary;
    }

    static _deserializeDictionary(input) {
        const keyTypeCode = input.ReadByte();
        const valueTypeCode = input.ReadByte();
        const dictionarySize = this._ReadCount(input);
        const output = new Map();

        for (let i = 0; i < dictionarySize; i++) {
            const key = this.deserialize(input, keyTypeCode === 0 ? input.ReadByte() : keyTypeCode);
            const value = this.deserialize(input, valueTypeCode === 0 ? input.ReadByte() : valueTypeCode);
            output.set(key, value);
        }
        return output;
    }

    static _deserializeHashtable(input) {
        return this._deserializeDictionary(input); // En JS, Map cumple la función de ambos (Hashtable y Dictionary)
    }

    static _deserializeObjectArray(input) {
        const size = this._ReadCount(input);
        const result = new Array(size);
        for (let i = 0; i < size; i++) {
            result[i] = this.deserializeAuto(input);
        }
        return result;
    }

    static _deserializeNestedArray(input) {
        const size = this._ReadCount(input);
        let typeCode = input.ReadByte();
        const result = new Array(size);

        for (let i = 0; i < size; i++) {
            const itemStart = input.position;
            try {
                result[i] = this.deserialize(input, typeCode);
                if(i+1 < size){
                    typeCode = input.ReadByte();
                }
            } catch (ex) {
                input.position = itemStart;
                const repeatedValue = this._tryDeserializeNestedItemWithRepeatedTypeCode(input, typeCode);
                
                if (repeatedValue !== undefined) {
                    result[i] = repeatedValue;
                    continue;
                }

                input.position = itemStart;
                throw new Error(`Failed to deserialize nested array item index=${i} type=0x${typeCode.toString(16)} size=${size} remaining=${input.remaining}. Original: ${ex.message}`);
            }
        }
        return result;
    }

    static _deserializeTypedArray(input, elementTypeCode) {
        const size = this._ReadCount(input);
        try {
            switch (elementTypeCode) {
                case Protocol18Type.Boolean: {
                    const result = new Array(size);
                    const packedByteCount = Math.floor((size + 7) / 8);
                    const packed = input.ReadBytes(packedByteCount);
                    for (let i = 0; i < size; i++) {
                        const byteIndex = Math.floor(i / 8);
                        const bitIndex = i % 8;
                        result[i] = (packed[byteIndex] & (1 << bitIndex)) !== 0;
                    }
                    return result;
                }
                case Protocol18Type.Byte:
                    return Array.from(input.ReadBytes(size));
                case Protocol18Type.Short: {
                    const result = new Array(size);
                    for (let i = 0; i < size; i++) result[i] = input.ReadInt16();
                    return result;
                }
                case Protocol18Type.Float: {
                    const result = new Array(size);
                    for (let i = 0; i < size; i++) result[i] = input.ReadFloat();
                    return result;
                }
                case Protocol18Type.Double: {
                    const result = new Array(size);
                    for (let i = 0; i < size; i++) result[i] = input.ReadDouble();
                    return result;
                }
                case Protocol18Type.String: {
                    const result = new Array(size);
                    for (let i = 0; i < size; i++) result[i] = this._ReadString(input);
                    return result;
                }
                case Protocol18Type.Custom: {
                    const customType = input.ReadByte();
                    const result = new Array(size);
                    for (let i = 0; i < size; i++) result[i] = this._deserializeCustomPayload(input, customType);
                    return result;
                }
                case Protocol18Type.Dictionary: {
                    const result = new Array(size);
                    for (let i = 0; i < size; i++) result[i] = this._deserializeDictionary(input);
                    return result;
                }
                case Protocol18Type.Hashtable: {
                    const result = new Array(size);
                    for (let i = 0; i < size; i++) result[i] = this._deserializeHashtable(input);
                    return result;
                }
                case Protocol18Type.CompressedInt: {
                    const result = new Array(size);
                    for (let i = 0; i < size; i++) result[i] = this._ReadCompressedInt32(input);
                    return result;
                }
                case Protocol18Type.CompressedLong: {
                    const result = new Array(size);
                    for (let i = 0; i < size; i++) result[i] = this._ReadCompressedInt64(input);
                    return result;
                }
                default: {
                    const result = new Array(size);
                    for (let i = 0; i < size; i++) result[i] = this.deserialize(input, elementTypeCode);
                    return result;
                }
            }
        } catch (ex) {
            throw new Error(`Failed to deserialize typed array elementType=0x${elementTypeCode.toString(16)} size=${size} remaining=${input.remaining}. Original: ${ex.message}`);
        }
    }

    static _tryDeserializeNestedItemWithRepeatedTypeCode(input, typeCode) {
        const start = input.position;
        try {
            if (!this._isNestedCompressedArrayType(typeCode) || input.ReadByte() !== typeCode) {
                input.position = start;
                return undefined;
            }
            return this.deserialize(input, typeCode);
        } catch {
            input.position = start;
            return undefined;
        }
    }

    static _isNestedCompressedArrayType(typeCode) {
        return typeCode === (Protocol18Type.Array | Protocol18Type.CompressedInt) ||
               typeCode === (Protocol18Type.Array | Protocol18Type.CompressedLong);
    }

    static _deserializeCustom(input, gpType) {
        const isSlimCustomType = gpType >= Protocol18Type.CustomTypeSlim;
        const customType = isSlimCustomType ? (gpType & 0x7F) : input.ReadByte();
        return this._deserializeCustomPayload(input, customType, isSlimCustomType);
    }

    static _deserializeCustomPayload(input, customType, isSlimCustomType = false) {
        const start = input.position;
        const size = this._ReadCount(input);

        if (size < 0 || size > input.remaining) {
            if (isSlimCustomType) {
                input.position = start;
                return Array.from(input.ReadBytes(input.remaining));
            }
            throw new Error(`Custom type ${customType} reported invalid size ${size}.`);
        }
        return Array.from(input.ReadBytes(size));
    }

    static _ReadString(input) {
        const start = input.position;
        const compressedLength = this._tryReadCompressedLength(input);
        let s;
        if (compressedLength !== null && compressedLength <= input.remaining) {
            s = input.ReadBytes(compressedLength).toString('utf8');
            return s;
        }

        input.position = start;
        const lengthType = input.ReadByte();
        let length;

        switch (lengthType) {
            case 0: return "";
            case 1: length = input.ReadByte(); break;
            case 2: length = input.ReadUInt16(); break;
            case 4: length = input.ReadInt32(); break;
            default: throw new Error(`Received string type with unsupported length: ${lengthType}`);
        }

        if (length < 0 || length > input.remaining) {
            throw new Error(`Received invalid string length: ${length}`);
        }

        s = input.ReadBytes(length).toString('utf8');
        return s
    }

    static _tryReadCompressedLength(input) {
        const start = input.position;
        try {
            const compressed = this._ReadCompressedUInt32(input);
            // JS Number type limit check similar to int.MaxValue
            if (compressed > 2147483647) {
                input.position = start;
                return null;
            }
            return compressed;
        } catch {
            input.position = start;
            return null;
        }
    }

    static _ReadCount(input) {
        const count = this._tryReadCompressedLength(input);
        if (count !== null) return count;
        throw new Error("Failed to Read compressed Protocol18 count.");
    }

    static _ReadCompressedUInt32(input) {
        let value = 0;
        let shift = 0;

        while (shift < 35) {
            const current = input.ReadByte();
            value |= (current & 0x7F) << shift;
            if ((current & 0x80) === 0) {
                return value; // Cast a Unsigned Int32
            }
            shift += 7;
        }
        //return 0;
        //I don't know why this exact event is causing such drama
        throw new Error("Compressed UInt32 is too large.");
    }

    static _ReadCompressedUInt64(input) {
        let value = 0n;
        let shift = 0n;

        while (shift < 70n) {
            const current = BigInt(input.ReadByte());
            value |= (current & 0x7Fn) << shift;
            if ((current & 0x80n) === 0n) {
                return value;
            }
            shift += 7n;
        }
        throw new Error("Compressed UInt64 is too large.");
    }

    static _ReadCompressedInt32(input) {
        const value = this._ReadCompressedUInt32(input);
        // Zig-zag decoding compatible con operaciones a nivel de bits de 32 bits de JS
        return (value >>> 1) ^ -(value & 1);
    }

    static _ReadCompressedInt64(input) {
        const value = this._ReadCompressedUInt64(input);
        // Zig-zag decoding usando BigInt
        return (value >> 1n) ^ -(value & 1n);
    }
}