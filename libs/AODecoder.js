import {BinaryReader} from './BinaryReader.js';
import  {Protocol16}  from './PhotonParser/index.js';
import { Protocol18Deserializer } from './PhotonParser/Protocol16/Protocol18Deserializer.js';


export class AODecoder {
    CODIGO_6 = -12;
    CODIGO_7 = -16;
    CODIGO_8 = -32;
    constructor(events, debug) {
        this.events = events;
        this.debug = debug;

        this.commandHeaderLength = 12;
        this.photonHeaderLength = 12;

        this.commandType = {
            Disconnect: 4,
            SendReliable: 6,
            SendUnreliable: 7,
            SendFragment: 8
        };

        this.messageType = {
            OperationRequest: 2,
            OperationResponse: 3,
            Event: 4
        };

        this.Deserializer = new Protocol16.Protocol18Deserializer();
        this._pendingSegments = {};
    }

    packetHandler(buf) {
        if(this.debug){
            console.log("PACKET_HANDLER: ", buf.position);
        }
        if(buf.length < this.photonHeaderLength) {
            return;
        }

        let p = new BinaryReader(buf);

        const peerId        = p.ReadUInt16();
        const flags         = p.ReadByte();
        const commandCount  = p.ReadByte();
        const timestamp     = p.ReadUInt32();
        const challenge     = p.ReadUInt32();

        const isEncrypted = flags == 1;
        const isCrcEnabled = flags == 204;

        if(this.debug){
            console.log("AFTER BINARY READER: ", buf.position, p.position, peerId, flags, commandCount, timestamp, challenge);
        }

        if(isEncrypted) {
            if(this.debug === true) {
                console.log(`Encrypted packages are not supported`);
            }

            return;
        }

        for(let commandIdx = 0; commandIdx < commandCount; commandIdx++) {
            if(this.debug){
                console.log("COMMAND LOOP: ", commandIdx, commandCount, "POSITION: ", buf.position);
            }
            let code = this.handleCommand(p);
            if(code == 1){
                //Hemos relocalizado el comando, volvemos a intentarlo
                commandIdx--;
            }
        }
    }

    handleCommand(p) {
        if(this.debug){
            console.log("HANDLE COMMAND START: ", "POSITION: ", p.position);
        }
        const commandType       = p.ReadUInt8();
        
        switch(commandType){
            case this.commandType.Disconnect:
            case this.commandType.SendFragment:
            case this.commandType.SendReliable:
            case this.commandType.SendUnreliable:
                break;
            default:
                return this.handleRetrySkip(p);
        }

        if(commandType == this.commandType.Disconnect) {
            return 0;
        }

        //Tenemos que comprobar que despues de 12, 16 o 32 bytes respectivamente haya un código 243+4 para confirmar la integridad
        //del paquete
        let actualPosition = p.position;
        let bytes = 0;

        switch(commandType){
            case this.commandType.SendReliable:
                bytes = this.CODIGO_6;
                break;
            case this.commandType.SendUnreliable:
                bytes = this.CODIGO_7;
                break;
            case this.commandType.SendFragment:
                bytes = this.CODIGO_8;
                break;
        }

        if(!this.checkBytesPlus(p, bytes)){
            return this.handleRetrySkip(p);
        }

        const channelId         = p.ReadUInt8();
        const commandFlags      = p.ReadUInt8();
        const unkBytes          = p.ReadUInt8();
        let commandLength       = p.ReadUInt32();
        const sequenceNumber    = p.ReadUInt32();

        if(this.debug){
            console.log("HANDLE COMMAND POST READ: ", "POSITION: ", p.position, commandType, channelId, commandFlags, unkBytes, commandLength, sequenceNumber);
        }

        if(commandType != this.commandType.Disconnect && commandType != this.commandType.SendFragment && commandType != this.commandType.SendReliable && commandType != this.commandType.SendUnreliable) return;

        commandLength -= this.commandHeaderLength;

    
        if(commandType == this.commandType.SendReliable || commandType == this.commandType.SendUnreliable) {
            if(commandType == this.commandType.SendUnreliable) {
                p.position += 4;
                commandLength -= 4;
            }

            this.handleSendReliable(p, commandLength);
            return 0;
        }

        else if(commandType == this.commandType.SendFragment) {
            this.handleSendFragment(p, commandLength);
            return 0;
        }

        p.position += commandLength;

        return 0;
    }

    handleSendReliable(p, commandLength) {
        if(this.debug){
            console.log("HANDLE SEND RELIABLE START: ", "POSITION: ", p.position, commandLength);
        }

        p.position++;
        commandLength--;

        let messageType = p.ReadByte();
        commandLength--;

        let operationLength = commandLength;

        let payload = new Protocol16.Stream(commandLength);

        payload.writeBuffer(p.buf, p.position, commandLength);

        p.position += operationLength;

        if(this.debug){
            console.log("HANDLE SEND RELIABLE POST READ: ", "POSITION: ", p.position, commandLength, messageType, operationLength, payload);
        }

        switch(messageType) {
            case this.messageType.OperationRequest:
                this.events.emitPacketEvent(
                    this.messageType.OperationRequest,
                    Protocol18Deserializer.deserializeOperationRequest(payload)
                );
            break;

            case this.messageType.OperationResponse:
                this.events.emitPacketEvent(
                    this.messageType.OperationResponse,
                    Protocol18Deserializer.deserializeOperationResponse(payload)
                );
            break;

            case this.messageType.Event:
                this.events.emitPacketEvent(
                    this.messageType.Event,
                    Protocol18Deserializer.deserializeEventData(payload)
                );
                //console.log(p)
            break;
        }
    }

    checkBytesPlus(p, bytes){
        return p.buf[p.position + Math.abs(bytes)] == 243 && p.buf[p.position + Math.abs(bytes) + 1] == 4;
    }

    checkBytesPlusReliable(p){
        return this.checkBytesPlus(p, this.CODIGO_6);
    }

    checkBytesPlusUnReliable(p){
        return this.checkBytesPlus(p, this.CODIGO_7);
    }

    checkBytesPlusFragment(p){
        return this.checkBytesPlus(p, this.CODIGO_8);
    }

    handleRetrySkip(p){
        let tryToGoBack = this.retryCommand(p);
        if(tryToGoBack != -1){
            //Inevitablemente tenemos que skipear este comando
            return this.trySkipCommand(p);
        }
        return tryToGoBack;
    }

    retryCommand(p){
        return this.trySkipCommand(p, true);
    }

    trySkipCommand(p, retry = false){
        let startingPosition = p.position;
        let startFound = false;
        let sumatorio = (!retry)?1:-1;
        
        while(!startFound){
            if(p.position >= p.length || p.position < 0) startFound = true;
            if(p.buf[p.position] == 243 && p.buf[p.position + Math.abs(sumatorio)] == 4){
                //It seems this is the start of the packet, since this only happens in segmented packets
                //we are going 16 bytes earlier.
                if(p.buf[p.position + this.CODIGO_7] == this.commandType.SendUnreliable){
                    p.position += this.CODIGO_7;
                    return (retry)?1:0;
                }

                if(p.buf[p.position + this.CODIGO_6] == this.commandType.SendReliable){
                    p.position += this.CODIGO_6;
                    return (retry)?1:0;
                }

                if(p.buf[p.position + this.CODIGO_8] == this.commandType.SendFragment){
                    p.position += this.CODIGO_8;
                    return (retry)?1:0;
                }

                p.position += sumatorio;
            }else{
                p.position += sumatorio;
            }
        }

        p.position = startingPosition;
        return -1;
    }

    handleSendFragment(p, commandLength) {
        if(this.debug){
            console.log("HANDLE SEND FRAGMENT START: ", "POSITION: ", p.position, commandLength);
        }
        const startSequenceNumber = p.ReadUInt32();
        commandLength -= 4;
        const fragmentCount = p.ReadUInt32();
        commandLength -= 4;
        const fragmentNumber = p.ReadUInt32();
        commandLength -= 4;
        const totalLength = p.ReadUInt32();
        commandLength -= 4;
        const fragmentOffset = p.ReadUInt32();
        commandLength -= 4;

        let fragmentLength = commandLength;

        if(this.debug){
            console.log("HANDLE SEND POST READ: ", "POSITION: ", p.position, commandLength, "|", startSequenceNumber, fragmentCount, fragmentNumber, totalLength, fragmentOffset);
        }

        this.handleSegmentedPayload(startSequenceNumber, totalLength, fragmentLength, fragmentOffset, p);
    }

    handleFinishedSegmentedPackage(totalPayload) {
        let p = new BinaryReader(totalPayload);

        this.handleSendReliable(p, totalPayload.length);
    }

    handleSegmentedPayload(startSequenceNumber, totalLength, fragmentLength, fragmentOffset, p) {
        let segmentedPackage = this.getSegmentedPackage(startSequenceNumber, totalLength);

        p.buf.copy(segmentedPackage.totalPayload, fragmentOffset, p.position, p.position + fragmentLength);
        p.position += fragmentLength;
        segmentedPackage.bytesWritten += fragmentLength;

        if(segmentedPackage.bytesWritten >= segmentedPackage.totalLength) {
            delete this._pendingSegments[startSequenceNumber];
            this.handleFinishedSegmentedPackage(segmentedPackage.totalPayload);
        }
    }

    getSegmentedPackage(startSequenceNumber, totalLength) {
        if(this._pendingSegments.hasOwnProperty(startSequenceNumber)) {
            return this._pendingSegments[startSequenceNumber];
        }

        let buffer1 = new Buffer(totalLength);
        this._pendingSegments[startSequenceNumber] = {
            totalLength,
            bytesWritten: 0,
            totalPayload: buffer1
        };

        return this._pendingSegments[startSequenceNumber];
    }
}
