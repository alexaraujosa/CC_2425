/**
 * @module UDP
 * Common definitions for UDP connections. Used in both the AGENT and SERVER solutions for the implementation
 * of UDP Clients and Servers, respectively.
 * 
 * @copyright Copyright (c) 2024 DarkenLM https://github.com/DarkenLM
 */

import { DefaultLogger, getOrCreateGlobalLogger } from "$common/util/logger.js";
import dgram from "dgram";

/**
 * This class is a wrapper around a UDP Socket that represents a UDP Connection.
 * 
 * A UDPConnection cannot be directly instantiated, and needs to be extended and implemented before being usable.
 * 
 * A UDPConnection automatically binds most used events to their respective method handlers, which can be implemented
 * by any subclass.
 */
abstract class UDPConnection {
    /**
     * The socket used for this UDP connection.
     */
    protected socket: dgram.Socket;

    /**
     * An easy access point to the global logger instance. 
     */
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
    protected abstract onError(err: Error): void;

    /**
     * Event method fired when a message is received by the UDP connection.  
     * **NOTE:** This event is fired for the BASE socket for this connection. Custom sockets MUST be handled by the specializer.
     * 
     * @param msg A Buffer instance containing the byte stream payload.
     * @param rinfo An object containing metadata about the remote connection.
     */
    protected abstract onMessage(msg: Buffer, rinfo: dgram.RemoteInfo): void;

    /**
     * Event method fired when the UDP connection is initialized and ready to listen for connections. 
     * This event is only fired once.
     */
    protected onListen() {};

    /**
     * Event method fired when the UDP connection is closed.
     * This event is only fired once.
     */
    protected onClose() {};
}

// export type { RemoteInfo } from "dgram";
export {
    UDPConnection
};