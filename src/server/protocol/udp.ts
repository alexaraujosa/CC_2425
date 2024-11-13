import crypto from "crypto";
import { makeGeneralKenobiDatagram, makeKYSDatagram, makeMessageDatagram, NetflowDatagramType, readHelloThereDatagram, readTheNegotiatorDatagram, verifySignature } from "$common/datagram/netflow.js";
import { NetTask, NetTaskDatagramType, NetTaskRegister, NetTaskRegisterChallenge, NetTaskRegisterChallenge2, NetTaskRequestTask } from "$common/datagrams/NetTask.js";
import { ConnectionTarget, ConnectionTargetLike, RemoteInfo } from "$common/protocol/connection.js";
import { ChallengeControl, ECDHE } from "$common/protocol/ecdhe.js";
import { UDPConnection } from "$common/protocol/udp.js";
import { BufferReader } from "$common/util/buffer.js";

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
    private clients: Map<string, { ecdhe: ECDHE, challenge?: ChallengeControl }>;

    public constructor() {
        super();

        this.clients = new Map();
    }

    public onError(err: Error): void {
        this.logger.error("UDP Server got an error:", err);
    }

    public onMessage(msg: Buffer, rinfo: RemoteInfo): void {
        // this.logger.log(`UDP Server got: ${msg} from ${ConnectionTarget.toQualifiedName(rinfo)}`);
        const reader = new BufferReader(msg);
        while (!reader.eof()) {
            while (!reader.eof() && reader.peek() !== 67 && reader.peek() !== 78)
                reader.readUInt8();

            if (reader.eof())  break;
            //#region ============== NETFLOW ==============
            if (reader.peek() === 67 && verifySignature(reader)) {
                const type = reader.readUInt32();//msg.readUInt32BE(4);
                switch (type) {
                    case NetflowDatagramType.HELLO_THERE: { // HelloThere
                        break;  // FIX
                        try {
                            const dg = readHelloThereDatagram(reader);
        
                            const ecdhe = new ECDHE("secp128r1");
                            const salt = ecdhe.link(dg.publicKey);
        
                            const gkdg = makeGeneralKenobiDatagram(ecdhe, rinfo.address, salt);
                            this.clients.set(ConnectionTarget.toQualifiedName(rinfo), { ecdhe, challenge: gkdg.challenge });
        
                            this.send(gkdg.packet, rinfo);
                        } catch (e) {
                            this.logger.pError(
                                `UDP Server got an error while processing packet from ${ConnectionTarget.toQualifiedName(rinfo)}:`, 
                                e
                            );
        
                            const packet = makeKYSDatagram();
                            this.send(packet, rinfo);
                        }
                        break;
                    }
                    case NetflowDatagramType.GENERAL_KENOBI: { 
                        // Do jack shit
                        break;
                    }
                    case NetflowDatagramType.THE_NEGOTIATOR: {
                        break;  //  FIX
                        const dg = readTheNegotiatorDatagram(reader);
                        const client = this.clients.get(ConnectionTarget.toQualifiedName(rinfo))!;
        
                        const confirm = client.ecdhe.confirmChallenge(dg.challenge, client.challenge!);
                        if (!confirm) {
                            const dg = makeKYSDatagram();
                            return this.send(dg, rinfo);
                        }
        
                        client.ecdhe.regenerateKeys(client.challenge!.control);
        
                        const reply = makeMessageDatagram(client.ecdhe, "Authenticated!");
                        this.send(reply, rinfo);
                        break;
                    }
                    case NetflowDatagramType.MESSAGE: { // Message
                        // TODO: Fuck you want?
                        break;
                    }
                    case NetflowDatagramType.KYS: { // Commit die
                        // Lmfao no
                        break;
                    }
                }
            }
            //#endregion ============== NETFLOW ==============
            if (reader.peek() === 78 && NetTask.verifySignature(reader)) {
                const nt = NetTask.readNetTaskDatagram(reader);
                // this.logger.info(nt);

                switch (nt.getType()) {
                    case NetTaskDatagramType.REQUEST_METRICS: {
                        // TODO
                        break;
                    }
                    case NetTaskDatagramType.REQUEST_REGISTER: {
                        const rgDg = NetTaskRegister.readNetTaskRegisterDatagram(reader, nt);

                        const ecdhe = new ECDHE("secp128r1");
                        const salt = ecdhe.link(rgDg.publicKey);
                        const challenge = ecdhe.generateChallenge(crypto.randomBytes(12));
        
                        const rcDg = new NetTaskRegisterChallenge(
                            123123, 
                            123123, 
                            5555, 
                            ecdhe.publicKey, 
                            ECDHE.serializeChallenge(challenge.challenge),
                            salt
                        );

                        this.clients.set(ConnectionTarget.toQualifiedName(rinfo), { ecdhe, challenge: challenge });
        
                        this.send(rcDg.makeNetTaskRegisterChallenge(), rinfo);
                        break;
                    }
                    case NetTaskDatagramType.REGISTER_CHALLENGE2: {
                        const rc2Dg = NetTaskRegisterChallenge2.readNetTaskRegisterChallenge2(reader, nt);

                        const client = this.clients.get(ConnectionTarget.toQualifiedName(rinfo));
                        const confirm = client?.ecdhe.confirmChallenge(ECDHE.deserializeChallenge(rc2Dg.challenge), client.challenge!);
                        if (!confirm) {
                            // TODO: Enviar datagrama para matar a conexao
                        }
                        client?.ecdhe.regenerateKeys(client.challenge!.control);


                        const nttt = new NetTaskRequestTask(123123, 123123, 0, "e que").link(client!.ecdhe);
                        const asd = nttt.makeNetTaskRequestTask();
                        this.send(asd, rinfo);
                    }
                    case NetTaskDatagramType.REQUEST_TASK: {
                        // TODO
                        break;
                    }
                    default: {
                        // TODO: Ignore?
                        break;
                    }
                }
            }
        }

        // this.send(Buffer.from("Hello from UDP Server."), rinfo);
    }

    public onListen(): void {
        const address = this.socket.address();
        this.logger.log(`UDP server listening at ${address.address}:${address.port}`);
    }
}

export { 
    TestUDPServer 
};