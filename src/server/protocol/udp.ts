import crypto from "crypto";
import { NetTask, NetTaskDatagramType, NetTaskRegister, NetTaskRegisterChallenge, NetTaskRegisterChallenge2, NetTaskPushSchemas } from "$common/datagram/NetTask.js";
import { ConnectionTarget, ConnectionTargetLike, RemoteInfo } from "$common/protocol/connection.js";
import { ChallengeControl, ECDHE } from "$common/protocol/ecdhe.js";
import { UDPConnection } from "$common/protocol/udp.js";
import { BufferReader } from "$common/util/buffer.js";
import { createDevice, deviceToString } from "$common/db/interfaces/IDevice.js";
import { DatabaseDAO } from "$common/db/databaseDAO.js";
import { packTaskSchemas } from "$common/datagram/spack.js";
import { createMetrics } from "$common/db/interfaces/IMetrics.js";

/**
 * This class is meant to be used as a base for UDP Server implementations.
 */
// TODO: Merge into one class. Make listen consistent with TCP.
class UDPServer extends UDPConnection {
    private clients: Map<string, { ecdhe: ECDHE, salt: Buffer, challenge?: ChallengeControl }>;
    private db: DatabaseDAO;
    private devicesNames: Record<string, string>;
    private dbMapper: Map<string, number>;

    public constructor(db: DatabaseDAO, dbMapper: Map<string, number>) {
        super();

        this.clients = new Map();
        this.db = db;
        this.devicesNames = Object.fromEntries(Object.entries(config.devices).map(([k,v]) => [v.ip, k]));
        this.dbMapper = dbMapper;
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
    public send(payload: Buffer, target: ConnectionTargetLike) {
        this.socket.send(payload, target.port, target.address);
    }

    public async onMessage(msg: Buffer, rinfo: RemoteInfo): Promise<void> {
        this.logger.log(`UDP Server got: ${msg} from ${ConnectionTarget.toQualifiedName(rinfo)}`);
        const reader = new BufferReader(msg);

        while (!reader.eof()) {
            while (!reader.eof() && reader.peek() !== 78)
                reader.readUInt8();

            if (reader.eof())  break;

            this.logger.log(`UDP Server reader peek:`, reader.peek().toString(16));

            //#endregion ============== NETFLOW ==============
            if (reader.peek() === 78 && NetTask.verifySignature(reader)) {
                const header = NetTask.readNetTaskDatagram(reader);

                this.logger.log(`UDP Server header:`, header);
                

                const completedMsg = Buffer.alloc(64000);
                (() => completedMsg)();

                switch (header.getType()) {

                    /**
                     * Second phase of the Registration Process, where the Server, after receiving the Agent Public Key,
                     * verifies if the device exists in the config. If it does not, the connection is rejected. Otherwise, it
                     * creates an ecdhe link for the Agent and a challenge using 12 random bytes. Afterwards, a Register
                     * Challenge Datagram is created, containing the Server Public Key, the challenge and the ecdhe link.
                     * Before sending that datagram, the server saves the agent ecdhe, that will be used on the fourth phase.
                     */
                    case NetTaskDatagramType.REQUEST_REGISTER: {
                        const registerDg = NetTaskRegister.deserialize(reader, header);

                        let exists = false;
                        for (const device of Object.values(config.devices)) {
                            if (device.ip === rinfo.address)
                                exists = true;
                        }
                        if (!exists) {
                            const rejectedDg = new NetTask(123123, 123123, false, NetTaskDatagramType.CONNECTION_REJECTED, 0);
                            this.send(rejectedDg.makeNetTaskDatagram(), rinfo);
                            break;
                        }

                        const ecdhe = new ECDHE("secp128r1");
                        const salt = ecdhe.link(registerDg.publicKey);
                        const challenge = ecdhe.generateChallenge(crypto.randomBytes(12));
        
                        const regChallengeDg = new NetTaskRegisterChallenge(
                            123123, 
                            123123,
                            false, 
                            5555, 
                            ecdhe.publicKey, 
                            ECDHE.serializeChallenge(challenge.challenge),
                            salt
                        );
                        this.clients.set(ConnectionTarget.toQualifiedName(rinfo), { ecdhe, salt, challenge: challenge });
                        this.send(regChallengeDg.serialize(), rinfo);
                        break;
                    }

                    /**
                     * Fourth and last phase of the Registration Process, where the Server, after receiving the confirmed 
                     * challenge from the Agent, confirms the received challenge. If it's not valid, the Server sends
                     * a Datagram informing the closure of the connection. Otherwise, the Registration Process is 
                     * successfully completed and the Agent is inserted into the database and is ready to receive tasks.
                     */
                    case NetTaskDatagramType.REGISTER_CHALLENGE2: {
                        const regChallenge2Dg = NetTaskRegisterChallenge2.deserialize(reader, header);

                        const client = this.clients.get(ConnectionTarget.toQualifiedName(rinfo));
                        const confirm = client?.ecdhe.confirmChallenge(ECDHE.deserializeChallenge(regChallenge2Dg.challenge), client.challenge!);
                        if (!confirm) {
                            const rejectedDg = new NetTask(123123, 123123, false, NetTaskDatagramType.CONNECTION_REJECTED, 0);
                            this.send(rejectedDg.makeNetTaskDatagram(), rinfo);
                            break;
                        }

                        client?.ecdhe.regenerateKeys(client.challenge!.control);

                        const device = createDevice(
                            rinfo.address,
                            rinfo.port,
                            <Buffer> client?.ecdhe.secret,
                            <Buffer> client?.salt,
                            <Buffer> client?.ecdhe.generateSessionId(client.salt),
                            new Date()
                        );
                        const deviceId = await this.db.storeDevice(device);
                        this.logger.info("Stored device with ID: " + deviceId);

                        const deviceById = await this.db.getDeviceByID(deviceId);
                        if(deviceById) this.logger.info("Retrieved Device by ID:", deviceToString(deviceById));

                        // const requestTaskDg = new NetTaskPushSchemas(123123, 123123, false, 0, "e que").link(client!.ecdhe);

                        // const task = config.tasks["task1"];
                        const cDevice = config.devices[this.devicesNames[rinfo.address]];
                        const tasks = Object.fromEntries(Object.entries(config.tasks).filter(([k,_]) => cDevice.tasks.includes(k)));

                        for (const [taskConfigId, task] of Object.entries(tasks)) {
                            const taskDatabaseId = this.dbMapper.get(taskConfigId);
                            const metrics: string[] = [];
                            if (task.device_metrics.cpu_usage)  metrics.push("cpu");
                            if (task.device_metrics.interface_stats)  metrics.push("interface_stats");
                            if (task.device_metrics.ram_usage)  metrics.push("memory");
                            if (task.device_metrics.volume)  metrics.push("volume");
                            if (task.link_metrics.bandwidth)  metrics.push("bandwidth");
                            if (task.link_metrics.jitter)  metrics.push("jitter");
                            if (task.link_metrics.latency)  metrics.push("latency");
                            if (task.link_metrics.packet_loss)  metrics.push("packet_loss");

                            const iMetric = createMetrics(
                                <number> taskDatabaseId,
                                <Buffer> client?.ecdhe.generateSessionId(client.salt),
                                metrics
                            );

                            await this.db.storeMetrics(iMetric);
                        }
                       
                        this.logger.info("=========TABELAS DE METRICAS CRIADAS==========");

                        const spack = packTaskSchemas(tasks);
                        const requestTaskDg = new NetTaskPushSchemas(123123, 123123, false, spack).link(client!.ecdhe);
                        this.send(requestTaskDg.serialize(), rinfo);
                        break;
                    }
                    case NetTaskDatagramType.PUSH_SCHEMAS: {
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
    }
}


export { 
    UDPServer 
};