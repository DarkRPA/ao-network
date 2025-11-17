import pack from "cap";
const {Cap, decoders} = pack;

import * as os from "os";
import { AODecoder } from './libs/AODecoder.js';
import { OnPacketEvent } from './libs/Events.js';
import * as data from './data/index.js';
import * as network from "network";

export class App {
    constructor(debug = false) {
        this.debug      = debug;

        this.cap        = new Cap();
        this.events     = new OnPacketEvent();
        this.AODecoder  = new AODecoder(this.events, this.debug);
        this.data       = data;

        this.PROTOCOL   = decoders.PROTOCOL;
        this.linkType   = null;
        this.buffer     = Buffer.alloc(65535);

        this.init();
    }

    init = () => {       
        let networkInterfaces = os.networkInterfaces();
        //We are going to give support for Ethernet, for now
        let foundNetwork;

        //We have to be careful, linux and windows differ vastly between naming conventions

        network.get_active_interface((error, data)=>{
            if(error){
                throw new Error(error);
            }

            foundNetwork = data["ip_address"];

            const device = Cap.findDevice(foundNetwork);
        
            const filter = 'udp and (dst port 5056 or src port 5056)';
            const bufSize = 10 * 1024 * 1024;

            this.linkType = this.cap.open(device, filter, bufSize, this.buffer);
            this.cap.setMinBytes && this.cap.setMinBytes(0);
            this.cap.on('packet', this.onPacket);
        });
    }

    onPacket = (nBytes, trunc) => {
        if(this.linkType !== 'ETHERNET') {
            return;
        }

        let ret = decoders.Ethernet(this.buffer);

        if(ret.info.type !== this.PROTOCOL.ETHERNET.IPV4) {
            if(this.debug) {
                console.log('Unsupported Ethertype: ' + this.PROTOCOL.ETHERNET[ret.info.type]);
            }

            return;
        }

        ret = decoders.IPV4(this.buffer, ret.offset);

        if(ret.info.protocol !== this.PROTOCOL.IP.UDP) {
            if(this.debug) {
                console.log('Unsupported IPv4 protocol: ' + this.PROTOCOL.IP[ret.info.protocol]);
            }

            return;
        }

        ret = decoders.UDP(this.buffer, ret.offset);

        if(ret.info.srcport != 5056 && ret.info.dstport != 5056) {
            return;
        }

        this.AODecoder.packetHandler(this.buffer.slice(ret.offset));
    }

    on(eventCode, callback){
        this.events.on(eventCode, callback);
    }

    use(callback){
        this.events.use(callback);
    }
}
