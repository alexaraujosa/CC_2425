/**
 * @module UDP
 * UDP Client implementation.
 * 
 * @copyright Copyright (c) 2024 DarkenLM https://github.com/DarkenLM
 */

import { NetTask, NetTaskDatagramType, NetTaskRegister, NetTaskRegisterChallenge, NetTaskRegisterChallenge2, NetTaskPushSchemas, NetTaskMetric, NetTaskBodyless } from "$common/datagram/NetTask.js";
import { ConnectionTarget } from "$common/protocol/connection.js";
import { ECDHE } from "$common/protocol/ecdhe.js";
import { UDPConnection } from "$common/protocol/udp.js";
import { BufferReader } from "$common/util/buffer.js";
import { RemoteInfo } from "dgram";
//import { executeIPerfServer, executePing } from "./executor.js";
import { SPACKTask } from "$common/datagram/spack.js";
import { ConnectionRejected, DuplicatedPackageError, FlowControl, MaxRetransmissionsReachedError, OutOfOrderPackageError, ReachedMaxWindowError } from "$common/protocol/flowControl.js";

/**
 * A UDP Client with integrated events and asynchronous flow control.
 * 
 * @example
 * const client = new UDPClient().connect(new ConnectionTarget(ADDRESS, PORT));
 * client.send(Buffer.from("Hello world!"))
 */
class UDPClient extends UDPConnection {
    private target!: ConnectionTarget;
    private ecdhe: ECDHE;
    private flowControl: FlowControl;
    // private challengeSalt!: Buffer;

    public constructor() {
        super();

        this.ecdhe = new ECDHE("secp128r1");
        this.flowControl = new FlowControl();
    }
    
    public onError(err: Error): void {
        this.logger.error("UDP Client got an error:", err);
    }

    public onMessage(msg: Buffer, rinfo: RemoteInfo): void {
        if (!this.target.match(rinfo)) {
            this.logger.info(`Ignored message from ${ConnectionTarget.toQualifiedName(rinfo)}: Not from target.`);
        }

        // this.logger.info(`UDP Client got message from target:`, msg.toString("utf8"));
        this.logger.info(`[AGENT] UDP Client got message from target:`, (msg.toString("hex").match(/../g) || []).join(""));

        const reader = new BufferReader(msg);
        while (!reader.eof()) {
            while (!reader.eof() && reader.peek() !== 78) reader.readUInt8();

            if (reader.peek() === 78 && NetTask.verifySignature(reader)) {
                try {
                    // const nt = NetTask.deserializeHeader(reader);
                    // this.logger.info("UDP Agent header:", nt);

                    let payload: Buffer;
                    const pHeader = NetTask.deserializePublicHeader(reader);
                    this.logger.log("[AGENT] Public header:", pHeader);

                    if (NetTask.isEncrypted(pHeader)) {
                        try {
                            const envelope = ECDHE.deserializeEncryptedMessage(reader.read(pHeader.payloadSize));
                            payload = this.ecdhe.deenvelope(envelope);
                        } catch (e) {
                            throw new Error(`[AGENT] Authentication error: Crypto error.`, { cause: e });
                        }
                    } else {
                        payload = reader.read(pHeader.payloadSize);
                    }

                    const payloadReader = new BufferReader(payload);
                    const nt = NetTask.deserializePrivateHeader(payloadReader, pHeader);
                    
                    this.logger.info("UDP Agent header:", nt);

                    try {
                        //Fragmentando tenho de criar o pacote
                        
                        this.flowControl.evaluateConnection(nt);
                    } catch (error) {
                        if (error instanceof ConnectionRejected) {
                            this.logger.error("[AGENT] Connection rejected. Try again later.");
                            break;
                        }
                        if (error instanceof DuplicatedPackageError) {
                            this.logger.error("Duplicated package:", error.message);
                            break;
                        } else if (error instanceof OutOfOrderPackageError) {
                            this.logger.error("Out-of-order package:", error.message);
                            const retransmission = new NetTaskBodyless(
                                pHeader.sessionId,
                                this.flowControl.getLastSeq(),
                                0,
                                this.flowControl.getLastAck() + 1,
                            );
                            this.send(retransmission);
                            break;
                        } else {
                            this.logger.error("An unexpected error occurred:", error);
                            break;
                        }
                    }

                    this.logger.pLog(`---------- PACOTE RECEBIDO ----------`);
                    this.logger.pLog(nt.toString());
                    this.logger.pLog(`-------------------------------------`); 

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
                            const registerDg = NetTaskRegisterChallenge.deserialize(payloadReader, nt);
                            this.ecdhe.link(registerDg.publicKey, registerDg.salt);

                            const confirm = this.ecdhe.verifyChallenge(ECDHE.deserializeChallenge(registerDg.challenge));
                            this.ecdhe.regenerateKeys(confirm.control);

                            const register2Dg = new NetTaskRegisterChallenge2(
                                nt.getSessionId(),
                                this.flowControl.getLastSeq(),
                                this.flowControl.getLastAck(),
                                0,
                                false,
                                0,
                                ECDHE.serializeChallenge(confirm.challenge)
                            ).link(this.ecdhe);

                            this.logger.info("[AGENT] Third authentication phase:", register2Dg);
                            this.send(register2Dg);
                            break;
                        }
                        case NetTaskDatagramType.CONNECTION_REJECTED: {
                            this.logger.error("[AGENT] Connection rejected. Try again later.");
                            process.exit(1);
                            break;
                        }
                        case NetTaskDatagramType.PUSH_SCHEMAS: {
                            const nttttt = NetTaskPushSchemas.deserialize(payloadReader, this.ecdhe, nt);
                            const schemas = nttttt.getSchemas();

                            const ack = new NetTaskBodyless(
                                nttttt.getSessionId(),
                                this.flowControl.getLastSeq(),
                                this.flowControl.getLastAck(),
                                0,
                            );
                            this.send(ack);

                            this.logger.log("SCHEMAS:", schemas);
                            nttttt.link(this.ecdhe).serialize();

                            const metric = new NetTaskMetric(
                                nt.getSessionId(),
                                this.flowControl.getLastSeq(),
                                this.flowControl.getLastAck(),
                                0,
                                false,
                                0,
                                {
                                    device_metrics: {
                                        cpu_usage: 90,
                                        ram_usage: 70,
                                        interface_stats: {
                                            eth0: 1234,
                                            eth1: 5678
                                        },
                                        volume: 10
                                    },
                                    link_metrics: {
                                        bandwidth: 123,
                                        jitter: 456,
                                        packet_loss: 789,
                                        latency: 147
                                    }
                                },
                                "task1",
                                (<SPACKTask>schemas[<never>"task1"]).getUnpacked()
                            ).link(this.ecdhe);
                            this.send(metric);

                            this.logger.info("\n\nStaring to execute tasks: \n\n");
                            
                            //executePing("www.google.pt", 3, 1);
                            //executeIPerfServer(30, "tcp", 5);

                            break;
                        }
                        case NetTaskDatagramType.BODYLESS: {
                            if(nt.getNAcknowledgementNumber() != 0){
                                this.logger.warn("Pedido de retransmissão do pacote com seq:", nt.getNAcknowledgementNumber());
                                const dg = this.flowControl.getDgFromRecoveryList(nt.getNAcknowledgementNumber());
                                this.send(dg);
                                return;
                            }
                            break;
                        }
                        default:{
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
            const dgToSend = this.flowControl.controlledSend(dg);
            
            if(dgToSend.getSequenceNumber() >= this.flowControl.getLastSeq()){
                this.flowControl.readyToSend(dgToSend);
            }

            this.logger.pLog(`---------- PACOTE ENVIADO ----------`);
            this.logger.pLog(dgToSend.toString());
            this.logger.pLog(`-------------------------------------`); 
            
            if(dgToSend.getType() === NetTaskDatagramType.BODYLESS){
                //@ts-expect-error STFU Typescript.
                this.socket.send(dgToSend.serialize(), this.target.port, this.target.address);
                return;
            }
            
            //@ts-expect-error STFU Typescript.
            this.socket.send(dgToSend.serialize(), this.target.port, this.target.address);
            
            this.flowControl.startTimer(dgToSend, (seq) => {
                this.handleTimeout(seq);
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

    /**
     * Opens a connection to a given target on a given port.
     * @param target The remote target to connect to.
     */
    public connect(target: ConnectionTarget) {
        this.target = target;
        this.flowControl.setLastAck(0);
        this.flowControl.setLastSeq(1);

        const connectionId = this.ecdhe.generateSessionId();
        
        /**
         * First phase of the Registration Process, where an Agent sends the Server his public key.
         */
        const registerDg = new NetTaskRegister(connectionId, this.flowControl.getLastSeq(), this.flowControl.getLastAck(), 0, false, 0, this.ecdhe.publicKey);
        this.logger.log("[AGENT] First phase auth:", registerDg);
        this.send(registerDg);
    }

    public close() {

    }

    private handleTimeout(seqNumber: number) {
        try {
            const dg = this.flowControl.getDgFromRecoveryList(seqNumber);
            this.logger.warn(`Timeout... retransmitting package ${seqNumber}`); 

            this.send(dg);
    
            this.flowControl.startTimer(dg, (seq) => {
                this.handleTimeout(seq);
            });
        } catch (error) {
            this.logger.error("Failed to retransmit package:", error);
        }
    }
}

export { UDPClient };