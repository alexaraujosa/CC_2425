/**
 * @module NetTask
 * 
 * Common definition of the NetTask Protocol. Used in both the AGENT and SERVER solutions for the implementation
 * of a responsive and resilient communication.
 * 
 * @copyright Copyright (c) 2024 DarkenLM https://github.com/DarkenLM
 */

const NET_TASK_VERSION = 1;

enum NetTaskDatagramType {
    REQUEST_REGISTER,
    REQUEST_TASK,
    REQUEST_METRICS,
    RESPONSE_REGISTER,
    RESPONSE_TASK,
    RESPONSE_METRICS
};

class NetTask {
    private version: number;
    private agentId: number;
    private sequenceNumber: number;
    private acknowledgementNumber: number;
    private type: NetTaskDatagramType;
    private payloadSize: number;

    public constructor(
        agentId: number,
        sequenceNumber: number,
        acknowledgementNumber: number,
        type: NetTaskDatagramType,
        payloadSize: number
    ) {
        this.version = NET_TASK_VERSION;
        this.agentId = agentId;
        this.sequenceNumber = sequenceNumber;
        this.acknowledgementNumber = acknowledgementNumber;
        this.type = type;
        this.payloadSize = payloadSize;
    }

    public getVersion(): number { return this.version; }
    public getAgentId(): number { return this.agentId; }
    public getSequenceNumber(): number { return this.sequenceNumber; }
    public getAcknowledgementNumber(): number { return this.acknowledgementNumber; }
    public getType(): NetTaskDatagramType { return this.type; }
    public getPayloadSize(): number { return this.payloadSize; }

    public toString(): string {
        return  "--< NET TASK >--\n" +
                "  VERSION: " + this.version + "\n" +
                "  AGENT_ID: " + this.agentId + "\n" +
                "  SEQUENCE_NUMBER: " + this.sequenceNumber + "\n" +
                "  ACKNOWLEDGEMENT_NUMBER: " + this.acknowledgementNumber + "\n" +
                "  TYPE: " + this.type + "\n" +
                "  PAYLOAD_SIZE: " + this.payloadSize + "\n";
    }
}

export default NetTask;