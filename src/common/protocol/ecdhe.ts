/**
 * @module Elliptic-Curve Diffie-Hellman (Ephemeral)
 * 
 * @description This modules contains implementations of the 
 * {@link https://en.wikipedia.org/wiki/Elliptic-curve_Diffie%E2%80%93Hellman|Elliptic-curve Diffie-Hellman Exchange}
 * algorithm, which provides a system to exchange public shared secret keys to be used to secure communications between
 * two parties against attacks such as Man In the Middle attacks and eavesdropping.
 * 
 * @copyright Copyright (c) 2024 DarkenLM https://github.com/DarkenLM
 */

import { BufferReader, BufferWriter } from "$common/util/buffer.js";
import crypto from "crypto";

//#region ============== Constants ==============
const ENC_ALGO = "aes-128-gcm";
// const ENC_KEY_LEN = 16;
const ENCODING = "hex";
const HASH_ALGO = "sha256";
const HASH_LEN = 16;
//#endregion ============== Constants ==============

//#region ============== Types ==============
/**
 * A List of Elliptic curves supported by the crypto built-in module.
 * 
 * Generated through {@link crypto.getCurves}.
 */
const CryptoCurve = [
    "Oakley-EC2N-3",
    "Oakley-EC2N-4",
    "SM2",
    "brainpoolP160r1",
    "brainpoolP160t1",
    "brainpoolP192r1",
    "brainpoolP192t1",
    "brainpoolP224r1",
    "brainpoolP224t1",
    "brainpoolP256r1",
    "brainpoolP256t1",
    "brainpoolP320r1",
    "brainpoolP320t1",
    "brainpoolP384r1",
    "brainpoolP384t1",
    "brainpoolP512r1",
    "brainpoolP512t1",
    "c2pnb163v1",
    "c2pnb163v2",
    "c2pnb163v3",
    "c2pnb176v1",
    "c2pnb208w1",
    "c2pnb272w1",
    "c2pnb304w1",
    "c2pnb368w1",
    "c2tnb191v1",
    "c2tnb191v2",
    "c2tnb191v3",
    "c2tnb239v1",
    "c2tnb239v2",
    "c2tnb239v3",
    "c2tnb359v1",
    "c2tnb431r1",
    "prime192v1",
    "prime192v2",
    "prime192v3",
    "prime239v1",
    "prime239v2",
    "prime239v3",
    "prime256v1",
    "secp112r1",
    "secp112r2",
    "secp128r1",
    "secp128r2",
    "secp160k1",
    "secp160r1",
    "secp160r2",
    "secp192k1",
    "secp224k1",
    "secp224r1",
    "secp256k1",
    "secp384r1",
    "secp521r1",
    "sect113r1",
    "sect113r2",
    "sect131r1",
    "sect131r2",
    "sect163k1",
    "sect163r1",
    "sect163r2",
    "sect193r1",
    "sect193r2",
    "sect233k1",
    "sect233r1",
    "sect239k1",
    "sect283k1",
    "sect283r1",
    "sect409k1",
    "sect409r1",
    "sect571k1",
    "sect571r1",
    "wap-wsg-idm-ecid-wtls1",
    "wap-wsg-idm-ecid-wtls10",
    "wap-wsg-idm-ecid-wtls11",
    "wap-wsg-idm-ecid-wtls12",
    "wap-wsg-idm-ecid-wtls3",
    "wap-wsg-idm-ecid-wtls4",
    "wap-wsg-idm-ecid-wtls5",
    "wap-wsg-idm-ecid-wtls6",
    "wap-wsg-idm-ecid-wtls7",
    "wap-wsg-idm-ecid-wtls8",
    "wap-wsg-idm-ecid-wtls9"
] as const;
type CryptoCurve = typeof CryptoCurve[number];

/**
 * Represents a message that was encrypted using a {@link ECDHE} instance.
 */
interface EncryptedMessage {
    content: Buffer,
    iv: Buffer,
    authTag: Buffer
}

/**
 * Represents and authentication challenge to be passed to a connected client to confirm it's identity.
 */
interface Challenge {
    challenge: Buffer,
    salt?: Buffer,
    authTag: Buffer
}

interface ChallengeControl {
    control: Buffer,
    challenge: Challenge
}
//#endregion ============== Types ==============

/**
 * This class is the base for secure Client/Server communication within this project.
 * It consists of an implementation of the 
 * {@link https://en.wikipedia.org/wiki/Elliptic-curve_Diffie%E2%80%93Hellman|Elliptic-curve Diffie-Hellman Exchange}
 * algorithm, which provides a system to exchange public shared secret keys to be used to secure communications between
 * two parties against attacks such as Man In the Middle attacks and eavesdropping.
 * 
 * After the key-exchange, subsequent messages can be encrypted and decrypted by either party, and the encryption can
 * be renegotiated.
 * 
 * In order to implement 0-RTT, the {@link ECDHE.privateKey|Private Key}, {@link ECDHE.publicKey|Public Key} and 
 * the salt must be saved persistently, preferrably with an expiration tag to prevent replay 
 * attacks.
 * 
 * **NOTE:** 0-RTT not yet implemented.
 */
class ECDHE {
    /**
     * An instance of node's built-in Elliptic Curve Diffie-Hellman algorithm, used to compute the secret
     * in both sides of the connection.
     */
    private ecdh!: crypto.ECDH;

    /**
     * The secret value computed from the public key using the Elliptic Curve Diffie-Hellman algorithm.
     * This value is the same on both sides of the connection, and is the source of the the cryptographic
     * keys used in the crypto operations of this class.
     */
    private _secret?: Buffer;

    /**
     * The current session key, which is a secret {@link https://en.wikipedia.org/wiki/HKDF|HDKF}-derived key
     * used to encrypt/decrypt messages as well as being used in the first and second stages of the authentication
     * challenge.
     */
    private sessionKey!: Buffer;

    /**
     * The current challenge key, which is a secret {@link https://en.wikipedia.org/wiki/HKDF|HDKF}-derived key
     * used on the third stage of the authentication challenge.
     */
    private challengeKey!: Buffer;

    /**
     * The last used salt on any operation within this instance.
     */
    private lastSalt?: Buffer;
    
    /**
     * Instantializes a new Elliptic-Curve Diffie-Hellman (Ephemeral).
     * 
     * @param curveName The name of the elliptic curve function to be used to generate the key pair.
     * 
     * @throws {Error} If an error occured during the key pair generation process.
     */
    constructor(curveName: CryptoCurve);
    /**
     * Revives a previously established new Elliptic-Curve Diffie-Hellman (Ephemeral) session.  
     * To be used in 0-RTT connections where the previous credentials have been stored.
     * 
     * @param secret The ECDH secret previously exchanged.
     * @param salt The salt to be used in this connection.
     * 
     * @throws {Error} If an error occured during the key pair generation process.
     */
    constructor(secret: Buffer, salt: Buffer);
    constructor(arg1: Buffer | CryptoCurve, arg2?: Buffer) {
        if (typeof arg1 === "string") {
            this.ecdh = crypto.createECDH(arg1);
            this.ecdh.generateKeys();
    
            this._secret = undefined;
            this.lastSalt = undefined;
        } else {
            this._secret = arg1;
            this.lastSalt = arg2;

            this.regenerateKeys(arg2!);
        }
    }

    /**
     * Returns a boolean representing whether or not this instance has been linked to another party.
     */
    public get initialized(): boolean {
        return !!this._secret;
    }

    /**
     * Returns the public key from the ECDH key pair generated on instancialization.
     */
    public get publicKey(): Buffer {
        return this.ecdh.getPublicKey();
    }

    /**
     * Returns the private key from the ECDH key pair generated on instancialization.
     */
    public get privateKey(): Buffer {
        return this.ecdh.getPrivateKey();
    }

    public get secret(): Buffer | undefined {
        return this._secret ? Buffer.from(this._secret) : undefined;
    }

    /**
     * Generates a shared secret by linking this ECDHE instance with another.
     * 
     * **NOTE:** The passed instance will NOT be modified. It must be manually linked with this same method, 
     * but reversing the roles.
     *
     * @param {ECDHE} publicKey The public key of another ECDHE instance
     * @throws {Error} if an error occured while computing the shared secret key or while compuring the HMAC of
     * said secret key.
     */
    public link(publicKey: Buffer, salt?: Buffer): Buffer;
    /**
     * Generates a shared secret by linking this ECDHE instance with another.
     * 
     * **NOTE:** The passed instance will NOT be modified. It must be manually linked with this same method, 
     * but reversing the roles.
     *
     * @param {ECDHE} ecdhe Another ECDHE instance to link against.
     * @throws {Error} if an error occured while computing the shared secret key or while compuring the HMAC of
     * said secret key.
     */
    public link(ecdhe: ECDHE, salt?: Buffer): Buffer;
    public link(key: Buffer | ECDHE, salt?: Buffer): Buffer {
        const trueKey = key instanceof ECDHE ? key.publicKey : key;
        this._secret = this.ecdh.computeSecret(trueKey);

        salt ??= crypto.randomBytes(16);
        this.lastSalt = salt;
        this.regenerateSessionKey(salt);
        this.regenerateChallengeKey(salt);

        return salt;
    }

    /**
     * Regenerates the session key to be used for communication.
     * 
     * @param salt The salt to be used to regenerate the session key. Should be obtained by completing the authentication
     * challenge.
     */
    public regenerateSessionKey(salt: Buffer): void {
        if (!this.initialized) throw new Error("ECDHE instance is not initialized.");

        this.sessionKey = Buffer.from(crypto.hkdfSync(HASH_ALGO, this._secret!, salt, "session-key", HASH_LEN));
    }

    /**
     * Regenerates the challenge key to be used for communication.
     * 
     * @param salt The salt to be used to regenerate the challenge key. Should be obtained by completing the authentication
     * challenge.
     */
    public regenerateChallengeKey(salt: Buffer): void {
        if (!this.initialized) throw new Error("ECDHE instance is not initialized.");

        this.challengeKey = Buffer.from(crypto.hkdfSync(HASH_ALGO, this._secret!, salt, "challenge-key", HASH_LEN));
    }

    /**
     * Regenerates the keys to be used for communication.
     * @see ECDHE.regenerateSessionKey 
     * @see ECDHE.regenerateChallengeKey
     * 
     * @param salt The salt to be used to regenerate the keys. Should be obtained by completing the authentication
     * challenge.
     */
    public regenerateKeys(salt: Buffer): void {
        this.regenerateSessionKey(salt);
        this.regenerateChallengeKey(salt);
    }

    /**
     * Generates the session id for this connection. This unique identifier identifies the connection, and will
     * be exposed unencrypted to be able to be identified during 0-RTT connections.
     * 
     * @param salt The connection salt generated through the challenge.
     * @returns The session id that identifies this connection.
     */
    public generateSessionId(salt?: Buffer): Buffer {
        if (this.initialized) {
            const trueSalt = salt ?? this.lastSalt ?? crypto.randomBytes(16);
            return Buffer.from(crypto.hkdfSync(HASH_ALGO, this._secret!, trueSalt, "session-id", HASH_LEN));
        } else {
            return crypto.randomBytes(HASH_LEN);
        }
    }

    /**
     * First stage for the authentication challenge. Used to generate a new challenge, along with it's control for the
     * {@link ECDHE.confirmChallenge|third phase}.
     * 
     * @param salt The salt to use for this challenge. If ommited, it will use the last salt used by this instance.
     * @param control Optionally, a predefined control value to use in this challenge.
     * @returns A {@link ChallengeControl} object, containing both the public challenge and the private control value.
     */
    public generateChallenge(control?: Buffer, salt?: Buffer): ChallengeControl {
        if (!this.initialized) throw new Error("ECDHE instance is not initialized.");

        salt ??= this.lastSalt;
        salt ??= crypto.randomBytes(12);
        this.lastSalt = salt;

        control ??= crypto.randomBytes(16);
        const cipher = crypto.createCipheriv(ENC_ALGO, this.sessionKey, salt.subarray(0, 12));
        const encryptedChallenge = Buffer.concat([cipher.update(control), cipher.final()]);
        const authTag = cipher.getAuthTag();

        return {
            control: control,
            challenge: {
                challenge: encryptedChallenge,
                salt: salt.subarray(0, 12),
                authTag: authTag
            }
        };
    }

    /**
     * Second phase for the authentication challenge. Used by the other party to compute the challenge and return a
     * new challenge box to the challenger for confirmation.
     * 
     * @param challenge The challenge issued by the challenger party.
     * @returns A ChallengeControl containing the new challenge computed from the decrypted challenge, 
     * that must be passed along to the challenger, and the decrypted challenge, which should be the salt
     * to be used in further communication, should the challenge succeed 
     * (placed on the {@link ChallengeControl.control|control} property.)
     */
    public verifyChallenge(challenge: Challenge): ChallengeControl {
        if (!this.initialized) throw new Error("ECDHE instance is not initialized.");

        const salt = challenge.salt;
        if (!salt) throw new Error("Challenge presented no salt. If this is the final stage, use ECDHE#confirmChallenge.");

        this.lastSalt = salt;

        const decipher = crypto.createDecipheriv(ENC_ALGO, this.sessionKey, salt.subarray(0, 12));
        decipher.setAuthTag(challenge.authTag);
        const decryptedChallenge = Buffer.concat([decipher.update(challenge.challenge), decipher.final()]);

        const cipher = crypto.createCipheriv(ENC_ALGO, this.challengeKey, salt.subarray(0, 12));
        const encryptedChallenge = Buffer.concat([cipher.update(decryptedChallenge), cipher.final()]);
        const authTag = cipher.getAuthTag();

        return {
            control: decryptedChallenge,
            challenge: {
                challenge: encryptedChallenge,
                salt: undefined,
                authTag: authTag
            }
        };
    }

    /**
     * Third and final phase for the authentication challenge. Used by the challenger party to confirm that the
     * computed challenge response from the challenged party matches the control from the 
     * {@link ECDHE.generateChallenge|first phase}.
     * 
     * @param challenge The challenge response from the challenged party.
     * @param control The {@link ChallengeControl} object generated during the first phase.
     * @returns A boolean indicating whether or not the challenged party completed the challenge successfully.
     */
    public confirmChallenge(challenge: Challenge, control: ChallengeControl): boolean {
        if (!this.initialized) throw new Error("ECDHE instance is not initialized.");

        const salt = control.challenge.salt;
        if (!salt) throw new Error("Invalid challenge: Control presented no salt.");

        this.lastSalt = salt;

        const decipher = crypto.createDecipheriv(ENC_ALGO, this.challengeKey, salt.subarray(0, 12));
        decipher.setAuthTag(challenge.authTag);

        const decryptedChallenge = Buffer.concat([decipher.update(challenge.challenge), decipher.final()]);

        return control.control.equals(decryptedChallenge);
    }

    /**
     * Encrypts a given message with the session key of this ECDHE instance.
     * The Intialization Vector doubles as a nonce for the message.
     * 
     * **NOTE:** This instance must be initialized with {@link link|ECDHE#link} before it can be used.
     *
     * @param content The content to encrypt
     * @return {EncryptedMessage} An object containing the encrypted message.
     * @throws {Error} if this instance is not initialized or an error occured while computing the cypher.
     */
    public encrypt(content: string): EncryptedMessage
    public encrypt(content: Buffer): EncryptedMessage;
    public encrypt(content: Buffer | string): EncryptedMessage {
        if (!this.initialized) throw new Error("ECDHE instance is not initialized.");

        const iv = crypto.randomBytes(12);
        const cipher = crypto.createCipheriv(ENC_ALGO, this.sessionKey, iv);

        let encrypted: Buffer;
        if (content instanceof Buffer) encrypted = cipher.update(content);
        else encrypted = cipher.update(content, "utf8");

        encrypted = Buffer.concat([encrypted, cipher.final()]);
        const authTag = cipher.getAuthTag();

        return { content: encrypted, iv: iv, authTag };
    }

    /**
     * Decrypts a given encrypted message with the session key of this ECDHE instance.
     * 
     * **NOTE:** This instance must be initialized with {@link link|ECDHE#link} before it can be used.
     *
     * @param {EncryptedMessage} message The encrypted message to decrypt
     * @return {string} A UTF-8 encoded string containing
     * @throws {Error} if this instance is not initialized or an error occured while computing the cypher.
     */
    public decrypt(message: EncryptedMessage | Buffer): Buffer {
        if (!this.initialized) throw new Error("ECDHE instance is not initialized.");

        const enc = message instanceof Buffer ? ECDHE.deserializeEncryptedMessage(message) : message;

        const decipher = crypto.createDecipheriv(ENC_ALGO, this.sessionKey, enc.iv);
        decipher.setAuthTag(enc.authTag);

        const decrypted = decipher.update(enc.content);
        const final = Buffer.concat([decrypted, decipher.final()]);

        return final;
    }

    /**
     * Envelops a given message with the challenge key of this ECDHE instance.
     * The Intialization Vector doubles as a nonce for the message.
     * 
     * It is meant to be used to protect the payload and part of the header of a given packet to increase the security of
     * the connection.
     * 
     * **NOTE:** This instance must be initialized with {@link link|ECDHE#link} before it can be used.
     *
     * @param content The content to envelope.
     * @return {EncryptedMessage} An object containing the encrypted message.
     * @throws {Error} if this instance is not initialized or an error occured while computing the cypher.
     */
    public envelope(content: Buffer): EncryptedMessage {
        if (!this.initialized) throw new Error("ECDHE instance is not initialized.");

        const iv = crypto.randomBytes(12);
        const cipher = crypto.createCipheriv(ENC_ALGO, this.sessionKey, iv);

        let encrypted: Buffer = cipher.update(content);

        encrypted = Buffer.concat([encrypted, cipher.final()]);
        const authTag = cipher.getAuthTag();

        return { content: encrypted, iv: iv, authTag };
    }

    /**
     * De.envelopes a given message envelope with the challenge key of this ECDHE instance.
     * 
     * **NOTE:** This instance must be initialized with {@link link|ECDHE#link} before it can be used.
     *
     * @param {EncryptedMessage} message The encrypted message to decrypt
     * @return {string} A UTF-8 encoded string containing
     * @throws {Error} if this instance is not initialized or an error occured while computing the cypher.
     */
    public deenvelope(message: EncryptedMessage | Buffer): Buffer {
        if (!this.initialized) throw new Error("ECDHE instance is not initialized.");

        const enc = message instanceof Buffer ? ECDHE.deserializeEncryptedMessage(message) : message;

        const decipher = crypto.createDecipheriv(ENC_ALGO, this.sessionKey, enc.iv);
        decipher.setAuthTag(enc.authTag);

        const decrypted = decipher.update(enc.content);
        const final = Buffer.concat([decrypted, decipher.final()]);

        return final;
    }

    //#region ======= STATIC =======
    /**
     * The size of the hashes used by the algorithms in this class.
     */
    public static hashLen = HASH_LEN;

    /**
     * Serializes {@link EncryptedMessage} objects into network-transmittable buffers.
     */
    public static serializeEncryptedMessage(enc: EncryptedMessage): Buffer {
        const contentLength = Buffer.byteLength(enc.content, ENCODING);
        const ivLength = Buffer.byteLength(enc.iv, ENCODING);
        const authTagLength = Buffer.byteLength(enc.authTag, ENCODING);
        const buf = new BufferWriter();

        // Write message content
        buf.writeUInt32(contentLength);
        buf.write(enc.content);

        // Write Initialization Vector
        buf.writeUInt32(ivLength);
        buf.write(enc.iv);

        // Write Authentication Tag
        buf.writeUInt32(authTagLength);
        buf.write(enc.authTag);

        return buf.finish();
    }

    /**
     * Deserializes network-transmittable buffers into live {@link EncryptedMessage} objects.
     */
    public static deserializeEncryptedMessage(buf: Buffer): EncryptedMessage {
        const reader = new BufferReader(buf);
        const contentLength = reader.readUInt32();
        const content = reader.read(contentLength);

        const ivLength = reader.readUInt32();
        const iv = reader.read(ivLength);

        const authTagLength = reader.readUInt32();
        const authTag = reader.read(authTagLength);

        return {
            content, iv, authTag
        };
    }

    /**
     * Serializes {@link Challenge} objects into network-transmittable buffers.
     */
    public static serializeChallenge(ch: Challenge): Buffer {
        const writer = new BufferWriter();

        // Write challenge
        writer.writeUInt32(ch.challenge.byteLength);
        writer.write(ch.challenge);

        // Write salt
        writer.writeUInt32(ch.salt?.byteLength ?? 0);
        if (ch.salt) writer.write(ch.salt);

        // Write Authentication Tag
        writer.writeUInt32(ch.authTag.byteLength);
        writer.write(ch.authTag);

        return writer.finish();
    }

    /**
     * Deserializes network-transmittable buffers into live {@link Challenge} objects.
     */
    public static deserializeChallenge(buf: Buffer): Challenge {
        const reader = new BufferReader(buf);
        const challengeLength = reader.readUInt32();
        const challenge = reader.read(challengeLength);

        const saltLength = reader.readUInt32();
        const salt = reader.read(saltLength);

        const authTagLength = reader.readUInt32();
        const authTag = reader.read(authTagLength);

        return {
            challenge, salt, authTag
        };
    }
    //#endregion ======= STATIC =======
}

export {
    type CryptoCurve,
    type EncryptedMessage,
    type Challenge,
    type ChallengeControl,

    HASH_ALGO,
    HASH_LEN,

    ECDHE
};

// const alice = new ECDHE("secp128r1");
// const bob = new ECDHE("secp128r1");

// const salt = alice.link(bob);
// bob.link(alice.publicKey, salt);

// // const commSalt = crypto.randomBytes(12);
// // const challenge = alice.generateChallenge(commSalt);
// // console.log("CHALLENGE:", challenge);

// // const verifyCh = bob.verifyChallenge(challenge.challenge);
// // console.log("VERIFY CHALLENGE:", verifyCh);

// // const confirmCh = alice.confirmChallenge(verifyCh.challenge, challenge);
// // console.log("CONFIRM CHALLENGE:", confirmCh);


// // Generate Challenge
// const commSalt = crypto.randomBytes(12);
// const challenge = alice.generateChallenge(commSalt);
// console.log("CHALLENGE:", challenge);

// // Serialize challenge and transmit to challenged
// const serCh = ECDHE.serializeChallenge(challenge.challenge);
// const desCh = ECDHE.deserializeChallenge(serCh);
// const verifyCh = bob.verifyChallenge(desCh);
// console.log("VERIFY CHALLENGE:", verifyCh);

// // Serialize verification challenge and trasmit to challenger
// const serCh2 = ECDHE.serializeChallenge(verifyCh.challenge);
// const desCh2 = ECDHE.deserializeChallenge(serCh2);
// const confirmCh = alice.confirmChallenge(desCh2, challenge);
// console.log("CONFIRM CHALLENGE:", confirmCh);

// // Update salt with challenge salt.
// alice.regenerateKeys(commSalt);
// bob.regenerateKeys(verifyCh.control);

// // Generate message and serialize it
// const origMessage = "Hello world, I'm Alice and I'm going to commit a fucking warcrime.";
// const encMsg = alice.encrypt(origMessage);
// const serMsg = ECDHE.serializeEncryptedMessage(encMsg);

// // Deserialize message and deserialize it
// const desMsg = ECDHE.deserializeEncryptedMessage(serMsg);
// console.log("SER/DES NOT BROKEN:", [desMsg.content.equals(encMsg.content), desMsg.iv.equals(encMsg.iv), desMsg.authTag.equals(encMsg.authTag)]);

// const decMsg = bob.decrypt(desMsg);
// console.log("RECEIVED MESSAGE:", decMsg.toString("utf8"));
// console.log("NOT BROKEN:", origMessage === decMsg.toString("utf8"));

// // Bring alice back from the ded
// const aliceRevive = new ECDHE(alice.secret!, commSalt);

// // Generate message and serialize it
// const reviveOrigMessage = "Hello again world, I'm Alice and I'm going to fuck y'all.";
// const reviveEncMsg = aliceRevive.encrypt(reviveOrigMessage);
// const reviveSerMsg = ECDHE.serializeEncryptedMessage(reviveEncMsg);

// // Deserialize message and deserialize it
// const reviveDesMsg = ECDHE.deserializeEncryptedMessage(reviveSerMsg);
// console.log("SER/DES NOT BROKEN:", [reviveDesMsg.content.equals(reviveDesMsg.content), reviveDesMsg.iv.equals(reviveDesMsg.iv), reviveDesMsg.authTag.equals(reviveDesMsg.authTag)]);

// const reviveDecMsg = bob.decrypt(reviveDesMsg);
// console.log("RECEIVED MESSAGE:", reviveDecMsg.toString("utf8"));
// console.log("NOT BROKEN:", reviveOrigMessage === reviveDecMsg.toString("utf8"));
