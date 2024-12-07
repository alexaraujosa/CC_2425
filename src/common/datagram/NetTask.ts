/**
 * @module NetTask
 * 
 * Common definition of the NetTask Protocol. Used in both the AGENT and SERVER solutions for the implementation
 * of a responsive and resilient communication.
 * 
 * @copyright Copyright (c) 2024 DarkenLM https://github.com/DarkenLM
 */

import { ECDHE, HASH_LEN } from "$common/protocol/ecdhe.js";
import { BufferReader, BufferWriter } from "$common/util/buffer.js";
import { DefaultLogger, getOrCreateGlobalLogger } from "$common/util/logger.js";
import { _SPACKTask, deserializeSPACK, isSPACKTaskCollection, packTaskSchemas, serializedTaskMetric as serializeTaskMetric, serializeSPACK, SPACKPacked, SPACKTask, SPACKTaskCollectionPacked, SPACKTaskMetric, unpackTaskSchemas, deserializeTaskMetric } from "./spack.js";
import dedent from "$common/util/dedent.js";
import { dropEmpty } from "$common/util/object.js";

//#region ============== Types ==============
interface NetTaskPublicHeader {
    cryptoMark: Buffer,
    sessionId: Buffer,
    payloadSize: number
    moreFragments: boolean,
    offset: number
};
//#endregion ============== Types ==============

//#region ============== Constants ==============
const NET_TASK_VERSION = 1;
const NET_TASK_SIGNATURE = Buffer.from("NTTK", "utf8");
const NET_TASK_CRYPTO    = Buffer.from("CC", "utf8");
const NET_TASK_NOCRYPTO  = Buffer.from("NC", "utf8");
const NET_TASK_WAKE_PING = Buffer.from("WAKEPING", "utf8");

enum NetTaskDatagramType {
    BODYLESS,
    //#region ------- REGISTER PROCESS -------
    REQUEST_REGISTER,
    REGISTER_CHALLENGE,
    REGISTER_CHALLENGE2,
    CONNECTION_REJECTED,
    CONNECTION_RESET,
    //#endregion ------- REGISTER PROCESS -------
    PUSH_SCHEMAS,
    SEND_METRICS,
    // REQUEST_METRICS,
    // RESPONSE_TASK,
    // RESPONSE_METRICS
    WAKE,
};

enum NetTaskRejectedReason {
    NULL,
    UNKNOWN,
    CRYPTO_ERROR,
    AUTH_ERROR,
}
//#endregion ============== Constants ==============
/**
 * This class represents a message datagram used between the Agent and Server solutions
 * to transmit tasks and metric colletions.
 */
class NetTask {
    protected sessionId: Buffer;
    protected cryptoMark: Buffer;
    protected version: number;
    protected sequenceNumber: number;
    protected moreFragments: boolean;
    protected offset: number;
    protected acknowledgementNumber: number;
    protected nacknowledgementNumber: number;
    protected type: NetTaskDatagramType;
    protected payloadSize: number;
    protected logger!: DefaultLogger;

    public constructor(
        sessionId: Buffer,
        cryptoMark: Buffer,
        sequenceNumber: number,
        acknowledgementNumber: number,
        nacknowledgementNumber: number,
        moreFragments: boolean,
        offset: number,
        type: NetTaskDatagramType,
        payloadSize: number
    ) {
        this.sessionId = sessionId;
        this.cryptoMark = cryptoMark;
        this.version = NET_TASK_VERSION;
        this.sequenceNumber = sequenceNumber;
        this.acknowledgementNumber = acknowledgementNumber;
        this.nacknowledgementNumber = nacknowledgementNumber;
        this.moreFragments = moreFragments;
        this.offset = offset;
        this.type = type;
        this.payloadSize = payloadSize;

        // this.logger = getOrCreateGlobalLogger();
        Object.defineProperty(this, "logger", {
            value: getOrCreateGlobalLogger(),
            enumerable: false,
            configurable: true
        });
    }

    public getSessionId(): Buffer { return this.sessionId; }
    public getCryptoMark(): Buffer { return this.cryptoMark; }
    public getVersion(): number { return this.version; }
    public getSequenceNumber(): number { return this.sequenceNumber; }
    public getAcknowledgementNumber(): number { return this.acknowledgementNumber; }
    public getNAcknowledgementNumber(): number { return this.nacknowledgementNumber; }
    public getMoreFragmentsFlag(): boolean { return this.moreFragments; }
    public getOffset(): number { return this.offset; }
    public getType(): NetTaskDatagramType { return this.type; }
    public getPayloadSize(): number { return this.payloadSize; }

    public setNack(nack: number){
        this.nacknowledgementNumber = nack;
    }

    public toString(): string {
        // return  "--< NET TASK >--\n" +
        //         "  VERSION: " + this.version + "\n" +
        //         "  SEQUENCE_NUMBER: " + this.sequenceNumber + "\n" +
        //         "  ACKNOWLEDGEMENT_NUMBER: " + this.acknowledgementNumber + "\n" +
        //         "  HAS_MORE_FRAGMENYS: " + this.moreFragments + "\n" +
        //         "  TYPE: " + this.type + "\n" +
        //         "  PAYLOAD_SIZE: " + this.payloadSize + "\n";
        return dedent`"
            --< NET TASK >--
                - SESSION ID: ${this.sessionId}
                - ENCRYPTED: ${NET_TASK_CRYPTO.equals(this.cryptoMark)}
                - VERSION: ${this.version}
                - SEQUENCE_NUMBER: ${this.sequenceNumber}
                - ACKNOWLEDGEMENT_NUMBER: ${this.acknowledgementNumber}
                - N_ACKNOWLEDGEMENT_NUMBER: ${this.nacknowledgementNumber}
                - HAS_MORE_FRAGMENTS: ${this.moreFragments}
                - OFFSET: ${this.offset}
                - TYPE: ${NetTaskDatagramType[this.type]}
                - PAYLOAD_SIZE: ${this.payloadSize}
        `;
    }

    public static isEncrypted(nt: NetTask): boolean;
    public static isEncrypted(pheader: NetTaskPublicHeader): boolean;
    public static isEncrypted(ntph: NetTask | NetTaskPublicHeader): boolean {
        const cryptoMark = ntph instanceof NetTask ? ntph.cryptoMark : ntph.cryptoMark; // Needed because TS.

        return NET_TASK_CRYPTO.equals(cryptoMark);
    }

    /**
     * First phase of the deserialization, used to verify the signature of a NetTask Datagram. 
     * Should always be used before {@link deserializeHeader} method.
     * @param reader BufferReader instanciated with a message buffer received from the server.
     * @returns A boolean representing whether or not the signature is valid.
     */
    public static verifySignature(reader: BufferReader): boolean {
        const sig = reader.read(4);

        return NET_TASK_SIGNATURE.equals(sig);
    }

    // /**
    //  * Second phase of the deserialization, returning a NetTask Datagram from a given message buffer.
    //  * @param reader BufferReader instanciated with a message buffer received from the server.
    //  * @returns A NetTask instance representing the deserialized message.
    //  */
    // public static deserializeHeader(reader: BufferReader): NetTask {
    //     const logger = getOrCreateGlobalLogger();
    //     const version = reader.readUInt32();
    //     if(version != NET_TASK_VERSION) {
    //         logger.pError(`NETTASK Datagram Invalid Version. Excepted: ${NET_TASK_VERSION}. Received: ${version}.`);
    //     }

    //     const sequenceNumber = reader.readUInt32();
    //     const acknowledgementNumber = reader.readUInt32();
    //     const MoreFragmentsBool = reader.readInt8();
    //     const type = reader.readUInt32();
    //     const payloadSize = reader.readUInt32();

    //     return new NetTask(sequenceNumber, acknowledgementNumber, !!moreFragmentsBool, type, payloadSize);
    // }

    // /**
    //  * Serializes a {@link NetTask} object into network-transmittable buffers.
    //  */
    // public serializeHeader(): Buffer {
    //     const writer = new BufferWriter();
    //     writer.write(NET_TASK_SIGNATURE);
    //     writer.writeUInt32(this.version);
    //     writer.writeUInt32(this.sequenceNumber);
    //     writer.writeUInt32(this.acknowledgementNumber);
    //     writer.writeUInt8(+this.moreFragments);
    //     writer.writeUInt32(this.type);
    //     writer.writeUInt32(this.payloadSize);

    //     return writer.finish();
    // }

    public serializePublicHeader(): Buffer {
        const writer = new BufferWriter();
        writer.write(NET_TASK_SIGNATURE);
        writer.write(this.sessionId);
        writer.write(this.cryptoMark);
        writer.writeUInt32(this.payloadSize);
        writer.writeUInt8(+this.moreFragments);
        writer.writeUInt32(this.offset);

        return writer.finish();
    }

    public serializePrivateHeader(): Buffer {
        const writer = new BufferWriter();

        writer.writeUInt32(this.version);
        writer.writeUInt32(this.sequenceNumber);
        writer.writeUInt32(this.acknowledgementNumber);
        writer.writeUInt32(this.nacknowledgementNumber);
        writer.writeUInt32(this.type); 

        return writer.finish();
    }

    public static deserializePublicHeader(reader: BufferReader): NetTaskPublicHeader {
        const sessionId = reader.read(HASH_LEN);

        const cryptoMark = reader.read(NET_TASK_CRYPTO.byteLength);
        if (!NET_TASK_CRYPTO.equals(cryptoMark) && !NET_TASK_NOCRYPTO.equals(cryptoMark)) {
            throw new Error(`[NT] Deserialization Error: Invalid crypto mark. Received: ${cryptoMark.toString("hex")}`);
        }

        const payloadSize = reader.readUInt32();
        const moreFragments = reader.readUInt8();
        const offset = reader.readUInt32();

        return { sessionId, cryptoMark, payloadSize, moreFragments: !!moreFragments, offset };
    }

    public static deserializePrivateHeader(reader: BufferReader, partialHeader: NetTaskPublicHeader) {
        const version = reader.readUInt32();
        if (version !== NET_TASK_VERSION) {
            throw new Error(`[NT] Deserialization Error: Invalid Version. Excepted: ${NET_TASK_VERSION}. Received: ${version}.`);
        }

        const sequenceNumber = reader.readUInt32();
        const acknowledgementNumber = reader.readUInt32();
        const nacknowledgementNumber = reader.readUInt32();
        const type = reader.readUInt32();

        return new NetTask(
            partialHeader.sessionId, 
            partialHeader.cryptoMark, 
            sequenceNumber,
            acknowledgementNumber, 
            nacknowledgementNumber, 
            partialHeader.moreFragments, 
            partialHeader.offset,
            type, 
            partialHeader.payloadSize
        );
    }
}

class NetTaskBodyless extends NetTask {
    public constructor(
        sessionId: Buffer,
        sequenceNumber: number,
        acknowledgementNumber: number,
        nacknowledgementNumber: number 
    ) {
        super(
            sessionId,
            NET_TASK_NOCRYPTO,
            sequenceNumber,
            acknowledgementNumber,
            nacknowledgementNumber,
            false,
            0,
            NetTaskDatagramType.BODYLESS,
            0
        );
    }

    public serialize() {
        const privHeader = super.serializePrivateHeader();
        this.payloadSize = privHeader.byteLength;

        const pubHeader = super.serializePublicHeader();
        const newWriter = new BufferWriter();

        newWriter.write(pubHeader);
        newWriter.write(privHeader);

        return newWriter.finish();
    }
}

class NetTaskRejected extends NetTask {
    private reasonFlag: NetTaskRejectedReason;

    public constructor(
        sessionId: Buffer,
        sequenceNumber: number,
        acknowledgementNumber: number,
        nacknowledgementNumber: number,
        reasonFlag: NetTaskRejectedReason
    ) {
        super(
            sessionId,
            NET_TASK_NOCRYPTO,
            sequenceNumber,
            acknowledgementNumber,
            nacknowledgementNumber, 
            false,
            0,
            NetTaskDatagramType.CONNECTION_REJECTED,
            0
        );

        this.reasonFlag = reasonFlag;
    }

    public getReasonFlag() {
        return this.reasonFlag;
    }

    public serialize() {
        const privHeader = super.serializePrivateHeader();
        this.payloadSize = privHeader.byteLength + 1;

        const pubHeader = super.serializePublicHeader();
        const newWriter = new BufferWriter();

        newWriter.write(pubHeader);
        newWriter.write(privHeader);
        newWriter.writeUInt8(this.reasonFlag);

        return newWriter.finish();
    }

    public static deserialize(reader: BufferReader, dg: NetTask): NetTaskRejected {
        if (dg.getType() != NetTaskDatagramType.CONNECTION_REJECTED) {
            throw new Error(`[NT_Rejected] Deserialization Error: Not a ConnectionRejected datagram.`);
        }

        const reasonFlag: NetTaskRejectedReason = reader.readUInt8();

        return new NetTaskRejected(
            dg.getSessionId(),
            dg.getSequenceNumber(),
            dg.getAcknowledgementNumber(), 
            dg.getNAcknowledgementNumber(), 
            reasonFlag
        );
    }
}

class NetTaskReset extends NetTask {
    protected ecdhe?: ECDHE;

    public constructor(
        sessionId: Buffer,
        sequenceNumber: number,
        acknowledgementNumber: number,
    ) {
        super(
            sessionId,
            NET_TASK_CRYPTO,
            sequenceNumber,
            acknowledgementNumber,
            0,
            false,
            0,
            NetTaskDatagramType.CONNECTION_RESET,
            0
        );
    }

    public link(ecdhe: ECDHE): this {
        this.ecdhe = ecdhe;
        return this;
    }

    public serialize() {
        if (!this.ecdhe) {
            throw new Error(`[NT_Wake] Serialization Error: Datagram not linked against an ECDHE instance.`);
        }

        // const privHeader = super.serializePrivateHeader();
        // this.payloadSize = privHeader.byteLength;

        // const pubHeader = super.serializePublicHeader();
        // const newWriter = new BufferWriter();

        // newWriter.write(pubHeader);
        // newWriter.write(privHeader);

        // return newWriter.finish();

        const timestampBuf = Buffer.alloc(8);
        timestampBuf.writeBigUInt64BE(BigInt(Date.now()));

        const enc = this.ecdhe.encrypt(timestampBuf);
        const serENC = ECDHE.serializeEncryptedMessage(enc);

        const payloadWriter = new BufferWriter();
        const privHeader = super.serializePrivateHeader();
        payloadWriter.write(privHeader);
        payloadWriter.writeUInt32(serENC.byteLength);
        payloadWriter.write(serENC);

        // Envelope payload
        let envelope: Buffer; 
        try {
            envelope = ECDHE.serializeEncryptedMessage(this.ecdhe.envelope(payloadWriter.finish()));
            this.payloadSize = envelope.byteLength;
        } catch (e) {
            throw new Error(`[NT_Reset] Serialization Error: Crypto error:`, { cause: e });
        }

        const pubHeader = super.serializePublicHeader();
        const dgramWriter = new BufferWriter();
        dgramWriter.write(pubHeader);
        dgramWriter.write(envelope);

        return dgramWriter.finish();
    }

    public static deserialize(reader: BufferReader, ecdhe: ECDHE, dg: NetTask): NetTaskReset {
        if (dg.getType() != NetTaskDatagramType.CONNECTION_RESET) {
            throw new Error(`[NT_Reset] Deserialization Error: Not a ConnectionReset datagram.`);
        }

        const serEncLen = reader.readUInt32();
        const serEnc = reader.read(serEncLen);
        const desMessage = ECDHE.deserializeEncryptedMessage(serEnc);
        const message = ecdhe.decrypt(desMessage);
        const timestamp = message.readBigUInt64BE();

        if (timestamp + 1_000_000n < BigInt(Date.now())) {
            throw new Error(`[NT_Reset] Deserialization Error: Reset Datagram payload is expired.`);
        }

        return new NetTaskReset(
            dg.getSessionId(), 
            dg.getSequenceNumber(), 
            dg.getAcknowledgementNumber()
        );
    }
}

//#region ============== REGISTER PROCESS ==============
class NetTaskRegister extends NetTask {
    private _publicKey: Buffer;

    public constructor (
        sessionId: Buffer,
        sequenceNumber: number,
        acknowledgementNumber: number,
        nacknowledgementNumber: number,
        moreFragments: boolean,
        offset: number,
        publicKey: Buffer
    ) {
        super(
            sessionId,
            NET_TASK_NOCRYPTO,
            sequenceNumber, 
            acknowledgementNumber,
            nacknowledgementNumber,
            moreFragments,
            offset,
            NetTaskDatagramType.REQUEST_REGISTER, 
            0
        );
        this._publicKey = publicKey;
    }

    public get publicKey(): Buffer { return this._publicKey; }

    public serialize(): Buffer {
        const privHeader = super.serializePrivateHeader();
        this.payloadSize = privHeader.byteLength + 4 + this._publicKey.byteLength;

        const pubHeader = super.serializePublicHeader();
        const newWriter = new BufferWriter();

        newWriter.write(pubHeader);
        newWriter.write(privHeader);
        newWriter.writeUInt32(this._publicKey.byteLength);
        newWriter.write(this._publicKey);

        // const logger = getOrCreateGlobalLogger();
        // logger.log("[NT_Register] WRITE BUF:", newWriter.finish().toString("hex").match(/../g));

        return newWriter.finish();
    }

    public static deserialize(reader: BufferReader, dg: NetTask): NetTaskRegister {
        if (dg.getType() != NetTaskDatagramType.REQUEST_REGISTER) {
            throw new Error(`[NT_Register] Deserialization Error: Not a Register datagram.`);
        }

        // const logger = getOrCreateGlobalLogger();
        // logger.log("[NT_Register] BUF:", reader);

        const publicKeyLen = reader.readUInt32();
        // logger.log("[NT_Register] PKLEN:", publicKeyLen);
        const publicKey = reader.read(publicKeyLen);

        return new NetTaskRegister(
            dg.getSessionId(),
            dg.getSequenceNumber(), 
            dg.getAcknowledgementNumber(),
            dg.getNAcknowledgementNumber(),
            dg.getMoreFragmentsFlag(), 
            dg.getOffset(), 
            publicKey
        );
    }
}

class NetTaskRegisterChallenge extends NetTask {
    private _publicKey: Buffer;
    private _challenge: Buffer;
    private _salt: Buffer;

    public constructor (
        sessionId: Buffer,
        sequenceNumber: number,
        acknowledgementNumber: number,
        nacknowledgementNumber: number,
        moreFragments: boolean,
        offset: number,
        publicKey: Buffer,
        challenge: Buffer,
        salt: Buffer
    ) {
        super(
            sessionId,
            NET_TASK_NOCRYPTO,
            sequenceNumber,
            acknowledgementNumber,
            nacknowledgementNumber,
            moreFragments,
            offset,
            NetTaskDatagramType.REGISTER_CHALLENGE, 
            0
        );
        this._publicKey = publicKey;
        this._challenge = challenge;
        this._salt = salt;
    }

    public get publicKey(): Buffer { return this._publicKey; }
    public get salt(): Buffer { return this._salt; }
    public get challenge(): Buffer { return this._challenge; }

    public serialize(): Buffer {
        const privHeader = super.serializePrivateHeader();
        this.payloadSize = privHeader.byteLength
            + this._publicKey.byteLength
            + this._challenge.byteLength
            + this._salt.byteLength
            + 4 * 3;

        const pubHeader = super.serializePublicHeader();
        const newWriter = new BufferWriter();

        newWriter.write(pubHeader);
        newWriter.write(privHeader);
        newWriter.writeUInt32(this._publicKey.byteLength);
        newWriter.write(this._publicKey);
        newWriter.writeUInt32(this._challenge.byteLength);
        newWriter.write(this._challenge);
        newWriter.writeUInt32(this._salt.byteLength);
        newWriter.write(this._salt);

        return newWriter.finish();
    }

    public static deserialize(reader: BufferReader, dg: NetTask): NetTaskRegisterChallenge {
        if (dg.getType() != NetTaskDatagramType.REGISTER_CHALLENGE) {
            throw new Error(`[NT_RegisterChallenge] Deserialization Error: Not a RegisterChallenge datagram.`);
        }

        const publicKeyLen = reader.readUInt32();
        const publicKey = reader.read(publicKeyLen);
        const challengeLen = reader.readUInt32();
        const challenge = reader.read(challengeLen);
        const saltLen = reader.readUInt32();
        const salt = reader.read(saltLen);

        return new NetTaskRegisterChallenge(
            dg.getSessionId(),
            dg.getSequenceNumber(), 
            dg.getAcknowledgementNumber(),
            dg.getNAcknowledgementNumber(),
            dg.getMoreFragmentsFlag(),
            dg.getOffset(), 
            publicKey, 
            challenge,
            salt
        );
    }
}

// class NetTaskRegisterChallenge2 extends NetTask {
//     private _challenge: Buffer;
//     private ecdhe?: ECDHE;

//     public constructor (
//         sessionId: Buffer,
//         sequenceNumber: number,
//         acknowledgementNumber: number,
//         moreFragments: boolean,
//         payloadSize: number,
//         challenge: Buffer
//     ) {
//         super(
//             sessionId,
//             NET_TASK_CRYPTO,
//             sequenceNumber,
//             acknowledgementNumber,
//             moreFragments,
//             NetTaskDatagramType.REGISTER_CHALLENGE2, 
//             payloadSize
//         );
//         this._challenge = challenge;
//     }

//     public get challenge(): Buffer { return this._challenge; }

//     public link(ecdhe: ECDHE): this {
//         this.ecdhe = ecdhe;
//         return this;
//     }

//     public serialize(): Buffer {
//         if (!this.ecdhe) {
//             throw new Error(`[NT_RegisterChallenge2] Serialization Error: Datagram not linked against an ECDHE instance.`);
//         }
        
//         // Write Payload
//         const payloadWriter = new BufferWriter();
//         const privHeader = super.serializePrivateHeader();

//         payloadWriter.write(privHeader);
//         payloadWriter.writeUInt32(this._challenge.byteLength);
//         payloadWriter.write(this._challenge);


//         const logger = getOrCreateGlobalLogger();

//         // Envelope payload
//         let envelope: Buffer; 
//         try {
//             const msg = this.ecdhe.envelope(payloadWriter.finish());
//             logger.log("[NT_RegisterChallenge2] MSG:", msg);
//             envelope = ECDHE.serializeEncryptedMessage(msg);
//             this.payloadSize = envelope.byteLength;
//         } catch (e) {
//             throw new Error(`[NT_RegisterChallenge2] Serialization Error: Crypto error:`, { cause: e });
//         }

//         const pubHeader = super.serializePublicHeader();
//         const dgramWriter = new BufferWriter();
//         dgramWriter.write(pubHeader);
//         dgramWriter.write(envelope);

//         logger.log(
//             "[NT_RegisterChallenge2] BUF:", 
//             envelope.toString("hex").match(/../g), 
//             envelope.byteLength, 
//             this.payloadSize
//         );

//         return dgramWriter.finish();
//     }

//     public static deserialize(reader: BufferReader, dg: NetTask): NetTaskRegisterChallenge2 {
//         if (dg.getType() != NetTaskDatagramType.REGISTER_CHALLENGE2) {
//             throw new Error(`[NT_RegisterChallenge2] Deserialization Error: Not a RegisterChallenge2 datagram.`);
//         }

//         const challengeLen = reader.readUInt32();
//         const challenge = reader.read(challengeLen);

//         return new NetTaskRegisterChallenge2(
//             dg.getSessionId(),
//             dg.getSequenceNumber(), 
//             dg.getAcknowledgementNumber(), 
//             dg.getMoreFragmentsFlag(),
//             dg.getPayloadSize(), 
//             challenge
//         );
//     }
// }
class NetTaskRegisterChallenge2 extends NetTask {
    private _challenge: Buffer;
    private ecdhe?: ECDHE;

    public constructor (
        sessionId: Buffer,
        sequenceNumber: number,
        acknowledgementNumber: number,
        nacknowledgementNumber: number,
        moreFragments: boolean,
        offset: number,
        challenge: Buffer
    ) {
        super(
            sessionId,
            NET_TASK_NOCRYPTO,
            sequenceNumber,
            acknowledgementNumber,
            nacknowledgementNumber,
            moreFragments,
            offset,
            NetTaskDatagramType.REGISTER_CHALLENGE2, 
            0
        );
        this._challenge = challenge;
    }

    public get challenge(): Buffer { return this._challenge; }

    public link(ecdhe: ECDHE): this {
        this.ecdhe = ecdhe;
        return this;
    }

    public serialize(): Buffer {
        if (!this.ecdhe) {
            throw new Error(`[NT_RegisterChallenge2] Serialization Error: Datagram not linked against an ECDHE instance.`);
        }
        
        // Write Payload
        const privHeader = super.serializePrivateHeader();
        this.payloadSize = privHeader.byteLength + this.challenge.byteLength + 4;


        const pubHeader = super.serializePublicHeader();
        const dgramWriter = new BufferWriter();
        dgramWriter.write(pubHeader);
        dgramWriter.write(privHeader);
        dgramWriter.writeUInt32(this._challenge.byteLength);
        dgramWriter.write(this._challenge);

        return dgramWriter.finish();
    }

    public static deserialize(reader: BufferReader, dg: NetTask): NetTaskRegisterChallenge2 {
        if (dg.getType() != NetTaskDatagramType.REGISTER_CHALLENGE2) {
            throw new Error(`[NT_RegisterChallenge2] Deserialization Error: Not a RegisterChallenge2 datagram.`);
        }

        const challengeLen = reader.readUInt32();
        const challenge = reader.read(challengeLen);

        return new NetTaskRegisterChallenge2(
            dg.getSessionId(),
            dg.getSequenceNumber(), 
            dg.getAcknowledgementNumber(), 
            dg.getNAcknowledgementNumber(), 
            dg.getMoreFragmentsFlag(),
            dg.getOffset(),
            challenge
        );
    }
}

//#endregion ============== REGISTER PROCESS ==============
class NetTaskPushSchemas extends NetTask {
    private spack!: SPACKPacked | { [key: string]: SPACKTask; };
    // private message: string;
    private ecdhe?: ECDHE;

    public constructor(
        sessionId: Buffer,
        sequenceNumber: number,
        acknowledgementNumber: number,
        nacknowledgementNumber: number,
        moreFragments: boolean,
        offset: number,
        spack: SPACKPacked | { [key: string]: SPACKTask; }
        // message: string
    ) {
        super(
            sessionId, 
            NET_TASK_CRYPTO, 
            sequenceNumber, 
            acknowledgementNumber, 
            nacknowledgementNumber, 
            moreFragments, 
            offset,
            NetTaskDatagramType.PUSH_SCHEMAS, 
            0
        );
        this.spack = spack;

        // this.message = message;
        // this.spack = <never>serializeSPACK;
        // (() => this.spack)();
    }

    public getSchemas() {
        return this.spack;
    }

    public link(ecdhe: ECDHE): this {
        this.ecdhe = ecdhe;
        return this;
    }

    public serialize(): Buffer {
        if (!this.ecdhe) {
            throw new Error(`[NT_PushSchemas] Serialization Error: Datagram not linked against an ECDHE instance.`);

        }

        // this.logger.info("SPACK:", this.spack);
        // const pack = serializeSPACK(this.spack);
        let pack: Buffer;
        if (isSPACKTaskCollection(this.spack)) {
            // this.logger.info("TRUESPACK:", Object.fromEntries(Object.entries(this.spack).map(([k,v]) => [k, <Task>(<_SPACKTask>v).getUnpacked()])));
            // this.logger.info("TRUESPACKPACK:", packTaskSchemas(Object.fromEntries(Object.entries(this.spack).map(([k,v]) => [k, <Task>(<_SPACKTask>v).getUnpacked()]))));
            pack = serializeSPACK(packTaskSchemas(
                Object.fromEntries(Object.entries(this.spack).map(([k,v]) => [k, <never>(<_SPACKTask>v).getUnpacked()]))
            ));
        } else {
            pack = serializeSPACK(this.spack);
        }
        // this.logger.info("SERSPACK:", pack.toString("hex"));
        
        // this.payloadSize = pack.byteLength;

        // const enc = this.ecdhe?.encrypt(this.message);
        const packLen = Buffer.alloc(4);
        packLen.writeUInt32BE(pack.byteLength);
        const packCompound = Buffer.concat([packLen, pack]);

        const enc = this.ecdhe.encrypt(packCompound);
        const serENC = ECDHE.serializeEncryptedMessage(enc);

        const payloadWriter = new BufferWriter();
        const privHeader = super.serializePrivateHeader();
        payloadWriter.write(privHeader);
        payloadWriter.writeUInt32(serENC.byteLength);
        payloadWriter.write(serENC);

        // this.logger.log("[NT_PS] PACK:", pack);

        // Envelope payload
        let envelope: Buffer; 
        try {
            envelope = ECDHE.serializeEncryptedMessage(this.ecdhe.envelope(payloadWriter.finish()));
            this.payloadSize = envelope.byteLength;
        } catch (e) {
            throw new Error(`[NT_PushSchemas] Serialization Error: Crypto error:`, { cause: e });
        }

        const pubHeader = super.serializePublicHeader();
        const dgramWriter = new BufferWriter();
        dgramWriter.write(pubHeader);
        dgramWriter.write(envelope);

        return dgramWriter.finish();
    }

    public static deserialize(reader: BufferReader, ecdhe: ECDHE, dg: NetTask): NetTaskPushSchemas {
        // const logger = getOrCreateGlobalLogger();

        if (dg.getType() != NetTaskDatagramType.PUSH_SCHEMAS) {
            throw new Error(`[NT_PushSchemas] Deserialization Error: Not a PushSchemas datagram.`);
        }

        const serEncLen = reader.readUInt32();
        const serEnc = reader.read(serEncLen);
        const desMessage = ECDHE.deserializeEncryptedMessage(serEnc);
        const message = ecdhe.decrypt(desMessage);

        let tasks: { [key: string]: SPACKTask; } = {};
        try {
            const spackLen = message.readUInt32BE();
            const rawSpack = message.subarray(4, spackLen + 4);
            // logger.log("[NT_PS] PACK:", rawSpack);

            const spack = deserializeSPACK(rawSpack);
            // logger.log("DESER:", spack);
            tasks = unpackTaskSchemas(<SPACKTaskCollectionPacked>spack);
        } catch (e) {
            throw new Error(`[NT_PushSchemas] Malformed NetTaskPushSchemas packet: Malformed schema payload.`, { cause: e });
        }

        return new NetTaskPushSchemas(
            dg.getSessionId(),
            dg.getSequenceNumber(),
            dg.getAcknowledgementNumber(), 
            dg.getNAcknowledgementNumber(), 
            dg.getMoreFragmentsFlag(), 
            dg.getOffset(), 
            tasks
        );
    }
}

class NetTaskMetric extends NetTask {
    private spack!: SPACKTaskMetric;
    private ecdhe?: ECDHE;
    private taskId: string;
    private task: object;

    public constructor(
        sessionId: Buffer,
        sequenceNumber: number,
        acknowledgementNumber: number,
        nacknowledgementNumber: number,
        moreFragments: boolean,
        offset: number,
        spack: SPACKTaskMetric,
        taskId: string,
        // Should be of type Task, but I don't want to import stuff from the server into common, 
        // and I'm too much of a lazy fuck to move the config to common.
        task: object
    ) {
        super(
            sessionId, 
            NET_TASK_CRYPTO, 
            sequenceNumber, 
            acknowledgementNumber,
            nacknowledgementNumber, 
            moreFragments,
            offset, 
            NetTaskDatagramType.SEND_METRICS, 
            0
        );

        this.spack = dropEmpty(Object.fromEntries(Object.entries(spack)));
        this.taskId = taskId;
        this.task = task;
    }

    public getMetrics() {
        return this.spack;
    }

    public getTaskId() {
        return this.taskId;
    }

    public link(ecdhe: ECDHE): this {
        this.ecdhe = ecdhe;
        return this;
    }

    public serialize(): Buffer {
        if (!this.ecdhe) {
            throw new Error(`[NT_PushSchemas] Serialization Error: Datagram not linked against an ECDHE instance.`);
        }

        this.logger.log("[NT_PushSchemas] PACK ARGS:", this.spack, this.task);
        const pack = serializeTaskMetric(this.spack, <never>this.task);
        this.logger.log("[NT_PushSchemas] PACK:", pack, pack.byteLength);

        const taskLen = Buffer.alloc(4);
        taskLen.writeUInt32BE(this.taskId.length);

        const packLen = Buffer.alloc(4);
        packLen.writeUInt32BE(pack.byteLength);
        const packCompound = Buffer.concat([taskLen, Buffer.from(this.taskId, "utf8"), packLen, pack]);

        const enc = this.ecdhe.encrypt(packCompound);
        const serENC = ECDHE.serializeEncryptedMessage(enc);

        const payloadWriter = new BufferWriter();
        const privHeader = super.serializePrivateHeader();
        payloadWriter.write(privHeader);
        payloadWriter.writeUInt32(serENC.byteLength);
        payloadWriter.write(serENC);

        // Envelope payload
        let envelope: Buffer; 
        try {
            envelope = ECDHE.serializeEncryptedMessage(this.ecdhe.envelope(payloadWriter.finish()));
            this.payloadSize = envelope.byteLength;
        } catch (e) {
            throw new Error(`[NT_PushSchemas] Serialization Error: Crypto error:`, { cause: e });
        }

        const pubHeader = super.serializePublicHeader();
        const dgramWriter = new BufferWriter();
        dgramWriter.write(pubHeader);
        dgramWriter.write(envelope);

        return dgramWriter.finish();
    }

    public static deserialize(reader: BufferReader, ecdhe: ECDHE, dg: NetTask, configTasks: object): NetTaskMetric {
        // const logger = getOrCreateGlobalLogger();

        if (dg.getType() != NetTaskDatagramType.SEND_METRICS) {
            throw new Error(`[NT_PushSchemas] Deserialization Error: Not a PushSchemas datagram.`);
        }

        const serEncLen = reader.readUInt32();
        const serEnc = reader.read(serEncLen);
        const desMessage = ECDHE.deserializeEncryptedMessage(serEnc);
        const message = ecdhe.decrypt(desMessage);
        const messageReader = new BufferReader(message);

        // logger.log("[NT_PushSchemas] MESSAGE:", message);

        const metric = { taskId: "", metrics: <SPACKTaskMetric>{} };
        try {
            const taskIdLen = messageReader.readUInt32();
            metric.taskId = messageReader.read(taskIdLen).toString("utf8");

            const spackLen = messageReader.readUInt32();
            const rawSpack = messageReader.read(spackLen);

            metric.metrics = deserializeTaskMetric(
                rawSpack, 
                // In order to not import stuff from server into common, we do this hack to simply accept whatever.
                // It's the responsability of the user to guarantee this doesn't explode on their hands.
                <never>(<Record<string, unknown>>configTasks)[<keyof typeof configTasks>metric.taskId]
            );
        } catch (e) {
            throw new Error(`[NT_Metric] Malformed NetTaskMetric packet: Malformed schema payload.`, { cause: e });
        }

        return new NetTaskMetric(
            dg.getSessionId(), 
            dg.getSequenceNumber(), 
            dg.getAcknowledgementNumber(), 
            dg.getNAcknowledgementNumber(), 
            dg.getMoreFragmentsFlag(), 
            dg.getOffset(),
            metric.metrics,
            metric.taskId,
            <never>(<Record<string, unknown>>configTasks)[<keyof typeof configTasks>metric.taskId]
        );
    }
}

class NetTaskWake extends NetTask {
    private ecdhe?: ECDHE;
    private newSeq: number;

    public constructor(
        sessionId: Buffer,
        sequenceNumber: number,
        acknowledgementNumber: number,
        newSeq: number
    ) {
        super(
            sessionId,
            NET_TASK_CRYPTO,
            sequenceNumber,
            acknowledgementNumber,
            0, 
            false,
            0, 
            NetTaskDatagramType.WAKE,
            0
        );

        this.newSeq = newSeq;
    }

    public link(ecdhe: ECDHE): this {
        this.ecdhe = ecdhe;
        return this;
    }

    public serialize() {
        if (!this.ecdhe) {
            throw new Error(`[NT_Wake] Serialization Error: Datagram not linked against an ECDHE instance.`);
        }

        const seqBuf = Buffer.alloc(4);
        seqBuf.writeUInt32BE(this.newSeq);

        const payloadCompount = Buffer.concat([NET_TASK_WAKE_PING, seqBuf]);
        const enc = this.ecdhe.encrypt(payloadCompount);
        const serENC = ECDHE.serializeEncryptedMessage(enc);

        const payloadWriter = new BufferWriter();
        const privHeader = super.serializePrivateHeader();
        payloadWriter.write(privHeader);
        payloadWriter.writeUInt32(serENC.byteLength);
        payloadWriter.write(serENC);

        // Envelope payload
        let envelope: Buffer; 
        try {
            envelope = ECDHE.serializeEncryptedMessage(this.ecdhe.envelope(payloadWriter.finish()));
            this.payloadSize = envelope.byteLength;
        } catch (e) {
            throw new Error(`[NT_Wake] Serialization Error: Crypto error:`, { cause: e });
        }

        const pubHeader = super.serializePublicHeader();
        const dgramWriter = new BufferWriter();
        dgramWriter.write(pubHeader);
        dgramWriter.write(envelope);

        return dgramWriter.finish();
    }

    public static deserialize(reader: BufferReader, ecdhe: ECDHE, dg: NetTask): NetTaskWake {
        if (dg.getType() != NetTaskDatagramType.WAKE) {
            throw new Error(`[NT_Wake] Deserialization Error: Not a Wake datagram.`);
        }

        const serEncLen = reader.readUInt32();
        const serEnc = reader.read(serEncLen);
        const desMessage = ECDHE.deserializeEncryptedMessage(serEnc);
        const message = ecdhe.decrypt(desMessage);
        const messageReader = new BufferReader(message);

        const ping = messageReader.read(NET_TASK_WAKE_PING.byteLength);
        const newSeq = messageReader.readUInt32();

        if (!ping.equals(NET_TASK_WAKE_PING)) {
            throw new Error(`[NT_Wake] Deserialization Error: Wake Datagram payload broken or invalid.`);
        }

        return new NetTaskWake(
            dg.getSessionId(), 
            newSeq, 
            dg.getAcknowledgementNumber(),
            0
        );
    }

    public static makeNewSeq() {
        return Math.floor(Math.random() * (2 ** 32 - 1)) + 1;
    }
}

export {
    NetTaskDatagramType,
    NetTaskRejectedReason,

    NetTask,
    NetTaskRejected,
    NetTaskReset,
    NetTaskRegister,
    NetTaskRegisterChallenge,
    NetTaskRegisterChallenge2,
    NetTaskPushSchemas,
    NetTaskMetric,
    NetTaskWake,
    NetTaskBodyless
};