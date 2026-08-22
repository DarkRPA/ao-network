import pack from "cap";
const {Cap, decoders} = pack;

import * as os from "os";
import { AODecoder } from './libs/AODecoder.js';
import { OnPacketEvent } from './libs/Events.js';
import * as data from './data/index.js';
import * as network from "network";
import { Interfaz } from "./interface.js";

export class App {
    constructor(debug = false) {
        this.interfaces = [];
        this.debug      = debug;

        this.events     = new OnPacketEvent();
        this.AODecoder  = new AODecoder(this.events, this.debug);
        this.data       = data;

        this.PROTOCOL   = decoders.PROTOCOL;

        this.init();
    }

    init = () => {       
        let networkInterfaces = os.networkInterfaces();
        //We are going to give support for Ethernet, for now
        let foundNetwork;

        network.get_interfaces_list((error, interfaces) => {
            if(error){
                throw error;
            }

            for(let i in interfaces){
                let interfaz = interfaces[i];
                if(!interfaz["ip_address"]){
                    continue;
                }
                let IObject = new Interfaz(interfaz["ip_address"]);
                IObject.on_packet(this.onPacket);
                this.interfaces.push(IObject);
            }
        });
    }

    onPacket = (nBytes, trunc, interfazObtenida) => {
        if(interfazObtenida.linkType !== 'ETHERNET') {
            return;
        }

        let ret = decoders.Ethernet(interfazObtenida.buffer);

        if(ret.info.type !== this.PROTOCOL.ETHERNET.IPV4) {
            if(this.debug) {
                console.log('Unsupported Ethertype: ' + this.PROTOCOL.ETHERNET[ret.info.type]);
            }

            return;
        }

        ret = decoders.IPV4(interfazObtenida.buffer, ret.offset);

        if(ret.info.protocol !== this.PROTOCOL.IP.UDP) {
            if(this.debug) {
                console.log('Unsupported IPv4 protocol: ' + this.PROTOCOL.IP[ret.info.protocol]);
            }

            return;
        }

        ret = decoders.UDP(interfazObtenida.buffer, ret.offset);

        if(ret.info.srcport != 5056 && ret.info.dstport != 5056) {
            return;
        }
        if(this.debug){
            console.log("PACKET START:_____");
        }

           this.AODecoder.packetHandler(interfazObtenida.buffer.slice(ret.offset));
    }

    on(eventCode, callback){
        this.events.on(eventCode, callback);
    }

    use(callback){
        this.events.use(callback);
    }
}
