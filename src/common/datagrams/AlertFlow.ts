/**
 * @module AlertFlow
 * 
 * Common definition of the AlertFlow Protocol. Used in both the AGENT and SERVER solutions for the communication
 * of alert occasions. 
 * 
 * @copyright Copyright (c) 2024 DarkenLM https://github.com/DarkenLM
 */

import { BufferReader, BufferWriter } from "$common/util/buffer.js";
import { getOrCreateGlobalLogger } from "$common/util/logger.js";

//#region ============== Constants ==============
const ALERT_FLOW_VERSION = 1;
const ALERT_FLOW_SIGNATURE = Buffer.from("ATFW", "utf8");

enum AlertFlowDatagramType {
    REQUEST_ALERT,
    RESPONSE_ALERT
};
//#endregion ============== Constants ==============

/**
 * This class represents a message datagram used between the Agent and Server solutions
 * to alert critical changes in the state of network devices.
 */
class AlertFlow {
    private version: number;
    private agentId: number;
    private type: AlertFlowDatagramType;
    private payloadSize: number;

    public constructor(
        agentId: number, 
        type: AlertFlowDatagramType,
        payloadSize: number
    ) {
        this.version = ALERT_FLOW_VERSION;
        this.agentId = agentId;
        this.type = type;
        this.payloadSize = payloadSize;
    }

    public getVersion(): number { return this.version; }
    public getAgentId(): number { return this.agentId; }
    public getType(): AlertFlowDatagramType { return this.type; }
    public getPayloadSize(): number { return this.payloadSize; }

    public toString(): string {
        return  "--< ALERT FLOW >--\n" +
                "  VERSION: " + this.version + "\n" +
                "  AGENT_ID: " + this.agentId + "\n" +
                "  TYPE: " + this.type + "\n" +
                "  PAYLOAD_SIZE: " + this.payloadSize + "\n";
    }

    /**
     * First phase of the deserialization, used to verify the signature of an AlertFlow Datagram. 
     * Should always be used before {@link readAlertFlowDatagram} method.
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
    public static readAlertFlowDatagram(reader: BufferReader): AlertFlow {
        // const reader = new BufferReader(buf, ALERT_FLOW_SIGNATURE.byteLength);
        const logger = getOrCreateGlobalLogger();
        const version = reader.readUInt32();
        if (version != ALERT_FLOW_VERSION) {
            logger.pError(`ALERTFLOW Datagram Invalid Version. Excepted: ${ALERT_FLOW_VERSION}. Received: ${version}.`);
            // TODO: Error handling. Don't forget to change the method onMessage from TCPServerConnection. 
            // TODO: If this method returns null, you should adapt the onMessage method.
        }

        const agentId = reader.readUInt32();
        const type = reader.readUInt32();
        const payloadSize = reader.readUInt32();
    
        return new AlertFlow(agentId, type, payloadSize);
    }

    /**
     * Serializes an {@link AlertFlow} object into network-transmittable buffers.
     */
    public makeAlertFlowDatagram(): Buffer {
        const writer = new BufferWriter();
        writer.write(ALERT_FLOW_SIGNATURE);
        writer.writeUInt32(this.version);
        writer.writeUInt32(this.agentId);
        writer.writeUInt32(this.type);
        writer.writeUInt32(this.payloadSize);

        return writer.finish();
    }
}

export default AlertFlow;