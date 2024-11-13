/**
 * @module NetTask
 * 
 * Common definition of the NetTask Protocol. Used in both the AGENT and SERVER solutions for the implementation
 * of a responsive and resilient communication.
 * 
 * @copyright Copyright (c) 2024 DarkenLM https://github.com/DarkenLM
 */

import { ECDHE } from "$common/protocol/ecdhe.js";
import { BufferReader, BufferWriter } from "$common/util/buffer.js";
import { getOrCreateGlobalLogger } from "$common/util/logger.js";

//#region ============== Constants ==============
const NET_TASK_VERSION = 1;
const NET_TASK_SIGNATURE = Buffer.from("NTTK", "utf8");

enum NetTaskDatagramType {
    REQUEST_REGISTER,
    REGISTER_CHALLENGE,
    REGISTER_CHALLENGE2,
    REQUEST_TASK,
    REQUEST_METRICS,
    RESPONSE_TASK,
    RESPONSE_METRICS
};
//#endregion ============== Constants ==============

/**
 * This class represents a message datagram used between the Agent and Server solutions
 * to transmit tasks and metric colletions.
 */
class NetTask {
    private version: number;
    private sequenceNumber: number;
    private acknowledgementNumber: number;
    private type: NetTaskDatagramType;
    private payloadSize: number;

    public constructor(
        sequenceNumber: number,
        acknowledgementNumber: number,
        type: NetTaskDatagramType,
        payloadSize: number
    ) {
        this.version = NET_TASK_VERSION;
        this.sequenceNumber = sequenceNumber;
        this.acknowledgementNumber = acknowledgementNumber;
        this.type = type;
        this.payloadSize = payloadSize;
    }

    public getVersion(): number { return this.version; }
    public getSequenceNumber(): number { return this.sequenceNumber; }
    public getAcknowledgementNumber(): number { return this.acknowledgementNumber; }
    public getType(): NetTaskDatagramType { return this.type; }
    public getPayloadSize(): number { return this.payloadSize; }

    public toString(): string {
        return  "--< NET TASK >--\n" +
                "  VERSION: " + this.version + "\n" +
                "  SEQUENCE_NUMBER: " + this.sequenceNumber + "\n" +
                "  ACKNOWLEDGEMENT_NUMBER: " + this.acknowledgementNumber + "\n" +
                "  TYPE: " + this.type + "\n" +
                "  PAYLOAD_SIZE: " + this.payloadSize + "\n";
    }

    /**
     * First phase of the deserialization, used to verify the signature of a NetTask Datagram. 
     * Should always be used before {@link readNetTaskDatagram} method.
     * @param reader BufferReader instanciated with a message buffer received from the server.
     * @returns A boolean representing whether or not the signature is valid.
     */
    public static verifySignature(reader: BufferReader): boolean {
        const sig = reader.read(4);

        return NET_TASK_SIGNATURE.equals(sig);
    }

    /**
     * Second phase of the deserialization, returning a NetTask Datagram from a given message buffer.
     * @param reader BufferReader instanciated with a message buffer received from the server.
     * @returns A NetTask instance representing the deserialized message.
     */
    public static readNetTaskDatagram(reader: BufferReader): NetTask {
        const logger = getOrCreateGlobalLogger();
        const version = reader.readUInt32();
        if(version != NET_TASK_VERSION) {
            logger.pError(`NETTASK Datagram Invalid Version. Excepted: ${NET_TASK_VERSION}. Received: ${version}.`)
        }

        const sequenceNumber = reader.readUInt32();
        const acknowledgementNumber = reader.readUInt32();
        const type = reader.readUInt32();
        const payloadSize = reader.readUInt32();

        return new NetTask(sequenceNumber, acknowledgementNumber, type, payloadSize);
    }

    /**
     * Serializes a {@link NetTask} object into network-transmittable buffers.
     */
    public makeNetTaskDatagram(): Buffer {
        const writer = new BufferWriter();
        writer.write(NET_TASK_SIGNATURE);
        writer.writeUInt32(this.version);
        writer.writeUInt32(this.sequenceNumber);
        writer.writeUInt32(this.acknowledgementNumber);
        writer.writeUInt32(this.type);
        writer.writeUInt32(this.payloadSize);

        return writer.finish();
    }
}

//#region ============== REGISTER PROCESS ==============
class NetTaskRegister extends NetTask {
    private _publicKey: Buffer;

    public constructor (
        sequenceNumber: number,
        acknowledgementNumber: number,
        payloadSize: number,
        publicKey: Buffer
    ) {
        super(
            sequenceNumber, 
            acknowledgementNumber, 
            NetTaskDatagramType.REQUEST_REGISTER, 
            payloadSize
        );
        this._publicKey = publicKey;
    }

    public get publicKey(): Buffer { return this._publicKey; }

    public makeNetTaskRegisterDatagram(): Buffer {
        const writer = super.makeNetTaskDatagram();
        const newWriter = new BufferWriter();
        newWriter.write(writer);
        newWriter.writeUInt32(this._publicKey.byteLength);
        newWriter.write(this._publicKey);

        return newWriter.finish();
    }

    public static readNetTaskRegisterDatagram(reader: BufferReader, dg: NetTask): NetTaskRegister {
        if (dg.getType() != NetTaskDatagramType.REQUEST_REGISTER) {
            // TODO: Error handler
        }

        const publicKeyLen = reader.readUInt32();
        const publicKey = reader.read(publicKeyLen);

        return new NetTaskRegister(
            dg.getSequenceNumber(), 
            dg.getAcknowledgementNumber(), 
            dg.getPayloadSize(), 
            publicKey
        );
    }
}

class NetTaskRegisterChallenge extends NetTask {
    private _publicKey: Buffer;
    private _challenge: Buffer;
    private _salt: Buffer;

    public constructor (
        sequenceNumber: number,
        acknowledgementNumber: number,
        payloadSize: number,
        publicKey: Buffer,
        challenge: Buffer,
        salt: Buffer
    ) {
        super(
            sequenceNumber,
            acknowledgementNumber,
            NetTaskDatagramType.REGISTER_CHALLENGE, 
            payloadSize
        );
        this._publicKey = publicKey;
        this._challenge = challenge;
        this._salt = salt;
    }

    public get publicKey(): Buffer { return this._publicKey; }
    public get salt(): Buffer { return this._salt; }
    public get challenge(): Buffer { return this._challenge; }

    public makeNetTaskRegisterChallenge(): Buffer {
        const writer = super.makeNetTaskDatagram();
        const newWriter = new BufferWriter();
        newWriter.write(writer);
        newWriter.writeUInt32(this._publicKey.byteLength);
        newWriter.write(this._publicKey);
        newWriter.writeUInt32(this._challenge.byteLength);
        newWriter.write(this._challenge);
        newWriter.writeUInt32(this._salt.byteLength);
        newWriter.write(this._salt);

        return newWriter.finish();
    }

    public static readNetTaskRegisterChallenge(reader: BufferReader, dg: NetTask): NetTaskRegisterChallenge {
        if (dg.getType() != NetTaskDatagramType.REGISTER_CHALLENGE) {
            // TODO: Error handler
        }

        const publicKeyLen = reader.readUInt32();
        const publicKey = reader.read(publicKeyLen);
        const challengeLen = reader.readUInt32();
        const challenge = reader.read(challengeLen);
        const saltLen = reader.readUInt32();
        const salt = reader.read(saltLen);

        return new NetTaskRegisterChallenge(
            dg.getSequenceNumber(), 
            dg.getAcknowledgementNumber(), 
            dg.getPayloadSize(), 
            publicKey, 
            challenge,
            salt
        );
    }
}

class NetTaskRegisterChallenge2 extends NetTask {
    private _challenge: Buffer;

    public constructor (
        sequenceNumber: number,
        acknowledgementNumber: number,
        payloadSize: number,
        challenge: Buffer
    ) {
        super(
            sequenceNumber,
            acknowledgementNumber,
            NetTaskDatagramType.REGISTER_CHALLENGE2, 
            payloadSize
        );
        this._challenge = challenge;
    }

    public get challenge(): Buffer { return this._challenge; }

    public makeNetTaskRegisterChallenge2(): Buffer {
        const writer = super.makeNetTaskDatagram();
        const newWriter = new BufferWriter();
        newWriter.write(writer);
        newWriter.writeUInt32(this._challenge.byteLength);
        newWriter.write(this._challenge);

        return newWriter.finish();
    }

    public static readNetTaskRegisterChallenge2(reader: BufferReader, dg: NetTask): NetTaskRegisterChallenge2 {
        if (dg.getType() != NetTaskDatagramType.REGISTER_CHALLENGE2) {
            // TODO: Error handler
        }

        const challengeLen = reader.readUInt32();
        const challenge = reader.read(challengeLen);

        return new NetTaskRegisterChallenge2(
            dg.getSequenceNumber(), 
            dg.getAcknowledgementNumber(), 
            dg.getPayloadSize(), 
            challenge
        );
    }
}

//#endregion ============== REGISTER PROCESS ==============


class NetTaskRequestTask extends NetTask {
    private message: string;
    private ecdhe?: ECDHE;

    public constructor(
        sequenceNumber: number,
        acknowledgementNumber: number,
        payloadSize: number,
        message: string
    ) {
        super(sequenceNumber, acknowledgementNumber, NetTaskDatagramType.REQUEST_TASK, payloadSize);
        this.message = message;
    }

    public link(ecdhe: ECDHE): this {
        this.ecdhe = ecdhe;
        return this;
    }

    public makeNetTaskRequestTask(): Buffer {
        if (!this.ecdhe) {
            // TODO: Throw error
            throw new Error("Error 404 joke");
        }
        const writer = super.makeNetTaskDatagram();
        const newWriter = new BufferWriter();
        const enc = this.ecdhe?.encrypt(this.message);
        const sencENC = ECDHE.serializeEncryptedMessage(enc);
        newWriter.write(writer);
        newWriter.writeUInt32(sencENC.byteLength);
        newWriter.write(sencENC);
        
        return newWriter.finish();
    }

    public static deserialize(reader: BufferReader, ecdhe: ECDHE, dg: NetTask): NetTaskRequestTask {
        if (dg.getType() != NetTaskDatagramType.REQUEST_TASK) {
            // TODO: Error handler
        }

        const senencLen = reader.readUInt32();
        const senenc = reader.read(senencLen);
        const desMessage = ECDHE.deserializeEncryptedMessage(senenc);
        const message = ecdhe.decrypt(desMessage);
        return new NetTaskRequestTask(123123, 123123, 0, message.toString());
    }

}

export {
    NetTask,
    NetTaskDatagramType,
    NetTaskRegister,
    NetTaskRegisterChallenge,
    NetTaskRegisterChallenge2,
    NetTaskRequestTask
};