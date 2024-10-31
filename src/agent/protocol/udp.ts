/**
 * @module UDP
 * UDP Client implementation.
 * 
 * Copyright (c) 2024 DarkenLM https://github.com/DarkenLM
 */

import { ConnectionTarget } from "$common/protocol/connection.js";
import { UDPConnection } from "$common/protocol/udp.js";
import { RemoteInfo } from "dgram";

/**
 * A UDP Client with integrated events and asynchronous flow control.
 * 
 * @example
 * const client = new UDPClient().connect(new ConnectionTarget(ADDRESS, PORT));
 * client.send(Buffer.from("Hello world!"))
 */
class UDPClient extends UDPConnection {
    private target!: ConnectionTarget;

    public constructor() {
        super();
    }
    
    public onError(err: Error): void {
        this.logger.error("UDP Client got an error:", err);
    }

    public onMessage(msg: Buffer, rinfo: RemoteInfo): void {
        if (!this.target.match(rinfo)) {
            this.logger.info(`Ignored message from ${ConnectionTarget.toQualifiedName(rinfo)}: Not from target.`);
        }

        this.logger.info(`UDP Client got message from target:`, msg.toString("utf8"));
    }

    /**
     * Sends a payload to the target.
     * @param payload A Buffer containing the payload data.
     */
    public send(payload: Buffer): void {
        this.socket.send(payload, this.target.port, this.target.address);
    }

    /**
     * Opens a connection to a given target on a given port.
     * @param target The remote target to connect to.
     */
    public connect(target: ConnectionTarget) {
        this.target = target;
    }
}

export { UDPClient };