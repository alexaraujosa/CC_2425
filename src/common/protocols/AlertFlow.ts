class AlertFlow {
    private version: number;
    private agentId: number;
    private payloadSize: number;

    public constructor(
        version: number, 
        agentId: number, 
        payloadSize: number
    ) {
        this.version = version;
        this.agentId = agentId;
        this.payloadSize = payloadSize;
    }

    public getVersion(): number { return this.version; }
    public getAgentId(): number { return this.agentId; }
    public getPayloadSize(): number { return this.payloadSize; }

    public toString(): string {
        return  "--< ALERT FLOW >--\n" +
                "  VERSION: " + this.version + "\n" +
                "  AGENT_ID: " + this.agentId + "\n" +
                "  PAYLOAD_SIZE: " + this.payloadSize + "\n";
    }
}

export default AlertFlow;