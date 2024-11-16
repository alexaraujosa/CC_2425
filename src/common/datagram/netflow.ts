import { Challenge, ECDHE } from "$common/protocol/ecdhe.js";
import { BufferReader, BufferWriter } from "$common/util/buffer.js";

const NETFLOW_SIGNATURE = Buffer.from("CCNF", "utf8");

enum NetflowDatagramType {
    HELLO_THERE    = 1,
    GENERAL_KENOBI,
    THE_NEGOTIATOR,
    MESSAGE,
    KYS           
}


//#region ======= Signature =======
function verifySignature(reader: BufferReader) {
    const sig = reader.read(4);

    return NETFLOW_SIGNATURE.equals(sig);
}
//#region ======= Signature =======

//#region ======= HelloThere Datagram =======
function makeHelloThereDatagram(ecdhe: ECDHE) {
    const writer = new BufferWriter();
    writer.write(NETFLOW_SIGNATURE);
    writer.writeUInt32(NetflowDatagramType.HELLO_THERE);
    writer.writeUInt32(ecdhe.publicKey.byteLength);
    writer.write(ecdhe.publicKey);

    return writer.finish();
}
function readHelloThereDatagram(reader: BufferReader) {
    // const reader = new BufferReader(buf, 8);

    const publicKeyLen = reader.readUInt32();
    const publicKey = reader.read(publicKeyLen);

    return { publicKey };
}
//#endregion ======= HelloThere Datagram =======

//#region ======= GeneralKenobi Datagram =======
function makeGeneralKenobiDatagram(ecdhe: ECDHE, remoteAddress: string, salt: Buffer) {
    const challenge = ecdhe.generateChallenge(Buffer.from(remoteAddress, "utf8"));
    const serCh = ECDHE.serializeChallenge(challenge.challenge);

    const writer = new BufferWriter();
    writer.write(NETFLOW_SIGNATURE);
    writer.writeUInt32(NetflowDatagramType.GENERAL_KENOBI);

    writer.writeUInt32(ecdhe.publicKey.byteLength);
    writer.write(ecdhe.publicKey);

    writer.writeUInt32(salt.byteLength);
    writer.write(salt);

    writer.writeUInt32(serCh.byteLength);
    writer.write(serCh);

    return { packet: writer.finish(), challenge: challenge };
}

function readGeneralKenobiDatagram(reader: BufferReader) {
    // const reader = new BufferReader(buf, 8);

    // Read public key
    const publicKeyLen = reader.readUInt32();
    const publicKey = reader.read(publicKeyLen);

    // Read salt
    const saltLen = reader.readUInt32();
    const salt = reader.read(saltLen);

    // Read Serialized Challenge
    const serChLen = reader.readUInt32();
    const serCh = reader.read(serChLen);
    const challenge = ECDHE.deserializeChallenge(serCh);

    return { publicKey, salt, challenge };
}
//#endregion ======= GeneralKenobi Datagram =======

//#region ======= TheNegotiator Datagram =======
function makeTheNegotiatorDatagram(challenge: Challenge) {
    const serCh = ECDHE.serializeChallenge(challenge);

    const writer = new BufferWriter();
    writer.write(NETFLOW_SIGNATURE);
    writer.writeUInt32(NetflowDatagramType.THE_NEGOTIATOR);
    writer.writeUInt32(serCh.byteLength);
    writer.write(serCh);

    return writer.finish();
}
function readTheNegotiatorDatagram(reader: BufferReader) {
    // const reader = new BufferReader(buf, 8);

    const serChLength = reader.readUInt32();
    const serCh = reader.read(serChLength);
    const challenge = ECDHE.deserializeChallenge(serCh);

    return { challenge: challenge };
}
//#endregion ======= TheNegotiator Datagram =======

//#region ======= Message Datagram =======
function makeMessageDatagram(ecdhe: ECDHE, message: string) {
    const enc = ecdhe.encrypt(message);
    const serEnc = ECDHE.serializeEncryptedMessage(enc);

    const writer = new BufferWriter();
    writer.write(NETFLOW_SIGNATURE);
    writer.writeUInt32(NetflowDatagramType.MESSAGE);
    writer.writeUInt32(serEnc.byteLength);
    writer.write(serEnc);

    return writer.finish();
}
function readMessageDatagram(reader: BufferReader) {
    // const reader = new BufferReader(buf, 8);

    const serEncLength = reader.readUInt32();
    const serEnc = reader.read(serEncLength);
    const message = ECDHE.deserializeEncryptedMessage(serEnc);

    return { message };
}
//#region ======= Message Datagram =======

//#endregion ======= KYS Datagram =======
function makeKYSDatagram() {
    const writer = new BufferWriter();
    writer.writeUInt32(NetflowDatagramType.KYS);

    return writer.finish();
}
//#endregion ======= KYS Datagram =======

export {
    NetflowDatagramType,
    NETFLOW_SIGNATURE,

    verifySignature,

    makeHelloThereDatagram,
    readHelloThereDatagram,

    makeGeneralKenobiDatagram,
    readGeneralKenobiDatagram,

    makeTheNegotiatorDatagram,
    readTheNegotiatorDatagram,

    makeMessageDatagram,
    readMessageDatagram,

    makeKYSDatagram
};