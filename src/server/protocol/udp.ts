import crypto from "crypto";
import { NetTask, NetTaskDatagramType, NetTaskRegister, NetTaskRegisterChallenge, NetTaskRegisterChallenge2, NetTaskPushSchemas, NetTaskRejected, NetTaskMetric, NetTaskRejectedReason, NetTaskWake, NetTaskBodyless, NetTaskReset } from "$common/datagram/NetTask.js";
import { ConnectionTarget, ConnectionTargetLike, RemoteInfo } from "$common/protocol/connection.js";
import { ChallengeControl, ECDHE } from "$common/protocol/ecdhe.js";
import { UDPConnection } from "$common/protocol/udp.js";
import { BufferReader } from "$common/util/buffer.js";
import { createDevice, deviceToString } from "$common/db/interfaces/IDevice.js";
import { DatabaseDAO } from "$common/db/databaseDAO.js";
import { IgnoreValues, packTaskSchemas } from "$common/datagram/spack.js";
import { createMetrics } from "$common/db/interfaces/IMetrics.js";
import { DuplicatedPackageError, FlowControl, MaxRetransmissionsReachedError, OutOfOrderPackageError, ReachedMaxWindowError } from "$common/protocol/flowControl.js";
import { subscribeShutdown } from "$common/util/shutdown.js";

interface ClientData {
    flowControl: FlowControl, 
    ecdhe: ECDHE, 
    salt: Buffer, 
    challenge?: ChallengeControl,
    contiguousErrors: number
}

/**
 * Maximum number of back-to-back errors allowed per client before the connection is forcefully reset.
 */
const MAX_CONTIGUOUS_ERRORS = 10;

/**
 * This class is meant to be used as a base for UDP Server implementations.
 */
class UDPServer extends UDPConnection {
    // private clients: Map<string, {flowControl: FlowControl, ecdhe: ECDHE, salt: Buffer, challenge?: ChallengeControl }>;
    private clients: Map<string, ClientData>;
    private db: DatabaseDAO;
    private devicesNames: Record<string, string>;
    private sessionIds: Record<string, Buffer>;
    private dbMapper: Map<string, number>;

    public constructor(db: DatabaseDAO, dbMapper: Map<string, number>) {
        super();

        this.clients = new Map();
        this.db = db;
        this.devicesNames = Object.fromEntries(Object.entries(config.devices).map(([k,v]) => [v.ip, k]));
        this.sessionIds = {};
        this.dbMapper = dbMapper;

        subscribeShutdown(async () => {
            
        });
    }

    public onError(err: Error): void {
        this.logger.error("UDP Server got an error:", err);
    }

    /**
     * Starts the UDP server.
     * 
     * @param port The port number for the UDP server to listen.
     */
    public listen(port: number) {
        this.socket.bind(port);
    }

    public onListen(): void {
        const address = this.socket.address();
        this.logger.log(`UDP server listening at ${address.address}:${address.port}`);
    }

    /**
     * Sends a payload
     * @param payload 
     */
    public send(flowControl: FlowControl, dg?: NetTask, target?: ConnectionTargetLike) {
        if(!target){
            throw new Error(`You cant send a packet to the void...`);
        }

        try{
            const dgToSend = flowControl.controlledSend(dg);
            
            // this.logger.log(`---------- PACOTE ENVIADO ----------`);
            // this.logger.log(dgToSend.toString());
            // this.logger.log(`-------------------------------------`); 
            
            if(dgToSend.getSequenceNumber() >= flowControl.getLastSeq()){
                flowControl.readyToSend(dgToSend);
            }

            if(
                dgToSend.getType() === NetTaskDatagramType.BODYLESS 
                || dgToSend.getType() === NetTaskDatagramType.WAKE 
                || dgToSend.getType() === NetTaskDatagramType.CONNECTION_REJECTED
            ) {
                //@ts-expect-error STFU Typescript.
                this.socket.send(dgToSend.serialize(), target.port, target.address);
                return;
            }
            //@ts-expect-error STFU Typescript.
            this.socket.send(dgToSend.serialize(), target.port, target.address);
            
            flowControl.startTimer(dgToSend, (seq) => {
                this.handleTimeout(flowControl, seq, target);
            }); 
        } catch (error) {
            if ( error instanceof ReachedMaxWindowError)
                return;
            if ( error instanceof MaxRetransmissionsReachedError){
                this.logger.warn("Agent is not responding to meeee...");
                this.socket.close();
                return;
            }
        }
    }

    public async onMessage(msg: Buffer, rinfo: RemoteInfo): Promise<void> {
        // this.logger.log(`UDP Server got: ${msg} from ${ConnectionTarget.toQualifiedName(rinfo)}`);
        const reader = new BufferReader(msg);

        while (!reader.eof()) {
            // For error recovery below
            let _nt: NetTask | undefined;

            try {
                while (!reader.eof() && reader.peek() !== 78) reader.readUInt8();

                if (reader.eof())  break;

                this.logger.log(`UDP Server reader peek:`, reader.peek().toString(16));

                //#endregion ============== NETFLOW ==============
                if (reader.peek() === 78 && NetTask.verifySignature(reader)) {
                    // const header = NetTask.deserializeHeader(reader);

                    //@ts-expect-error stfu
                    this.logger.log("[SERVER] COMPLETE PAYLOAD:", reader.buffer.toString("hex").match(/../g)?.join(" "));

                    let payload: Buffer;
                    const pHeader = NetTask.deserializePublicHeader(reader);
                    this.logger.log(`[SERVER] UDP Server public header:`, pHeader);

                    if (!this.sessionIds[ConnectionTarget.toQualifiedName(rinfo)]) {
                        this.sessionIds[ConnectionTarget.toQualifiedName(rinfo)] = pHeader.sessionId;
                    }

                    if (NetTask.isEncrypted(pHeader)) {
                        let client = this.clients.get(pHeader.sessionId.toString("hex"));
                        if (!client) {
                            const device = await this.db.getDeviceBySession(pHeader.sessionId);
                            if (!device) throw new Error(
                                `[SERVER] Authentication error: Unknown client '${pHeader.sessionId.toString("hex")}'`
                            );

                            client = {
                                flowControl: new FlowControl(),
                                ecdhe: new ECDHE(device.auth.secret, device.auth.salt),
                                salt: device.auth.salt,
                                challenge: undefined,
                                contiguousErrors: 0
                            };
                            this.clients.set(pHeader.sessionId.toString("hex"), client);
                        }

                        try {
                            const rawPayload = reader.read(pHeader.payloadSize);
                            this.logger.log("[SERVER] ENC PAYLOAD:", rawPayload.toString("hex").match(/../g)?.join(" "));

                            const envelope = ECDHE.deserializeEncryptedMessage(rawPayload);
                            this.logger.log("[SERVER] ENVMSG:", envelope);
                            payload = client.ecdhe.deenvelope(envelope);
                        } catch (e) {
                            throw new Error(`[SERVER] Authentication error: Crypto error.`, { cause: e });
                        }
                    } else {
                        payload = reader.read(pHeader.payloadSize);
                    }

                    const payloadReader = new BufferReader(payload);
                    const nt = NetTask.deserializePrivateHeader(payloadReader, pHeader);
                    _nt = nt;

                    this.logger.log(`UDP Server header:`, nt);
                    
                    const client = this.clients.get(pHeader.sessionId.toString("hex"));
                    if(client){
                        try {
                            //Fragmentando tenho de criar o pacote
                            
                            client.flowControl.evaluateConnection(_nt);
                            client.contiguousErrors = 0;
                        } catch (error) {
                            // if (error instanceof ConnectionRejected) {
                            //     this.logger.error(error.message);
                            //     break;
                            // }
                            if (error instanceof DuplicatedPackageError) {
                                this.logger.error("Duplicated package:", error.message);
                                client.contiguousErrors++;
                                break;
                            } else if (error instanceof OutOfOrderPackageError) {
                                this.logger.error("Out-of-order package:", error.message);

                                client.contiguousErrors++;

                                const retransmission = new NetTaskBodyless(
                                    pHeader.sessionId,
                                    client.flowControl.getLastSeq(),
                                    0,
                                    client.flowControl.getLastAck() + 1,
                                );
                                this.send(client.flowControl, retransmission, rinfo);
                                break;
                            } else {
                                this.logger.error("An unexpected error occurred:", error);
                                break;
                            }
                        }

                        if (client.contiguousErrors > MAX_CONTIGUOUS_ERRORS) {
                            this.logger.warn(
                                `[SERVER] Client ${pHeader.sessionId} @ ${
                                    ConnectionTarget.toQualifiedName(rinfo)
                                } exceeded error limit. Resetting connection.`);
                                
                            const resetBg = new NetTaskReset(
                                pHeader.sessionId,
                                client.flowControl.getLastSeq(),
                                client.flowControl.getLastAck()
                            ).link(client.ecdhe);
                            this.send(client.flowControl, resetBg, rinfo);
                            break;
                        }
                    }

                    // this.logger.log(`---------- PACOTE RECEBIDO ----------`);
                    // this.logger.log(nt.toString());
                    // this.logger.log(`-------------------------------------`); 

                    switch (nt.getType()) {

                        /**
                         * Second phase of the Registration Process, where the Server, after receiving the Agent Public Key,
                         * verifies if the device exists in the config. If it does not, the connection is rejected. Otherwise, it
                         * creates an ecdhe link for the Agent and a challenge using 12 random bytes. Afterwards, a Register
                         * Challenge Datagram is created, containing the Server Public Key, the challenge and the ecdhe link.
                         * Before sending that datagram, the server saves the agent ecdhe, that will be used on the fourth phase.
                         */
                        case NetTaskDatagramType.REQUEST_REGISTER: {
                            const registerDg = NetTaskRegister.deserialize(payloadReader, nt);

                            this.logger.log("[SERVER] [REQUEST_REGISTER] Req:", registerDg);

                            const flowControl = new FlowControl();

                            let exists = false;
                            for (const device of Object.values(config.devices)) {
                                if (device.ip === rinfo.address)
                                    exists = true;
                            }
                            if (!exists) {
                                // const rejectedDg = new NetTask(
                                //     nt.getSessionId(),
                                //     NET_TASK_NOCRYPTO,
                                //     123123, 
                                //     123123, 
                                //     false, 
                                //     NetTaskDatagramType.CONNECTION_REJECTED, 
                                //     0
                                // );
                                const rejectedDg = new NetTaskRejected(
                                    nt.getSessionId(),
                                    0,
                                    0,
                                    0,
                                    NetTaskRejectedReason.AUTH_ERROR
                                );
                                this.send(flowControl, rejectedDg, rinfo);
                                break;
                            }

                            const ecdhe = new ECDHE("secp128r1");
                            const salt = ecdhe.link(registerDg.publicKey);
                            const challenge = ecdhe.generateChallenge(crypto.randomBytes(12));

                            this.clients.set(
                                nt.getSessionId().toString("hex"), 
                                { flowControl, ecdhe, salt, challenge: challenge, contiguousErrors: 0 }
                            );
            
                            const client = this.clients.get(nt.getSessionId().toString("hex"));

                            if(!client){
                                throw new Error(`Agent not found!`);
                            }

                            client.flowControl.setLastAck(nt.getSequenceNumber());
                            const regChallengeDg = new NetTaskRegisterChallenge(
                                nt.getSessionId(),
                                client.flowControl.getLastSeq(), 
                                client.flowControl.getLastAck(),
                                0,
                                false,
                                0,
                                ecdhe.publicKey, 
                                ECDHE.serializeChallenge(challenge.challenge),
                                salt
                            );


                            this.logger.log("[SERVER] Second register phase:", regChallengeDg);
                            // this.clients.set(ConnectionTarget.toQualifiedName(rinfo), { ecdhe, salt, challenge: challenge });
                            this.send(client.flowControl, regChallengeDg, rinfo);
                            break;
                        }

                        /**
                         * Fourth and last phase of the Registration Process, where the Server, after receiving the confirmed 
                         * challenge from the Agent, confirms the received challenge. If it's not valid, the Server sends
                         * a Datagram informing the closure of the connection. Otherwise, the Registration Process is 
                         * successfully completed and the Agent is inserted into the database and is ready to receive tasks.
                         */
                        case NetTaskDatagramType.REGISTER_CHALLENGE2: {
                            const regChallenge2Dg = NetTaskRegisterChallenge2.deserialize(payloadReader, nt);

                            // const client = this.clients.get(ConnectionTarget.toQualifiedName(rinfo));
                            const client = this.clients.get(nt.getSessionId().toString("hex"));
                            if(!client){
                                throw new Error(`Agent not found!`);
                            }

                            this.logger.log("[SERVER] Start fourth register phase:", client);
                            const confirm = client?.ecdhe.confirmChallenge(ECDHE.deserializeChallenge(regChallenge2Dg.challenge), client.challenge!);
                            
                            
                            this.logger.log("[SERVER] Challenge confirmed:", confirm);
                            if (!confirm) {
                                // const rejectedDg = new NetTask(123123, 123123, false, NetTaskDatagramType.CONNECTION_REJECTED, 0);
                                // this.send(rejectedDg.serializeHeader(NET_TASK_NOCRYPTO), rinfo);

                                const rejectedDg = new NetTaskRejected(
                                    nt.getSessionId(),
                                    0,
                                    0,
                                    0,
                                    NetTaskRejectedReason.CRYPTO_ERROR
                                );
                                this.send(new FlowControl(), rejectedDg, rinfo);
                                break;
                            }

                            client?.ecdhe.regenerateKeys(client.challenge!.control);

                            // const device = createDevice(
                            //     rinfo.address,
                            //     rinfo.port,
                            //     <Buffer> client?.ecdhe.secret,
                            //     // <Buffer> client?.salt,
                            //     // <Buffer> client?.ecdhe.generateSessionId(client.salt),
                            //     client!.challenge!.control,
                            //     nt.getSessionId(),
                            //     new Date()
                            // );
                            let device;
                            const _device = await this.db.getDeviceBySession(nt.getSessionId());
                            
                            if (_device) {
                                device = _device;
                                device.ip = rinfo.address;
                                device.port = rinfo.port;

                                device.auth.secret = client!.ecdhe.secret!;
                                device.auth.salt = client!.challenge!.control;
                            } else {
                                device = createDevice(
                                    rinfo.address,
                                    rinfo.port,
                                    <Buffer> client?.ecdhe.secret,
                                    client!.challenge!.control,
                                    nt.getSessionId(),
                                    new Date()
                                );
                            }

                            const deviceId = await this.db.storeDevice(device);
                            this.logger.info("[SERVER] Stored device with ID: " + deviceId);

                            const deviceById = await this.db.getDeviceByID(deviceId);
                            if(deviceById) this.logger.info("[SERVER] Retrieved Device by ID:", deviceToString(deviceById));

                            // const requestTaskDg = new NetTaskPushSchemas(123123, 123123, false, 0, "e que").link(client!.ecdhe);

                            // const task = config.tasks["task1"];
                            const cDevice = config.devices[this.devicesNames[rinfo.address]];
                            const tasks = Object.fromEntries(Object.entries(config.tasks).filter(([k,_]) => cDevice.tasks.includes(k)));

                            for (const [taskConfigId, task] of Object.entries(tasks)) {
                                const taskDatabaseId = this.dbMapper.get(taskConfigId);
                                const metrics: string[] = [];
                                for (const key in task.device_metrics)
                                    if (task.device_metrics[key as keyof typeof task.device_metrics])
                                        metrics.push(key);

                                for (const key in task.link_metrics)
                                    if (task.link_metrics[key as keyof typeof task.link_metrics])
                                        metrics.push(key);

                                const device = await this.db.getDeviceByIP(rinfo.address);
                                if(!device){
                                    throw new Error(`Device not found!`);
                                }
                                const iMetric = createMetrics(
                                    <number> taskDatabaseId,
                                    device.id,
                                    metrics
                                );

                                await this.db.storeMetrics(iMetric);
                            }
                        
                            this.logger.info("=========TABELAS DE METRICAS CRIADAS==========");

                            const spack = packTaskSchemas(tasks);
                            const requestTaskDg = new NetTaskPushSchemas(
                                nt.getSessionId(),
                                client.flowControl.getLastSeq(), 
                                client.flowControl.getLastAck(), 
                                0, 
                                false,
                                0, 
                                spack
                            ).link(client!.ecdhe);
                            this.send(client.flowControl, requestTaskDg, rinfo);
                            break;
                        }
                        case NetTaskDatagramType.PUSH_SCHEMAS: {
                            // Do fuck all.
                            break;
                        }
                        case NetTaskDatagramType.SEND_METRICS: {
                            const client = this.clients.get(nt.getSessionId().toString("hex"));
                            if(!client){
                                throw new Error(`Agent not found!`);
                            }
                            const metricsDg = NetTaskMetric.deserialize(payloadReader, client!.ecdhe!, nt, config.tasks);

                            const ack = new NetTaskBodyless(
                                nt.getSessionId(),
                                client.flowControl.getLastSeq(),
                                client.flowControl.getLastAck(),
                                0,
                            );
                            this.send(client.flowControl, ack, rinfo);

                            // this.logger.log("[SERVER] Got metrics:", metricsDg);
                            const metricsResult = metricsDg.getMetrics();

                            this.logger.info(metricsResult);
                            
                            // TODO: Log metrics from device X task Y

                            const metricsDb: {
                                [metricName: string] : { valor: number; timestamp: Date, alert: boolean}
                            } = {};

                            if (metricsResult.device_metrics) {
                                for (const key in metricsResult.device_metrics) {

                                    if (key !== "interface_stats") {
                                        const value = metricsResult.device_metrics[key as keyof typeof metricsResult.device_metrics];

                                        if (value && value !== IgnoreValues.s8) {
                                            metricsDb[key] = { 
                                                valor: metricsResult.device_metrics[key as keyof typeof metricsResult.device_metrics] as number, 
                                                timestamp: new Date(),
                                                alert: false 
                                            };
                                        }
                                    } else {
                                        for (const networkInterface in metricsResult.device_metrics.interface_stats) {
                                            const value = metricsResult.device_metrics.interface_stats[networkInterface];

                                            if (value && value !== IgnoreValues.s8) {
                                                this.logger.info(`Received for metric '${key}' value: ${value}`);
                                                metricsDb[key] = { 
                                                    valor: metricsResult.device_metrics.interface_stats[networkInterface], 
                                                    timestamp: new Date(),
                                                    alert: false 
                                                };
                                            }
                                        }
                                    }
                                }
                            }

                            if (metricsResult.link_metrics) {
                                for (const key in metricsResult.link_metrics) {
                                    let value = metricsResult.link_metrics[key as keyof typeof metricsResult.link_metrics] as number;
                                    if (value && value !== IgnoreValues.s16) {
                                        value = value - 1;
                                        this.logger.info(`Received for metric '${key}' value: ${value}`);
                                        metricsDb[key] = { 
                                            valor: value, 
                                            timestamp: new Date(),
                                            alert: false 
                                        };
                                    }
                                }
                            }

                            await this.db.addMetricsToExisting(
                                <number> this.dbMapper.get(metricsDg.getTaskId()),
                                nt.getSessionId(),
                                metricsDb
                            );

                            this.logger.info("Updated metrics.");
                            break;
                        }
                        case NetTaskDatagramType.WAKE: {
                            const client = this.clients.get(nt.getSessionId().toString("hex"));
                            
                            this.logger.info("[SERVER] Got Wake packet.");
                            try {
                                // Ignore, because no real payload is sent, just a sanity test.
                                NetTaskWake.deserialize(payloadReader, client!.ecdhe!, nt);
                            } catch(e) {
                                this.logger.error("[SERVER] Invalid wake packet:", e);

                                const rejectedDg = new NetTaskRejected(
                                    nt.getSessionId(),
                                    client!.flowControl.getLastSeq(),
                                    client!.flowControl.getLastAck(),
                                    0,
                                    NetTaskRejectedReason.CRYPTO_ERROR
                                );
                                this.send(client!.flowControl, rejectedDg, rinfo);
                            }

                            this.logger.success("Wake packet is valid.");

                            const newSeq = NetTaskWake.makeNewSeq();
                            const wakeDg = new NetTaskWake(
                                nt.getSessionId(),
                                client!.flowControl.getLastSeq(),
                                client!.flowControl.getLastAck(),
                                newSeq
                            ).link(client!.ecdhe);

                            this.send(client!.flowControl, wakeDg, rinfo);
                            client!.flowControl.reset(newSeq);
                            // client!.flowControl.setLastSeq(newSeq);

                            break;
                        }
                        case NetTaskDatagramType.BODYLESS: {
                            const client = this.clients.get(nt.getSessionId().toString("hex"));
                            if(!client){
                                throw new Error(`Agent not found!`);
                            }
                            if(nt.getNAcknowledgementNumber() != 0){
                                this.logger.warn("Pedido de retransmissão do pacote com seq:", nt.getNAcknowledgementNumber());
                                const dg = client.flowControl.getDgFromRecoveryList(nt.getNAcknowledgementNumber());
                                this.send(client.flowControl, dg, rinfo);
                                return;
                            }
                            break;
                        }
                        default: {
                            // TODO: Ignore?
                            break;
                        }
                    }

                    // Reset error recovery reference.
                    _nt = undefined;
                }
            } catch (e) {
                this.logger.pError("[AGENT] Error while processing packet:", { cause: e });

                const sessionId = _nt?.getSessionId() ?? this.sessionIds[ConnectionTarget.toQualifiedName(rinfo)];
                if (sessionId) {
                    const rejectedDg = new NetTaskRejected(
                        sessionId,
                        0,
                        0,
                        0,
                        NetTaskRejectedReason.UNKNOWN
                    );
                    this.send(new FlowControl(), rejectedDg, rinfo);
                } else {
                    this.logger.warn("[AGENT] Packet processing failed before client recognition. Silently ignoring.");
                }
                _nt = undefined;
            }
        }
    }

    private handleTimeout(flowControl: FlowControl, seqNumber: number, target: ConnectionTargetLike) {
        try {
            const dg = flowControl.getDgFromRecoveryList(seqNumber);
            this.logger.warn(`Timeout... retransmitting package ${seqNumber}`); 

            this.send(flowControl, dg, target);
    
            flowControl.startTimer(dg, (seq) => {
                this.handleTimeout(flowControl, seq, target);
            });
        } catch (error) {
            this.logger.error("Failed to retransmit package:", error);
        }
    }
}


export { 
    UDPServer 
};