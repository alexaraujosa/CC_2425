/**
 * @module TCP
 * TCP Client implementation.
 * 
 * Copyright (c) 2024 DarkenLM https://github.com/DarkenLM
 */

import net from "net";
import { TCPConnection } from "$common/protocol/tcp.js";
import { ConnectionTarget } from "$common/protocol/connection.js";

/**
 * A TCP Client with integrated events and asynchronous flow control.
 * 
 * @example
 * const client = new TCPClient().connect(new ConnectionTarget(ADDRESS, PORT));
 * client.send(Buffer.from("Hello world!"))
 */
class TCPClient extends TCPConnection {
    protected connected: boolean;

    constructor() {
        const socket = new net.Socket();
        super(socket);

        this.connected = false;
    }

    /**
     * Returns a boolean indicating whether the socket has already established a connection and is ready
     * to send and receive packets.
     */
    public isConnected(): boolean {
        return this.connected;
    }

    public onError(err: Error): void {
        this.logger.error("TCP Client got an error:", err);
    }
    
    public onMessage(msg: Buffer): void {
        this.logger.info(`TCP Client got message from target:`, msg.toString("utf8"));
    }

    public onSocketConnection(): void {
        this.connected = true;
    }

    /**
     * Sends a payload to the target.
     * @param payload A Buffer containing the payload data.
     */
    public send(payload: Buffer): void {
        if (!this.connected) return;

        this.socket.write(payload);
    }

    /**
     * Opens a connection to a given target on a given port.
     * @param target The remote target to connect to.
     */
    public async connect(target: ConnectionTarget) {
        return new Promise((resolve) => {
            this.logger.log("TCP Client target:", target.qualifiedName);

            this.socket.once("connect", resolve);
            this.socket.connect({
                host: target.address,
                port: target.port
            });
        });
    }
}

export {
    TCPClient
};