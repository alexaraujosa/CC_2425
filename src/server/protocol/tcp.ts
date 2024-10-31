import { ConnectionTarget, RemoteInfo } from "$common/protocol/connection.js";
import { TCPConnection } from "$common/protocol/tcp.js";
import { DefaultLogger, getOrCreateGlobalLogger } from "$common/util/logger.js";
import net from "net";

const TCP_SERVER_EVENT_CLOSED = "__server_closed__";

class TCPServerConnection extends TCPConnection {
    protected _id: number;
    protected connected: boolean;
    protected closed: boolean;
    public target: ConnectionTarget;

    constructor(socket: net.Socket, id: number) {
        super(socket);
        
        this._id = id;
        this.connected = true;
        this.closed = false;
        this.target = new ConnectionTarget({
            address: socket.remoteAddress ?? "",
            family: <RemoteInfo["family"]>socket.remoteFamily ?? "IPv4",
            port: socket.remotePort ?? 0,
            size: 0
        });
    }

    public get id(): number {
        return this.id;
    }

    public isConnected(): boolean {
        return this.connected;
    }

    public isClosed(): boolean {
        return this.closed;
    }

    protected onClose(): void {
        this.connected = false;
        this.closed = true;
    }

    protected onError(err: Error): void {
        this.logger.error(`TCP Server Socket #${this._id} got an error:`, err);
    }
    
    protected onMessage(msg: Buffer): void {
        this.logger.info(`TCP Server Socket #${this._id} got message from target:`, msg.toString("utf8"));
        this.send(Buffer.from("Hello from TCP Server."));
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
     * *Close this connection. Thanks.*
     * 
     * Sends a FIN packet to close the connection. May not properly close the connection, 
     * use {@link TCPServerConnection.close|close} to ensure proper connection closing.
     */
    public close(callback?: () => void) {
        this.socket.end(callback);
    }

    /**
     * ***I wasn't asking.***
     * 
     * Forcibly ends the connection and destroys the socket.
     */
    public destroy(reason: string) {
        this.socket.destroy(new Error("TCP Socket was destroyed.", { cause: reason }));
    }
}

class TCPServer {
    protected server: net.Server;
    protected logger: DefaultLogger;
    protected seq: number;
    protected connections: Map<number, TCPServerConnection>;
    private _onClose: typeof this.onClose;

    public constructor() {
        this.server = net.createServer();
        this.logger = getOrCreateGlobalLogger();
        this.seq = 0;
        this.connections = new Map();

        this.server.on("listening", this.onListen.bind(this));
        this.server.on("close", (this._onClose = this.onClose.bind(this, 1000)));
        this.server.on("error", this.onError.bind(this));
        this.server.on("connection", this.onSocketConnection.bind(this));
        this.server.on("drop", this.onThreshold.bind(this));
    }

    /**
     * Event method fired when the TCP Server is initialized and ready to listen for connections. 
     * This event is only fired once.
     */
    private onListen() {
        this.logger.pInfo(`TCP Server listening at ${ConnectionTarget.toQualifiedName(<never>this.server.address())}`);
    };

    /**
     * Event method fired when the TCP Server is closed.
     * This event is only fired once.
     */
    public onClose(grace: number) {
        this.logger.info("TCP Server shutting down...");

        const destroyServer = () => {
            this.server.unref();
            this.logger.pSuccess("TCP Server successfully shutdown.");

            this.server.emit(TCP_SERVER_EVENT_CLOSED);
        };

        this.logger.info("Closing active connections...");
        
        // eslint-disable-next-line prefer-const
        let destroyServerTimeout: NodeJS.Timeout;
        for (const [conId, conn] of this.connections.entries()) {
            conn.close(() => {
                this.connections.delete(conId);

                if (this.connections.size === 0) {
                    destroyServer();
                    clearTimeout(destroyServerTimeout);
                }
            });
        }

        destroyServerTimeout = setTimeout(() => {
            if (this.connections.size === 0) return;
            this.logger.warn("Pending connections did not close on time. Forcebly destroying connections.");

            for (const conn of this.connections.values()) {
                conn.destroy("Die.");
            }

            destroyServer();
        }, grace);
    };
    

    /**
     * Event method fired when an error occurs within the TCP server.
     * 
     * @param err The error that was passed to this event.
     */
    protected onError(err: Error): void {
        this.logger.pError("TCP Server got an error:", err);
    };

    /**
     * Event method fired when a connection is received by the TCP server.
     * 
     * @param socket The socket created for the new connection.
     */
    protected onSocketConnection(socket: net.Socket) {
        const conn = new TCPServerConnection(socket, this.seq++);
        this.connections.set(this.seq, conn);

        this.logger.info("TCP Server got a new connection from:", conn.target.qualifiedName);
    };

    /**
     * Event method fired when the TCP Server reaches the maximum connection threshold and starts dropping connections. 
     */
    protected onThreshold() {
        this.logger.error("TCP Server reached maximum connection threshhold!");
    };

    /**
     * Starts the UDP server.
     * 
     * @param port The port number for the UDP server to listen.
     */
    public listen(target: ConnectionTarget) {
        this.server.listen(target.port, target.address);
    }

    /**
     * Gracefully closes the server.
     */
    public async close(): Promise<void>;
    public async close(grace: number): Promise<void>;
    public async close(grace?: number): Promise<void> {
        return new Promise((resolve) => {
            if (grace) {
                // Replace default close listener with specialized one.
                this.server.off("close", this._onClose);
                this.server.on("close", this.onClose.bind(this, grace));
            }
            
            this.server.on(TCP_SERVER_EVENT_CLOSED, resolve);
            this.server.close();
        });
    }
}

export {
    TCPServer
};