/**
 * @module UDP
 * UDP Client implementation.
 * 
 * @copyright Copyright (c) 2024 DarkenLM https://github.com/DarkenLM
 */

import fs from "fs";
import { NetTask, NetTaskDatagramType, NetTaskRegister, NetTaskRegisterChallenge, NetTaskRegisterChallenge2, NetTaskPushSchemas, NetTaskRejected, NetTaskRejectedReason, NetTaskWake, NetTaskBodyless, NetTaskReset } from "$common/datagram/NetTask.js";
import { ConnectionTarget } from "$common/protocol/connection.js";
import { ECDHE } from "$common/protocol/ecdhe.js";
import { UDPConnection } from "$common/protocol/udp.js";
import { BufferReader, bufferXOR } from "$common/util/buffer.js";
import { RemoteInfo } from "dgram";
import { executeTask } from "../executor.js";
import { TCPClient } from "./tcp.js";
import { DuplicatedPackageError, FlowControl, MaxRetransmissionsReachedError, OutOfOrderPackageError, ReachedMaxWindowError } from "$common/protocol/flowControl.js";
import { subscribeShutdown } from "../../common/util/shutdown.js";

const ECDHE_ALGO = "secp128r1";

interface Keystore {
    sessionId: Buffer
    secret: Buffer
    salt: Buffer
}

/**
 * A UDP Client with integrated events and asynchronous flow control.
 * 
 * @example
 * const client = new UDPClient().connect(new ConnectionTarget(ADDRESS, PORT));
 * client.send(Buffer.from("Hello world!"))
 */
class UDPClient extends UDPConnection {
    private target!: ConnectionTarget;
    private _ecdhe: ECDHE;
    private _tcpClient: TCPClient;
    private _flowControl: FlowControl;
    private keystore: string;
    private sessionId?: Buffer;
    private challengeSalt?: Buffer;
    private wake: boolean;

    public constructor(keystore: string, tcpClient: TCPClient) {
        super();

        this._flowControl = new FlowControl();
        this.keystore = keystore;
        this._tcpClient = tcpClient;
        // Connection keys present. Attempt to revive connection.
        if (fs.existsSync(keystore)) {
            this.logger.info("[AGENT] A keystore already exists. Attempting to load connection keys from keystore.");
            
            const serKS = fs.readFileSync(keystore);
            const ksBuf = bufferXOR(
                serKS, 
                Buffer.from(Buffer.alloc(serKS.byteLength).fill(0x69))
            ).toString("utf8").split("").toReversed().join("");

            const ksPayload: Keystore = JSON.parse(ksBuf);
            ksPayload.sessionId = Buffer.from(<string><never>ksPayload.sessionId, "base64url");
            ksPayload.secret = Buffer.from(<string><never>ksPayload.secret, "base64url");
            ksPayload.salt = Buffer.from(<string><never>ksPayload.salt, "base64url");

            this.logger.log("UDP SERVER KEYSTORE:", ksPayload);

            this._ecdhe = new ECDHE(ksPayload.secret, ksPayload.salt);
            this.sessionId = ksPayload.sessionId;
            this.challengeSalt = ksPayload.salt;
            this.wake = true;

            this.logger.success("[AGENT] Successfully loaded keystore from disk.");
            
            // process.exit(1);
        } else {
            this._ecdhe = new ECDHE(ECDHE_ALGO);
            this.wake = false;
        }

        subscribeShutdown(() => {
            this.logger.info("UDP Client shutting down.");

            if (this._ecdhe.initialized && this.sessionId && this.challengeSalt) {
                this.saveConnection();
            }
        });

        this.logger.success("UDP server subscribed to shitdown hook.");
    }

    public get tcpClient(): TCPClient { return this._tcpClient; }
    public get ecdhe(): ECDHE { return this._ecdhe; }
    public get flowControl(): FlowControl { return this._flowControl; }

    public saveConnection() {
        if (!this._ecdhe.initialized || !this.sessionId || !this.challengeSalt) return;

        this.logger.info("Storing connection keys on keystore.");
        const ksPayload = {
            sessionId: this.sessionId.toString("base64url"),
            secret: this._ecdhe.secret!.toString("base64url"),
            salt: this.challengeSalt.toString("base64url")
        };

        const ksBuf = Buffer.from(JSON.stringify(ksPayload).split("").toReversed().join(""));
        const serKS = bufferXOR(
            ksBuf, 
            Buffer.from(Buffer.alloc(ksBuf.byteLength).fill(0x69))
        );
        
        fs.writeFileSync(this.keystore, serKS, "binary");
        this.logger.success("Successfully stored connection keys.");
    }
    
    public onError(err: Error): void {
        this.logger.error("UDP Client got an error:", err);
    }

    public async onMessage(msg: Buffer, rinfo: RemoteInfo): Promise<void> {
        if (!this.target.match(rinfo)) {
            this.logger.info(`Ignored message from ${ConnectionTarget.toQualifiedName(rinfo)}: Not from target.`);
        }

        // this.logger.info(`UDP Client got message from target:`, msg.toString("utf8"));
        // this.logger.info(`[AGENT] UDP Client got message from target:`, (msg.toString("hex").match(/../g) || []).join(""));

        const reader = new BufferReader(msg);
        while (!reader.eof()) {
            while (!reader.eof() && reader.peek() !== 78) reader.readUInt8();

            if (reader.peek() === 78 && NetTask.verifySignature(reader)) {
                try {
                    // const nt = NetTask.deserializeHeader(reader);
                    // this.logger.info("UDP Agent header:", nt);

                    let payload: Buffer;
                    const pHeader = NetTask.deserializePublicHeader(reader);
                    // this.logger.log("[AGENT] Public header:", pHeader);

                    if (NetTask.isEncrypted(pHeader)) {
                        try {
                            const envelope = ECDHE.deserializeEncryptedMessage(reader.read(pHeader.payloadSize));
                            payload = this._ecdhe.deenvelope(envelope);
                        } catch (e) {
                            throw new Error(`[AGENT] Authentication error: Crypto error.`, { cause: e });
                        }
                    } else {
                        payload = reader.read(pHeader.payloadSize);
                    }

                    const payloadReader = new BufferReader(payload);
                    const nt = NetTask.deserializePrivateHeader(payloadReader, pHeader);
                    
                    this.logger.pLog(`---------- PACOTE RECEBIDO ----------`);
                    this.logger.pLog(nt.toString());
                    this.logger.pLog(`-------------------------------------`); 

                    // this.logger.info("UDP Agent header:", nt);
                    try {
                        //Fragmentando tenho de criar o pacote
                        
                        this._flowControl.evaluateConnection(nt);
                    } catch (error) {
                        // if (error instanceof ConnectionRejected) {
                        //     this.logger.error("[AGENT] Connection rejected. Try again later.");
                        //     break;
                        // }
                        if (error instanceof DuplicatedPackageError) {
                            this.logger.error("Duplicated package:", error.message);
                            break;
                        } else if (error instanceof OutOfOrderPackageError) {
                            this.logger.error("Out-of-order package:", error.message);
                            
                            const retransmission = new NetTaskBodyless(
                                pHeader.sessionId,
                                this._flowControl.getLastSeq(),
                                nt.getSequenceNumber(),
                                this._flowControl.getLastAck() + 1,
                            );
                            this.send(retransmission);
                        } else {
                            this.logger.error("An unexpected error occurred:", error);
                            break;
                        }
                    }

                    switch (nt.getType()) {
                        /**
                         * Third phase of the Registration Process, where the Agent, after receiving the Server Public Key,
                         * the challenge and the salt, creates the ecdhe link between the Server Public Key and
                         * the ecdhe link that links the Server to the Agent Public Key. Afterwards, the Agent verifies
                         * the integrity of the challenge received, leading to the regeneration of his keys. Next,
                         * he creates the Register Challenge 2 Datagram, in order to communicate to the server the 
                         * confirmed challenge.
                         */
                        case NetTaskDatagramType.REGISTER_CHALLENGE: {
                            if (this._ecdhe.initialized) {
                                this.logger.pWarn(
                                    "[AGENT] Connection is initialized, but received REGISTER_CHALLENGE."
                                    + " Packet might have been replayed."
                                );

                                break;
                            }

                            const registerDg = NetTaskRegisterChallenge.deserialize(payloadReader, nt);
                            this._ecdhe.link(registerDg.publicKey, registerDg.salt);

                            const confirm = this._ecdhe.verifyChallenge(ECDHE.deserializeChallenge(registerDg.challenge));
                            this._ecdhe.regenerateKeys(confirm.control);

                            this.challengeSalt = confirm.control;

                            const register2Dg = new NetTaskRegisterChallenge2(
                                nt.getSessionId(),
                                this._flowControl.getLastSeq(),
                                this._flowControl.getLastAck(),
                                0,
                                false,
                                0,
                                ECDHE.serializeChallenge(confirm.challenge)
                            ).link(this._ecdhe);

                            this.logger.info("[AGENT] Third authentication phase:", register2Dg);
                            this.send(register2Dg);
                            break;
                        }
                        case NetTaskDatagramType.CONNECTION_REJECTED: {
                            const rejectedDg = NetTaskRejected.deserialize(payloadReader, nt);

                            // 0-RTT attempted. Reset connection.
                            if (this.wake) {
                                this.wake = false;
                                this.logger.info("[AGENT] Connection revival failed. Restarting connection.");

                                if (fs.existsSync(this.keystore)) fs.rmSync(this.keystore);
                                
                                this._ecdhe = new ECDHE(ECDHE_ALGO);
                                this.sessionId = this._ecdhe.generateSessionId();
                                this.challengeSalt = undefined;

                                // const registerDg = new NetTaskRegister(this.sessionId, 0, 0, false, this.ecdhe.publicKey);
                                const registerDg = new NetTaskRegister(
                                    this.sessionId, 
                                    this._flowControl.getLastSeq(), 
                                    this._flowControl.getLastAck(), 
                                    0, 
                                    false, 
                                    0, 
                                    this._ecdhe.publicKey
                                );
                                this.send(registerDg);
                            } else {
                                this.logger.error(`[AGENT] Connection rejected with reason: ${
                                    NetTaskRejectedReason[rejectedDg.getReasonFlag()]
                                }. Try again later.`);

                                process.exit(1);
                            }
                            break;
                        }
                        case NetTaskDatagramType.PUSH_SCHEMAS: {
                            const ntSchemas = NetTaskPushSchemas.deserialize(payloadReader, this._ecdhe, nt);
                            const schemas = ntSchemas.getSchemas();
                            this.logger.pInfo(`Connection established with the server.`);

                            const ack = new NetTaskBodyless(
                                ntSchemas.getSessionId(),
                                this._flowControl.getLastSeq(),
                                this._flowControl.getLastAck(),
                                0,
                            );
                            this.send(ack);

                            // this.logger.log("SCHEMAS:", schemas);
                            ntSchemas.link(this._ecdhe).serialize();

                            for (const [taskConfigId, task] of Object.entries(ntSchemas.getSchemas())) {
                                executeTask(taskConfigId, task, this, nt, schemas);
                            }

                            // const metric = new NetTaskMetric(
                            //     nt.getSessionId(),
                            //     this.flowControl.getLastSeq(),
                            //     this.flowControl.getLastAck(),
                            //     0,
                            //     false,
                            //     0,
                            //     {
                            //         device_metrics: {
                            //             cpu_usage: 90,
                            //             ram_usage: 70,
                            //             interface_stats: {
                            //                 eth0: 1234,
                            //                 eth1: 5678
                            //             },
                            //             volume: 10
                            //         },
                            //         link_metrics: {
                            //             bandwidth: 123,
                            //             jitter: 456,
                            //             packet_loss: 789,
                            //             latency: 147
                            //         }
                            //     },
                            //     "task1",
                            //     (<SPACKTask>schemas[<never>"task1"]).getUnpacked()
                            // ).link(this.ecdhe);
                            // this.send(metric);

                            // this.logger.info("\n\nStaring to execute tasks: \n\n");
                            
                            //executePing("www.google.pt", 3, 1);
                            //executeIPerfServer(30, "tcp", 5);

                            break;
                        }
                        case NetTaskDatagramType.BODYLESS: {
                            if(nt.getNAcknowledgementNumber() != 0){
                                this.logger.warn("Pedido de retransmissão do pacote com seq:", nt.getNAcknowledgementNumber());
                                const dg = this._flowControl.getDgFromRecoveryList(nt.getNAcknowledgementNumber());
                                this.send(dg);
                                return;
                            }
                            break;
                        }
                        case NetTaskDatagramType.WAKE: {
                            this.logger.info("[AGENT] Got Wake packet from server.");
                            try {
                                // Ignore, because no real payload is sent, just a sanity test.
                                const wakeDg = NetTaskWake.deserialize(payloadReader, this._ecdhe!, nt);
                                this._flowControl.reset(wakeDg.getSequenceNumber());
                                // this.flowControl.setLastSeq(wakeDg.getSequenceNumber());
                                this.logger.info("[AGENT] Sequence number reset.");
                                
                                // const { initConfig } = await import("../../server/config.js");
                                // if (!("config" in globalThis)) await initConfig("tmp/config.json");

                                // const tasks = Object.fromEntries(Object.entries(config.tasks).filter(([k,_]) => config.devices["deviceLH"].tasks.includes(k)));
                                // const pack = packTaskSchemas(tasks);
                                // const ser = serializeSPACK(pack);
                                // const deser = deserializeSPACK(ser);
                                // const ntasks = unpackTaskSchemas(<never>deser);

                                // for (let i = 0; i < 9; i++) {
                                //     const badPacket = new NetTaskMetric(
                                //         nt.getSessionId(),
                                //         // this.flowControl.getLastSeq(),
                                //         // this.flowControl.getLastAck(),
                                //         678678 + i,
                                //         678678,
                                //         0,
                                //         false,
                                //         0,
                                //         {
                                //             device_metrics: {
                                //                 cpu_usage: 90,
                                //                 ram_usage: 70,
                                //                 interface_stats: {
                                //                     eth0: 1234,
                                //                     eth1: 5678
                                //                 },
                                //                 volume: 10
                                //             },
                                //             link_metrics: {
                                //                 bandwidth: 123,
                                //                 jitter: 456,
                                //                 packet_loss: 789,
                                //                 latency: 147
                                //             }
                                //         },
                                //         "task1",
                                //         ntasks.task1.getUnpacked()
                                //     ).link(this.ecdhe);
                                //     this.send(badPacket);
                                // }
                            } catch(e) {
                                this.logger.error("[AGENT] Invalid wake packet:", e);
                                this.logger.info("[AGENT] Restarting connection.");

                                fs.rmSync(this.keystore);
                                
                                this._ecdhe = new ECDHE(ECDHE_ALGO);
                                this.sessionId = this._ecdhe.generateSessionId();
                                this.challengeSalt = undefined;

                                // const registerDg = new NetTaskRegister(this.sessionId, 0, 0, false, this.ecdhe.publicKey);
                                const registerDg = new NetTaskRegister(
                                    this.sessionId, 
                                    this._flowControl.getLastSeq(), 
                                    this._flowControl.getLastAck(), 
                                    0, 
                                    false, 
                                    0, 
                                    this._ecdhe.publicKey
                                );
                                this.send(registerDg);
                            }

                            break;
                        }
                        case NetTaskDatagramType.CONNECTION_RESET: {
                            this.logger.info("[AGENT] Got Reset packet from server.");
                            try {
                                // Ignore, because no real payload is sent, just a sanity test.
                                NetTaskReset.deserialize(payloadReader, this._ecdhe!, nt);
                                this.logger.warn("[AGENT] Reset packet is valid. Resetting connection.");

                                fs.rmSync(this.keystore);
                                
                                this._ecdhe = new ECDHE(ECDHE_ALGO);
                                this.sessionId = this._ecdhe.generateSessionId();
                                this.challengeSalt = undefined;

                                const registerDg = new NetTaskRegister(
                                    this.sessionId, 
                                    this._flowControl.getLastSeq(), 
                                    this._flowControl.getLastAck(), 
                                    0, 
                                    false, 
                                    0, 
                                    this._ecdhe.publicKey
                                );
                                this.send(registerDg);
                            } catch(e) {
                                this.logger.error("[AGENT] Invalid reset packet:", e);
                            }

                            break;
                        }
                        default: {
                            this.logger.warn("[AGENT] Unknown datagram received. Ignoring.");
                            break;
                        }
                    }
                } catch (e) {
                    this.logger.pError("[AGENT] Error while processing packet:", { cause: e });
                }
            }
        }  
          
    }

    /**
     * Sends a payload to the target.
     * @param payload A Buffer containing the payload data.
     */
    public send(dg?: NetTask): void {
        if(!this.target){
            throw new Error(`You cant send a packet to the void...`);
        }

        try{
            const dgToSend = this._flowControl.controlledSend(dg);
            
            if(dgToSend.getSequenceNumber() === this._flowControl.getLastSeq()){
                this._flowControl.readyToSend(dgToSend);
            } else {
                dgToSend.setNack(0);
            }

            this.logger.pLog(`---------- PACOTE ENVIADO ----------`);
            this.logger.pLog(dgToSend.toString());
            this.logger.pLog(`-------------------------------------`); 
            
            if(dgToSend.getType() === NetTaskDatagramType.BODYLESS || dgToSend.getType() === NetTaskDatagramType.WAKE || dgToSend.getType() === NetTaskDatagramType.SEND_METRICS){
                //@ts-expect-error STFU Typescript.
                this.socket.send(dgToSend.serialize(), this.target.port, this.target.address);
                return;
            }
            
            //@ts-expect-error STFU Typescript.
            this.socket.send(dgToSend.serialize(), this.target.port, this.target.address);
            
            this._flowControl.startTimer(dgToSend, (seq) => {
                this.handleTimeout(seq);
            }); 
        } catch (error) {
            if (error instanceof ReachedMaxWindowError) {
                this.logger.warn(`Reached maximum window limit. Halting queue.`);
                return;
            } else if (error instanceof MaxRetransmissionsReachedError) {
                this.logger.warn("Agent is not responding to meeee...");
                this.socket.close();
                process.emit("SIGINT");
                return;
            } else {
                this.logger.error("Unknown error:", { cause: error });
            }
        }
    }

    /**
     * Opens a connection to a given target on a given port.
     * @param target The remote target to connect to.
     */
    public connect(target: ConnectionTarget) {
        this.target = target;
        this._flowControl.setLastAck(0);
        this._flowControl.setLastSeq(1);

        // const connectionId = this.ecdhe.generateSessionId();
        // this.sessionId = connectionId;
        this.sessionId ??= this._ecdhe.generateSessionId();
        
        if (this._ecdhe.initialized) {
            this.logger.info("Attempting to immediately revive connection.");

            // Connection was revived. Attempt to immediately start connection using 0-RTT.
            const wakeDg = new NetTaskWake(
                this.sessionId,
                1,
                0,
                0
            ).link(this._ecdhe);

            this.send(wakeDg);
        } else {
            // There wasn't a previous connection, or the keystore was deleted.
            /**
             * First phase of the Registration Process, where an Agent sends the Server his public key.
             */
            // const registerDg = new NetTaskRegister(this.sessionId, 0, 0, false, this.ecdhe.publicKey);
            const registerDg = new NetTaskRegister(
                this.sessionId, 
                this._flowControl.getLastSeq(), 
                this._flowControl.getLastAck(), 
                0, 
                false, 
                0, 
                this._ecdhe.publicKey
            );
            this.logger.log("[AGENT] First phase auth:", registerDg);
            this.send(registerDg);
        }
        
    }

    public close() {

    }

    private handleTimeout(seqNumber: number) {
        try {
            const dg = this._flowControl.getDgFromRecoveryList(seqNumber);
            this.logger.warn(`Timeout... retransmitting package ${seqNumber}`); 

            this.send(dg);
    
            this._flowControl.startTimer(dg, (seq) => {
                this.handleTimeout(seq);
            });
        } catch (error) {
            this.logger.error("Failed to retransmit package:", error);
        }
    }
}

export { UDPClient };