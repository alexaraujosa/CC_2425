/**
 * @module TCP
 * Common definitions for TCP connections. Used in both the AGENT and SERVER solutions for the implementation
 * of TCP Clients and Servers, respectively.
 * 
 * @copyright Copyright (c) 2024 DarkenLM https://github.com/DarkenLM
 */

import { DefaultLogger, getOrCreateGlobalLogger } from "$common/util/logger.js";
import net from "net";

/**
 * This class is a wrapper around a TCP Socket that represents a TCP Connection.
 * 
 * A TCPConnection cannot be directly instantiated, and needs to be extended and implemented before being usable.
 * 
 * A TCPConnection automatically binds most used events to their respective method handlers, which can be implemented
 * by any subclass.
 */
abstract class TCPConnection {
    /**
     * The socket used for this TCP connection.
     */
    protected socket: net.Socket;

    /**
     * An easy access point to the global logger instance. 
     */
    protected logger: DefaultLogger;

    constructor(socket: net.Socket) {
        this.socket = socket;
        this.logger = getOrCreateGlobalLogger();

        this.socket.on("error", this.onError.bind(this));
        this.socket.on("close", this.onClose.bind(this));
        this.socket.on("data", this.onMessage.bind(this));
        this.socket.on("connect", this.onSocketConnection.bind(this));
        this.socket.on("timeout", this.onTimeout.bind(this));
    }

    /**
     * Event method fired when an error occurs within the TCP connection.
     * 
     * @param err The error that was passed to this event.
     */
    protected abstract onError(err: Error): void;

    /**
     * Event method fired when a message is received by the TCP connection.  
     * **NOTE:** This event is fired for the BASE socket for this connection. Custom sockets MUST be handled by the specializer.
     * 
     * @param msg A Buffer instance containing the byte stream payload.
     * @param rinfo An object containing metadata about the remote connection.
     */
    protected abstract onMessage(msg: Buffer): void;

    /**
     * Event method fired when the TCP connection is initialized and ready to listen for connections. 
     * This event is only fired once.
     */
    protected onSocketConnection() {};

    /**
     * Event method fired when the connection is closed.
     * This event is only fired once.
     */
    protected onClose() {};

    /**
     * Event method fired when the connection times out. 
     * The connection must be explicitly closed, as this event does not automatically do so.
     */
    protected onTimeout() {};
}

export {
    TCPConnection
};