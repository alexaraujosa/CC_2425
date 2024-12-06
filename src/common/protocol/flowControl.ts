/**
 * @module FlowControl
 * 
 * @description This modules contains implementations of the FlowControl used by an entity
 * (Server or Client) to control the window, the number of retransmission try, the recovery list, and more.
 * 
 * @copyright Copyright (c) 2024 Pauloarf https://github.com/Pauloarf
 */

import { NetTask, NetTaskDatagramType, NetTaskRejectedReason } from "$common/datagram/NetTask.js";
import { getOrCreateGlobalLogger } from "$common/util/logger.js";

/**
 * This variable is used to set the maximum payload size... A bigger payload casuas fragmentation
 */
const MAX_PAYLOAD_SIZE = 1425;

/**
 * This class helps in the creation of custom errors.
 *
 * @class CustomError
 * @extends {Error}
 */
class CustomError extends Error {
    constructor(message: string) {
        super(message); // Passa a mensagem para a classe base `Error`
        this.name = this.constructor.name; // Define o nome da exceção para a classe atual
        Error.captureStackTrace(this, this.constructor); // Garante uma stack trace limpa
    }
}

/**
 * This error is used to identenfy when a received package is duplicated.
 *
 * @class DuplicatedPackageError
 * @extends {CustomError}
 */
class DuplicatedPackageError extends CustomError {
    constructor(sequenceNumber: number) {
        super(`The received package is duplicated! Seq: ${sequenceNumber}`);
    }
}

/**
 * This error is used to identenfy when a received package is out-of-order.
 *
 * @class OutOfOrderPackageError
 * @extends {CustomError}
 */
class OutOfOrderPackageError extends CustomError {
    constructor(expected: number, received: number) {
        super(`The received package is out of order! Expected: ${expected}; Received: ${received}`);
    }
}

/**
 * This error is used to identenfy when maximun transmission try are reached.
 *
 * @class MaxRetransmissionsReachedError
 * @extends {CustomError}
 */
class MaxRetransmissionsReachedError extends CustomError {
    constructor(sequenceNumber: number) {
        super(`Max retransmissions reached for package ${sequenceNumber}`);
    }
}

/**
 * This error is used to identenfy when the max window size is reached.
 *
 * @class ReachedMaxWindowError
 * @extends {CustomError}
 */
class ReachedMaxWindowError extends CustomError {
    constructor() {
        super(`Max window reached...`);
    }
}

/**
 * This error is used to identenfy when a connection is rejected.
 *
 * @class ConnectionRejected
 * @extends {CustomError}
 */
class ConnectionRejected extends CustomError {
    constructor(reason: NetTaskRejectedReason) {
        super(`Connection was rejected with reason: ${NetTaskRejectedReason[reason]}.`);
    }
}

/**
 * A FlowControl object that helps keep in track the sequence number of the last received package,
 * the last acknolagment given, a list of the last 20 packages sent, and more. It helps control more
 * than just flow, it controls most aspects of the connection, including fragmentation, timers for
 * ratransmission and more.
 * 
 * (04/12/2024) Fragmentations remains not implemented
 * 
 * @example
 * const fwc = new FlowControl(); ||  const fwc = new FlowControl(5); 
 * fwc.controlledSend(datagram);
 */
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

    /**
     * Creates an instance of FlowControl.
     * @param {number} [packetWindow=3]
     * @param {number} [retransmissionTimeout=5000]
     * @param {number} [maxRetransmissions=3]
     * @memberof FlowControl
     */
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

    public setLastSeq(seq: number) { this.lastSeq = seq; return this; }

    public setLastAck(ack: number) { this.lastAck = ack; return this; }

    //public addMsgToBuffer(msg: Buffer){
    //    return msg;
    //}

    /**
     * Adds the datagram used as input to the controlled queue. Then returns the first element, which
     * is the one that should be sent. This assures that the MaxWindow size is never reached.
     *
     * @param {NetTask} [dg]
     * @return {*}  {NetTask}
     * @memberof FlowControl
     */
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

    /**
     * Retrives from the revocery list an old datagram with the sequence number equals to 
     * the one used in input. If the datagram does not existe in the recovery list, returns an error.
     *
     * @param {number} seq
     * @return {*}  {NetTask}
     * @memberof FlowControl
     */
    public getDgFromRecoveryList(seq: number): NetTask{
        for (const dg of this.recoveryList){
            if(dg.getSequenceNumber() === seq){
                return dg;
            }
        }
        throw new Error("Package not found, it was already deleted!");
    }

    /**
     * It prepeares the flowControl object for the action of sending a datagram, by adding it to 
     * the recovery list and setting the internal flowControl sequence number to plus one. This
     * assures that the next this.getLastSeq() retrives the correct value for the next datagram creation.
     *
     * @param {NetTask} dg
     * @memberof FlowControl
     */
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

    /**
     * Starts a timer for the datagram passed as a parameter. Afte the timer runs out. It try to retransmit.
     *
     * @param {NetTask} dg
     * @param {(seqNumber: number) => void} onTimeout
     * @memberof FlowControl
     */
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

    /**
     * This funciton evaluates if the connection is a new register and restart the flowControl values.
     * If it is not a register, verifies duplication an throws an error if duplicated.
     * If it is new, it verifies if the package is out-of-order, throwing an error if is.
     * Lastly, if everything is correct, removes the timer for the datagram that was acknowlegd by
     * the one used as a parameter.
     *
     * @param {NetTask} dg
     * @return {*} 
     * @memberof FlowControl
     */
    public evaluateConnection(dg: NetTask) {
        const isCorrect = true;
    
        if (dg.getType() === NetTaskDatagramType.CONNECTION_REJECTED) {
            // throw new ConnectionRejected(dg.getReason());
            return isCorrect;
        }

        // Wake defines a new connection. If valid, will reset the current flow control and give a new sequence number.
        if (dg.getType() === NetTaskDatagramType.WAKE) {
            return isCorrect;
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

    public reset(newSeq: number = 1) {
        this.completeMsg = {};
        this.lastSeq = newSeq;
        this.lastAck = newSeq - 1;
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