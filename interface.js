import pack from "cap";
const {Cap, decoders} = pack;

export const BUFF_SIZE = 10 * 1024 * 1024;
export const PACKET_FILTER = 'udp and (dst port 5056 or src port 5056)';

/**
 * Class Interfaz (I wanted to name it Interface but for obvious reasons I couldn't so we are sticking with Spanish on this one)
 * it represents a network interface, done to address packet handling for multiple interfaces
 */
export class Interfaz{
    personal_cap = new Cap();
    ip_address = "";
    device = null;
    buffer = null;
    linkType = null;

    constructor(ip_address){
        this.ip_address = ip_address;
        this.device = Cap.findDevice(this.ip_address);
        if(!this.device){
            throw new Error("Couldn't get IP Address");
        }

        this.buffer = Buffer.alloc(65535);
        this.linkType = this.personal_cap.open(this.device, PACKET_FILTER, BUFF_SIZE, this.buffer);
        this.personal_cap.setMinBytes && this.personal_cap.setMinBytes(0);
        
    }

    on_packet(funcion){
        this.personal_cap.on("packet", (nBytes, trunc)=>{
            funcion(nBytes, trunc, this);
        });
    }
}