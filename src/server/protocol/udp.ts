import { ConnectionTargetLike, RemoteInfo } from "$common/protocol/connection.js";
import { UDPConnection } from "$common/protocol/udp.js";

/**
 * This class is meant to be used as a base for UDP Server implementations.
 */
// TODO: Merge into one class. Make listen consistent with TCP.
abstract class UDPServer extends UDPConnection {
    public constructor() {
        super();
    }

    /**
     * Starts the UDP server.
     * 
     * @param port The port number for the UDP server to listen.
     */
    public listen(port: number) {
        this.socket.bind(port);
    }

    /**
     * Sends a payload
     * @param payload 
     */
    public send(payload: Buffer, target: ConnectionTargetLike) {
        this.socket.send(payload, target.port, target.address);
    }
}

/**
 * A UDP Server with integrated events and asynchronous flow control.
 * 
 * @example
 * const server = new UDPServer().listen(new ConnectionTarget(ADDRESS, PORT));
 */
class TestUDPServer extends UDPServer {
    public constructor() {
        super();
    }

    public onError(err: Error): void {
        this.logger.error("UDP Server got an error:", err);
    }

    public onMessage(msg: Buffer, rinfo: RemoteInfo): void {
        this.logger.log(`UDP Server got: ${msg} from ${rinfo.address}:${rinfo.port}`);

        this.send(Buffer.from("Hello from UDP Server."), rinfo);
    }

    public onListen(): void {
        const address = this.socket.address();
        this.logger.log(`UDP server listening at ${address.address}:${address.port}`);
    }
}

export { 
    TestUDPServer 
};