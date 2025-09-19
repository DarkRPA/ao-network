import EventEmitter from 'events';

export class OnPacketEvent extends EventEmitter {
    emitPacketEvent(event, context) {
        this.emit(event, context);
        this.emit('*', { event, context });
    }

    use(callback = () => {}) {
        this.on('*', callback);
    }
}