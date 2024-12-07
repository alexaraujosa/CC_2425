/**
 * @module AlertFlow
 * 
 * Common definition of the AlertFlow Protocol. Used in both the AGENT and SERVER solutions for the communication
 * of alert occasions. 
 * 
 * @copyright Copyright (c) 2024 DarkenLM https://github.com/DarkenLM
 */

import { BufferReader, BufferWriter } from "$common/util/buffer.js";
import { dropEmpty } from "$common/util/object.js";
import { deserializeTaskMetric, serializedTaskMetric, SPACKTaskMetric } from "./spack.js";

//#region ============== Constants ==============
const ALERT_FLOW_VERSION = 1;
const ALERT_FLOW_SIGNATURE = Buffer.from("ATFW", "utf8");
//#endregion ============== Constants ==============

/**
 * This class represents a message datagram used between the Agent and Server solutions
 * to alert critical changes in the state of network devices.
 */
class AlertFlow {
    private version: number;
    private sessionId: Buffer;
    private taskId: string;
    private task: object;
    private spack!: SPACKTaskMetric;

    public constructor(
        sessionId: Buffer,
        taskId: string,
        task: object,
        spack: SPACKTaskMetric
    ) {
        this.version = ALERT_FLOW_VERSION;
        this.sessionId = sessionId;
        this.taskId = taskId;
        this.spack = dropEmpty(Object.fromEntries(Object.entries(spack)));
        this.task = task;
    }

    public getVersion(): number { return this.version; }
    public getSessionId(): Buffer { return this.sessionId; }
    public getTaskId(): string { return this.taskId; }
    public getMetrics(): SPACKTaskMetric { return this.spack; }

    // public toString(): string {
    //     return  "--< ALERT FLOW >--\n" +
    //             "  VERSION: " + this.version + "\n" +
    //             "  AGENT_ID: " + this.agentId + "\n" +
    //             "  PAYLOAD_SIZE: " + this.payloadSize + "\n";
    // }

    /**
     * First phase of the deserialization, used to verify the signature of an AlertFlow Datagram. 
     * Should always be used before {@link deserialize} method.
     * @param reader BufferReader instanciated with a message buffer received from the server.
     * @returns A boolean representing whether or not the signature is valid.
     */
    public static verifySignature(reader: BufferReader): boolean {
        const sig = reader.read(4);
    
        return ALERT_FLOW_SIGNATURE.equals(sig);
    }

    /**
     * Second phase of the deserialization, returning an AlertFlow Datagram from a given message buffer.
     * @param reader BufferReader instanciated with a message buffer received from the server.
     * @returns An AlertFlow instance representing the deserialized message.
     */
    public static deserialize(reader: BufferReader, configTasks: object): AlertFlow {
        // const logger = getOrCreateGlobalLogger();
        const version = reader.readUInt32();
        if (version != ALERT_FLOW_VERSION) {
            throw new Error(`ALERTFLOW Datagram Invalid Version. Excepted: ${ALERT_FLOW_VERSION}. Received: ${version}.`);
        }

        const sessionIdLen = reader.readUInt32();
        const sessionId = reader.read(sessionIdLen);

        const metric = { taskId: "", metrics: <SPACKTaskMetric>{} };
        try {
            const taskIdLen = reader.readUInt32();
            metric.taskId = reader.read(taskIdLen).toString("utf8");

            const spackLen = reader.readUInt32();
            const rawSpack = reader.read(spackLen);

            metric.metrics = deserializeTaskMetric(
                rawSpack, 
                // In order to not import stuff from server into common, we do this hack to simply accept whatever.
                // It's the responsability of the user to guarantee this doesn't explode on their hands.
                <never>(<Record<string, unknown>>configTasks)[<keyof typeof configTasks>metric.taskId]
            );
        } catch (e) {
            throw new Error(`[NT_Metric] Malformed NetTaskMetric packet: Malformed schema payload.`, { cause: e });
        }
    
        return new AlertFlow(
            sessionId,
            metric.taskId,
            <never>(<Record<string, unknown>>configTasks)[<keyof typeof configTasks>metric.taskId],
            metric.metrics
        );
    }

    /**
     * Serializes an {@link AlertFlow} object into network-transmittable buffers.
     */
    public serialize(): Buffer {
        const pack = serializedTaskMetric(this.spack, <never>this.task);
        
        const taskLen = Buffer.alloc(4);
        taskLen.writeUInt32BE(this.taskId.length);

        const packLen = Buffer.alloc(4);
        packLen.writeUInt32BE(pack.byteLength);
        const payload = Buffer.concat([taskLen, Buffer.from(this.taskId, "utf8"), packLen, pack]);

        const writer = new BufferWriter();
        writer.write(ALERT_FLOW_SIGNATURE);
        writer.writeUInt32(this.version);
        writer.writeUInt32(this.sessionId.byteLength);
        writer.write(this.sessionId);
        writer.write(payload);

        return writer.finish();
    }
}

export {
    AlertFlow
};