import {BinaryReader} from './BinaryReader.js';
import  {Protocol16}  from './PhotonParser/index.js';
import { Protocol18Deserializer } from './PhotonParser/Protocol16/Protocol18Deserializer.js';

export class AODecoder {
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
            this.handleCommand(p);
        }
    }

    handleCommand(p) {
        if(this.debug){
            console.log("HANDLE COMMAND START: ", "POSITION: ", p.position);
        }
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

        if(commandType == this.commandType.SendReliable){
            //console.log("");
        }

        commandLength -= this.commandHeaderLength;

        if(commandType == this.commandType.Disconnect) {
            return;
        }

        else if(commandType == this.commandType.SendReliable || commandType == this.commandType.SendUnreliable) {
            if(commandType == this.commandType.SendUnreliable) {
                p.position += 4;
                commandLength -= 4;
            }

            this.handleSendReliable(p, commandLength);
            return;
        }

        else if(commandType == this.commandType.SendFragment) {
            this.handleSendFragment(p, commandLength);
            return;
        }

        if(commandLength >= 700) {
            console.log();
        }

        p.position += commandLength;

        return;
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

        this._pendingSegments[startSequenceNumber] = {
            totalLength,
            bytesWritten: 0,
            totalPayload: new Buffer(totalLength)
        };

        return this._pendingSegments[startSequenceNumber];
    }
}
