import { NetTask, NetTaskDatagramType } from "$common/datagram/NetTask.js";
import { getOrCreateGlobalLogger } from "$common/util/logger.js";

const MAX_PAYLOAD_SIZE = 1425;

class CustomError extends Error {
    constructor(message: string) {
        super(message); // Passa a mensagem para a classe base `Error`
        this.name = this.constructor.name; // Define o nome da exceção para a classe atual
        Error.captureStackTrace(this, this.constructor); // Garante uma stack trace limpa
    }
}

class DuplicatedPackageError extends CustomError {
    constructor(sequenceNumber: number) {
        super(`The received package is duplicated! Seq: ${sequenceNumber}`);
    }
}

class OutOfOrderPackageError extends CustomError {
    constructor(expected: number, received: number) {
        super(`The received package is out of order! Expected: ${expected}; Received: ${received}`);
    }
}

class MaxRetransmissionsReachedError extends CustomError {
    constructor(sequenceNumber: number) {
        super(`Max retransmissions reached for package ${sequenceNumber}`);
    }
}

class ReachedMaxWindowError extends CustomError {
    constructor() {
        super(`Max window reached...`);
    }
}

class ConnectionRejected extends CustomError {
    constructor() {
        super(`Connection was rejected!!`);
    }
}

class FlowControl{
    private completeMsg: {
        [nrSeq: number] : Buffer;
    };
    private lastSeq: number;
    private lastAck: number;
    private packetWindow: number;
    private recoveryList: NetTask[];
    private packetsToSend: NetTask[];
    private preventDups: number[];

    private timers: Map<number, NodeJS.Timeout>;
    private retransmissionCounts: Map<number, number>;
    private retransmissionTimeout: number;
    private maxRetransmissions: number;

    public constructor(packetWindow: number = 3, retransmissionTimeout: number = 5000, maxRetransmissions: number = 3) {
        this.completeMsg = {};
        this.lastSeq = 1;
        this.lastAck = 0;
        this.packetWindow = packetWindow;
        this.recoveryList = [];
        this.packetsToSend = [];
        this.preventDups = [];
        this.timers = new Map<number, NodeJS.Timeout>();
        this.retransmissionCounts = new Map<number, number>();
        this.retransmissionTimeout = retransmissionTimeout;
        this.maxRetransmissions = maxRetransmissions;
    }

    public getCompleteMsg() { return this.completeMsg; }
    public getLastSeq() { return this.lastSeq; }
    public getLastAck() { return this.lastAck; }

    public setLastSeq(seq: number) {this.lastSeq = seq; }
    public setLastAck(ack: number) {this.lastAck = ack; }

    public addMsgToBuffer(msg: Buffer){
        return msg;
    }

    public controlledSend(dg?: NetTask): NetTask {
        const logger = getOrCreateGlobalLogger();
        if ( dg ) {
            if(dg.getPayloadSize() <= MAX_PAYLOAD_SIZE){
                this.packetsToSend.push(dg);
            } else {
                // TODO: 
                logger.warn("Added a package that should be fragmented! - Fragmentation not implemented");
                this.packetsToSend.push(dg);
                //const nrDgNecessary = Math.ceil(dg.getPayloadSize() / MAX_PAYLOAD_SIZE);
                //Criar nrDGNecessary de datagramas
                //roubar o payload a mais e colocar nos restantes
            }
        }
        if(this.timers.size >= this.packetWindow){
            throw new ReachedMaxWindowError();
        }
        const dgToSend = this.packetsToSend.pop();
        if(!dgToSend){
            throw new Error(`There is no datagram to send...`);
        }
        return dgToSend;
    }

    private addToRecoveryList(dg: NetTask){
        if(this.recoveryList.length <= 20){
            this.recoveryList.push(dg);
        } else {
            this.recoveryList.shift();
            this.recoveryList.push(dg);
        }
    }

    public getDgFromRecoveryList(seq: number): NetTask{
        for (const dg of this.recoveryList){
            if(dg.getSequenceNumber() === seq){
                return dg;
            }
        }
        throw new Error("Package not found, it was already deleted!");
    }

    public readyToSend(dg: NetTask){
        this.addToRecoveryList(dg);
        this.lastSeq = this.lastSeq + 1;
    }

    private isDup(nr: number){
        return this.preventDups.includes(nr); 
    }

    private isNewConnection(dgType: NetTaskDatagramType){
        return(dgType === NetTaskDatagramType.REQUEST_REGISTER);
    }

    private isRetransmissionNecessary(nr: number){
        return (nr > this.lastAck+1);
    }

    private addToPreventDups(nr: number){
        if(this.preventDups.length <= 5){
            this.preventDups.push(nr);
        } else {
            this.preventDups.shift();
            this.preventDups.push(nr);
        }
    }

    public startTimer(dg: NetTask, onTimeout: (seqNumber: number) => void) {
        const logger = getOrCreateGlobalLogger();
        const seqNumber = dg.getSequenceNumber();
    
        const currentCount = this.retransmissionCounts.get(seqNumber) || 0;
        if (currentCount >= this.maxRetransmissions) {
            throw new MaxRetransmissionsReachedError(seqNumber);
        }
        this.retransmissionCounts.set(seqNumber, currentCount + 1);
    
        if (this.timers.has(seqNumber)) {
            clearTimeout(this.timers.get(seqNumber)!);
            logger.log(`Timer existente para ${seqNumber} redefinido.`);
        } else {
            logger.log(`Timer adicionado para ${seqNumber}.`);
        }
    
        const timer = setTimeout(() => {
            logger.warn(`Timeout: Pacote ${seqNumber} não foi reconhecido.`);
            onTimeout(seqNumber);
        }, this.retransmissionTimeout);
    
        this.timers.set(seqNumber, timer);
    }
    

    private clearTimer(seqNumber: number) {
        const logger = getOrCreateGlobalLogger();
        logger.log(`Removido timer para ${seqNumber}`);
        if (this.timers.has(seqNumber)) {
            clearTimeout(this.timers.get(seqNumber)!);
            this.timers.delete(seqNumber);
        }
        this.retransmissionCounts.delete(seqNumber);
    }

    //This function evaluates if the connection is a register, and restarts the values if so
    //If it is not, verifies duplications and throws an error if duplicated.
    //If it is new i need to verify if it is an advanced package
    //If it is a god one, remove the acked dg from the list, and anwser to this one.
    public evaluateConnection(dg: NetTask) {
        const isCorrect = true;
    
        if (dg.getType() === NetTaskDatagramType.CONNECTION_REJECTED){
            throw new ConnectionRejected();
        }
        
        if (this.isNewConnection(dg.getType())) {
            this.reset();
        }
    
        if (this.isDup(dg.getSequenceNumber())) {
            throw new DuplicatedPackageError(dg.getSequenceNumber());
        }
    
        if (this.isRetransmissionNecessary(dg.getSequenceNumber())) {
            throw new OutOfOrderPackageError(this.getLastAck() + 1, dg.getSequenceNumber());
        }
        
        this.clearTimer(dg.getAcknowledgementNumber());

        this.recoveryList = this.recoveryList.filter(
            r => r.getAcknowledgementNumber() !== dg.getAcknowledgementNumber()
        );

        this.lastAck = dg.getSequenceNumber();
        this.addToPreventDups(dg.getSequenceNumber());
        return isCorrect;
    }    

    private reset() {
        this.completeMsg = {};
        this.lastSeq = 1;
        this.lastAck = 0;
        this.recoveryList = [];
        this.preventDups = [];

        this.timers.forEach((timer) => clearTimeout(timer));
        this.timers.clear();
    }
}

export {
    FlowControl,
    DuplicatedPackageError,
    OutOfOrderPackageError,
    MaxRetransmissionsReachedError,
    ReachedMaxWindowError,
    ConnectionRejected
};