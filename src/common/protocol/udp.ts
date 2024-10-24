import { DefaultLogger, getOrCreateGlobalLogger } from "$common/util/logger.js";
import dgram from "dgram";

abstract class UDPConnection {
    protected socket: dgram.Socket;
    protected logger: DefaultLogger;

    public constructor() {
        this.socket = dgram.createSocket("udp4");
        this.logger = getOrCreateGlobalLogger();

        this.socket.on("error", this.onError.bind(this));
        this.socket.on("message", this.onMessage.bind(this));
        this.socket.on("listening", this.onListen.bind(this));
        this.socket.on("close", this.onClose.bind(this));
    }

    /**
     * Event method fired when an error occurs within the UDP connection.
     * 
     * @param err The error that was passed to this event.
     */
    public abstract onError(err: Error): void;

    /**
     * Event method fired when a message is received by the UDP connection.  
     * **NOTE:** This event is fired for the BASE socket for this connection. Custom sockets MUST be handled by the specializer.
     * 
     * @param msg A Buffer instance containing the byte stream payload.
     * @param rinfo An object containing metadata about the remote connection.
     */
    public abstract onMessage(msg: Buffer, rinfo: dgram.RemoteInfo): void;

    /**
     * Event method fired when the UDP connection is initialized and ready to listen for connections. 
     * This event is only fired once.
     */
    public onListen() {};
    // public abstract onListen(): void;

    /**
     * Event method fired when the UDP connection is closed.
     * This event is only fired once.
     */
    public onClose() {};
}

export type { RemoteInfo } from "dgram";
export {
    UDPConnection
};