/**
 * @module UDP
 * UDP Client implementation.
 * 
 * @copyright Copyright (c) 2024 DarkenLM https://github.com/DarkenLM
 */

import { NetTask, NetTaskDatagramType, NetTaskRegister, NetTaskRegisterChallenge, NetTaskRegisterChallenge2, NetTaskRequestTask } from "$common/datagram/NetTask.js";
import { ConnectionTarget } from "$common/protocol/connection.js";
import { ECDHE } from "$common/protocol/ecdhe.js";
import { UDPConnection } from "$common/protocol/udp.js";
import { BufferReader } from "$common/util/buffer.js";
import { RemoteInfo } from "dgram";
import { executeIPerfServer, executePing } from "./executor.js";

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
    // private challengeSalt!: Buffer;

    public constructor() {
        super();

        this.ecdhe = new ECDHE("secp128r1");
    }
    
    public onError(err: Error): void {
        this.logger.error("UDP Client got an error:", err);
    }

    public onMessage(msg: Buffer, rinfo: RemoteInfo): void {
        if (!this.target.match(rinfo)) {
            this.logger.info(`Ignored message from ${ConnectionTarget.toQualifiedName(rinfo)}: Not from target.`);
        }

        // this.logger.info(`UDP Client got message from target:`, msg.toString("utf8"));
        const reader = new BufferReader(msg);
        while (!reader.eof()) {
            while (!reader.eof() && reader.peek() !== 78)
                reader.readUInt8();

            // //#region ============== NETFLOW ==============
            // if (reader.peek() === 67 && verifySignature(reader)) {
            //     const type = reader.readUInt32();// readUint32BE(4);
            //     switch (type) {
            //         case NetflowDatagramType.HELLO_THERE: { 
            //             // Do fuck all
            //             break;
            //         }
            //         case NetflowDatagramType.GENERAL_KENOBI: { 
            //             this.logger.log("Got GENERAL_KENOBY frame.");
            //             const dg = readGeneralKenobiDatagram(reader);
            //             this.ecdhe.link(dg.publicKey, dg.salt);
    
            //             const verCh = this.ecdhe.verifyChallenge(dg.challenge);
            //             // this.challengeSalt = verCh.control;
    
            //             // Assume authentication succeeded, compute communication salt.
            //             this.ecdhe.regenerateKeys(verCh.control);
    
            //             const reply = makeTheNegotiatorDatagram(verCh.challenge);
            //             this.send(reply);
            //             break;
            //         }
            //         case NetflowDatagramType.THE_NEGOTIATOR: {
            //             // Who needs to negotiate when you have a fucking gun?
            //             break;
            //         }
            //         case NetflowDatagramType.MESSAGE: { 
            //             const dg = readMessageDatagram(reader);
            //             const message = this.ecdhe.decrypt(dg.message);
    
            //             this.logger.log(`UDP Client received message: '${message.toString("utf8")}'`);
            //             break;
            //         }
            //         case NetflowDatagramType.KYS: { // Commit die.
                        
            //             break;
            //         }
            //     }
            // }
            // //#endregion  ============== NETFLOW ==============
            if (reader.peek() === 78 && NetTask.verifySignature(reader)) {
                const nt = NetTask.readNetTaskDatagram(reader);
                // this.logger.info(nt);
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
                        const registerDg = NetTaskRegisterChallenge.readNetTaskRegisterChallenge(reader, nt);
                        this.ecdhe.link(registerDg.publicKey, registerDg.salt);

                        const confirm = this.ecdhe.verifyChallenge(ECDHE.deserializeChallenge(registerDg.challenge));
                        this.ecdhe.regenerateKeys(confirm.control);

                        const register2Dg = new NetTaskRegisterChallenge2 (
                            123123,
                            123123,
                            false,
                            5555,
                            ECDHE.serializeChallenge(confirm.challenge)
                        );
                        this.send(register2Dg.makeNetTaskRegisterChallenge2());
                        break;
                    }
                    case NetTaskDatagramType.CONNECTION_REJECTED: {
                        this.logger.error("Connection rejected. Try again later.");
                        process.exit(1);
                    }
                    case NetTaskDatagramType.REQUEST_TASK: {
                        const nttttt = NetTaskRequestTask.deserialize(reader, this.ecdhe, nt);
                        this.logger.log(nttttt);

                        this.logger.info("\n\nStaring to execute tasks: \n\n");
                        
                        executePing("www.google.pt", 3, 1);
                        executeIPerfServer(30, "tcp", 5);

                        break;
                    }
                    default:{
                        this.logger.error("Received unidentified datagram!!")
                        break;
                    }
                }
            }
        }  
          
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
        
        /**
         * First phase of the Registration Process, where an Agent sends the Server his public key.
         */
        const registerDg = new NetTaskRegister(123123, 123123, false, 5555, this.ecdhe.publicKey);
        this.send(registerDg.makeNetTaskRegisterDatagram());
    }

    public close() {

    }
}

export { UDPClient };