import {BinaryReader} from './BinaryReader.js';
import  {Protocol16}  from './PhotonParser/index.js';
import { Protocol18Deserializer } from './PhotonParser/Protocol16/Protocol18Deserializer.js';


export class AODecoder {
    CODIGO_1 = -12;
    CODIGO_4 = -12;
    CODIGO_5 = -12;
    CODIGO_6 = -12;
    CODIGO_7 = -16;
    CODIGO_8 = -32;

    constructor(events, debug) {
        this.events = events;
        this.debug = debug;

        this.commandHeaderLength = 12;
        this.photonHeaderLength = 12;

        this.commandType = {
            Ping: 5,
            Acknowledge: 1,
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
            try {
                this.handleCommand(p);
            } catch (error) {
                this.trySkipCommand(p);
            }
        }
    }

    handleCommand(p) {
        if(this.debug){
            console.log("HANDLE COMMAND START: ", "POSITION: ", p.position);
        }
        let actualPosition = p.position;
        const commandType       = p.ReadUInt8();
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

    checkIfLengthIsCorrect(p, length, startingPoint){
        return (p.buf[startingPoint + length] == this.commandType.SendReliable || p.buf[startingPoint + length] == this.commandType.SendFragment || p.buf[startingPoint + length] == this.commandType.SendUnreliable || p.buf[startingPoint + length] == this.commandType.SendFragment || p.buf[startingPoint + length] == 0);
    }

    findCorrectLengthOfCommand(p, startingPoint){
        let internalCounter = p.position;
        let found = false;
        let result = 0;

        while(!found){
            if((p.buf[internalCounter] == this.commandType.SendFragment || p.buf[internalCounter] == this.commandType.SendReliable || p.buf[internalCounter] == this.commandType.SendUnreliable) && (p.buf[internalCounter + 3] == 0)){
                found = true;
                result = (internalCounter - startingPoint);
            }else{
                internalCounter++;
            }
        }

        return result;
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
                    Protocol18Deserializer.deserializeEventData(payload, p)
                );
                //console.log(p)
            break;
        }
    }

    checkBytesPlus(p, bytes){
        let starting = p.position - 1;
        return p.buf[starting + Math.abs(bytes)] == 243 && (p.buf[starting + Math.abs(bytes) + 1] == this.messageType.Event || p.buf[starting + Math.abs(bytes) + 1] == this.messageType.OperationRequest || p.buf[starting + Math.abs(bytes) + 1] == this.messageType.OperationResponse);
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
        return this.trySkipCommand(p);

        let tryToGoBack = this.retryCommand(p);
        if(tryToGoBack == -1){
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
            if(p.buf[p.position] == 243 && (p.buf[p.position + Math.abs(sumatorio)] == this.messageType.Event || p.buf[p.position + Math.abs(sumatorio)] == this.messageType.OperationRequest || p.buf[p.position + Math.abs(sumatorio)] == this.messageType.OperationResponse)){
                //It seems this is the start of the packet, since this only happens in segmented packets
                //we are going 16 bytes earlier.
                if(p.buf[p.position + this.CODIGO_7] == this.commandType.SendUnreliable){
                    p.position += this.CODIGO_7;
                    return (retry)?1:0;
                }

                if(p.buf[p.position + this.CODIGO_6] == this.commandType.SendReliable){
                    p.position += this.CODIGO_6;
                    //console.log("POSITION SKIPEADA: ", p.position)
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

        if(!retry){
            return -2;
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
