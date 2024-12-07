import { AlertFlow } from "$common/datagram/AlertFlow.js";
import { ConnectionTarget, RemoteInfo } from "$common/protocol/connection.js";
import { TCPConnection } from "$common/protocol/tcp.js";
import { DefaultLogger, getOrCreateGlobalLogger } from "$common/util/logger.js";
import net from "net";
import { BufferReader } from "$common/util/buffer.js";
import { IgnoreValues } from "$common/datagram/spack.js";
import { DatabaseDAO } from "$common/db/databaseDAO.js";

const TCP_SERVER_EVENT_CLOSED = "__server_closed__";

/**
 * This class represents a TCPConnection between the server and a given client.
 * 
 * This connection is opened by the server upon triggering {@link TCPServer.onSocketConnection|onSocketConnection}
 * by a client initializing a connection with the server.
 */
class TCPServerConnection extends TCPConnection {
    protected _id: number;
    protected connected: boolean;
    protected closed: boolean;
    private db: DatabaseDAO;
    private dbMapper: Map<string, number>;
    public target: ConnectionTarget;

    constructor(socket: net.Socket, id: number, db: DatabaseDAO, dbMapper: Map<string, number>) {
        super(socket);
        
        this._id = id;
        this.connected = true;
        this.closed = false;
        this.db = db;
        this.dbMapper = dbMapper;
        this.target = new ConnectionTarget({
            address: socket.remoteAddress ?? "",
            family: <RemoteInfo["family"]>socket.remoteFamily ?? "IPv4",
            port: socket.remotePort ?? 0,
            size: 0
        });
    }

    /**
     * Returns the unique identifier for this particular connection.
     */
    public get id(): number {
        return this.id;
    }

    /**
     * Returns a boolean indicating whether the socket has already established a connection and is ready
     * to send and receive packets.
     */
    public isConnected(): boolean {
        return this.connected;
    }

    /**
     * Returns a boolean indicating whether the socket has already been closed and can no longer be used.
     */
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
    
    protected async onMessage(msg: Buffer): Promise<void> {
        this.logger.info(`TCP Server Socket #${this._id} got message from target:`, msg.toString("utf8"));
        
        const reader = new BufferReader(msg);
        while(!reader.eof()) {
            while(!reader.eof() && reader.peek() !== 65) {
                reader.readUInt8();
            }

            if (reader.eof())  break;
            if (AlertFlow.verifySignature(reader)) {
                const afRequest = AlertFlow.deserialize(reader, config.tasks);
                const alertMetrics = afRequest.getMetrics();

                const device = await this.db.getDeviceBySession(afRequest.getSessionId());
                if(!device){
                    throw new Error(`Device does not exists`);
                }

                if (alertMetrics.device_metrics) {
                    for (const key in alertMetrics.device_metrics) {
                        if (key !== "interface_stats") {
                            const value = alertMetrics.device_metrics[key as keyof typeof alertMetrics.device_metrics];

                            if (value && value !== IgnoreValues.s8) {
                                this.logger.pWarn(`Alert from Agent with device '${device?.id}' task '${afRequest.getTaskId()}' on metric '${key}': ${value}`);
                                await this.db.addMetricsToExisting(
                                    <number> this.dbMapper.get(afRequest.getTaskId()), 
                                    device!.id, 
                                    { [key] : { valor: <number>value, timestamp: new Date(), alert: true } }
                                );
                            }
                        } else {    
                            for (const networkInterface in alertMetrics.device_metrics.interface_stats) {
                                const value = alertMetrics.device_metrics.interface_stats[networkInterface];

                                if (value && value !== IgnoreValues.s8) {
                                    this.logger.pWarn(`Alert from Agent with device '${device?.id}' task '${afRequest.getTaskId()}' on interface '${networkInterface}': ${value}`);
                                    // await this.db.addMetricsToExisting(
                                    //     <number> this.dbMapper.get(afRequest.getTaskId()), 
                                    //     <number> device?.id, 
                                    //     { [key] : { valor: <number>value, timestamp: new Date(), alert: true } }
                                    // );
                                }
                            }
                        }
                    }
                }

                if (alertMetrics.link_metrics) {
                    for (const key in alertMetrics.link_metrics) {
                        let value = alertMetrics.link_metrics[key as keyof typeof alertMetrics.link_metrics] as number;

                        if (value && value !== IgnoreValues.s16) {
                            value = value - 1;
                            this.logger.pWarn(`Alert from Agent with device '${device?.id}' task '${afRequest.getTaskId()}' on metric '${key}: ${value}`);
                            await this.db.addMetricsToExisting(
                                <number> this.dbMapper.get(afRequest.getTaskId()), 
                                device!.id, 
                                { [key] : { valor: <number>value, timestamp: new Date(), alert: true } }
                            );
                        }
                    }
                }

                this.logger.info("Alert inserted.");
            }
        }
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
     * use {@link TCPServerConnection.destroy|destroy} to ensure proper connection closing.
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

/**
 * A TCP Server with integrated events and asynchronous flow control.
 * 
 * @example
 * const server = new TCPServer().listen(new ConnectionTarget(ADDRESS, PORT));
 */
class TCPServer {
    /**
     * The {@link net.Server} used for this TCP connection.
     */
    protected server: net.Server;

    /**
     * An easy access point to the global logger instance. 
     */
    protected logger: DefaultLogger;

    /**
     * Idfk.
     */
    // TODO: Dielete?
    protected seq: number;

    /**
     * A map containing all currently active connections within the server.
     */
    protected connections: Map<number, TCPServerConnection>;

    /**
     * A map that allows the conversion of the config task ids to the database task ids.
     */
    protected dbMapper: Map<string, number>;

    /**
     * Server database
     */
    private db: DatabaseDAO;

    /**
     * A pointer to the fallback method used in case the "close" event is triggered by an external source 
     * in a non-gracious manner.
     */
    private _onClose: typeof this.onClose;

    public constructor(dbMapper: Map<string,number>, db: DatabaseDAO) {
        this.server = net.createServer();
        this.logger = getOrCreateGlobalLogger();
        this.seq = 0;
        this.connections = new Map();
        this.dbMapper = dbMapper;
        this.db = db;

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

        // TODO: Validar na base de dados se o device existe. Se não existir, é porque não fez o Registo pelo NetTask.
        // TODO: Portanto, fechar a conexão. Se existir, deixar passar.

        const conn = new TCPServerConnection(socket, this.seq++, this.db, this.dbMapper);
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