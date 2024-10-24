class NetTask {
    private version: number;
    private agentId: number;
    private sequenceNumber: number;
    private acknowledgementNumber: number;
    private type: number;
    private payloadSize: number;

    public constructor(
        version: number,
        agentId: number,
        sequenceNumber: number,
        acknowledgementNumber: number,
        type: number,
        payloadSize: number
    ) {
        this.version = version;
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
    public getType(): number { return this.type; }
    public getPayloadSize(): number { return this,this.payloadSize; }

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