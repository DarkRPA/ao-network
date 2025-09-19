import { EventEmitter } from "node:events";
import { events } from "./data/events.js";
import { Cap } from "cap"

/**
 * Entry point for the library, starts packet capturing event handler.
 * 
 */
export class App{
    debug:boolean;
    events:OnPacketEvent;
    AODecoder:AODecoder;
    cap:Cap;
    data:any;
    PROTOCOL:any;
    linkType:any;
    buffer:Buffer;

    private init():void;
    constructor(debug:boolean);
    private onPacket(nBytes:number, trunc:boolean):void;
    /**
     * Adds a listener to the specified eventCode
     * @param eventCode The event code
     * @param callback The function to execute once the event is called
     */
    on(eventCode:events, callback:(operationCode:MessageType, parameters:any)=>void):void;
    
    use(callback:(operationCode:MessageType, parameters:any)=>void):void
}

/**
 * 
 */
export interface Context{
    code:number;
    parameters:Array<any>
}

/**
 * Event class used to emit PacketEvents
 */
export class OnPacketEvent extends EventEmitter{
    /**
     * 
     * @param event The event code that's being emitted
     * @param context The context (Parameters) of the event
     */
    emitPacketEvent(event:number, context:Context):void;
    use(callback:(operationCode:MessageType, parameters:any)=>void):void;
}

/**
 * Utility class made to read and deal with bytes in an easier way
 */
export class BinaryReader{
    buf:Buffer;
    isBig:boolean;
    encoding:string;
    length:number;
    position:number;

    /**
     * Generic read function, reads the specified amount of bytes
     * @param byte How many bytes to read
     * @param func The internal function to call Ex: readUInt8()
     */
    private Read(byte:number, func:string):any;
    
    /**
     * Reads a byte unsigned integer from the buffer
     */
    ReadUInt8():number;

    /**
     * Reads a 2 bytes-long unsigned integer from the buffer
     */
    ReadUInt16():number;

    /**
     * Reads a 4 bytes-long unsigned integer from the buffer
     */
    ReadUInt32():number;

    /**
     * Reads a signed integer
     */
    ReadInt8():number;

    /**
     * Reads a 2 bytes-long signed integer
     */
    ReadInt16():number;

    /**
     * Reads a 4 bytes-long signed integer
     */
    ReadInt32():number;

    /**
     * Reads a float
     */
    ReadFloat():number;

    /**
     * Reads a Double
     */
    ReadDouble():number;

    /**
     * Reads len bytes from the original buffer and place them on another buffer for further inspection/usage
     * @param len How many bytes to read
     */
    ReadBytes(len:number):Buffer;
}

export interface CommandType{
    Disconnect:4;
    SendReliable:6;
    SendUnreliable:7;
    SendFragment:8;
}

export interface MessageType{
    OperationRequest:"2";
    OperationResponse:"3";
    Event:"4";
}

export class AODecoder{
    events:OnPacketEvent;
    debug:boolean;
    commandHeaderLength:number;
    photonHeaderLength:number;
    commandType:CommandType;
    messageType:MessageType;
    Deserializer:any;
    _pendingSegments:any
    constructor(events:OnPacketEvent, debug:boolean);
    packetHandler(buf:Buffer):void;
    handleCommand(p:Buffer):void;
    handleSendReliable(p:Buffer, commandLength:number):void;
    handleSendFragment(p:Buffer, commandLength:number):void;
    handleFinishedSegmentedPackage(totalPayload:any):void;
    handleSegmentedPayload(startSequenceNumber:any, totalLength:any, fragmentLength:any, fragmentOffset:any, p:Buffer):void;
}