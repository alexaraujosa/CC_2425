import { Document } from 'mongoose';

/**
 * Interface representing a Device document in the database.
 * Extends the Mongoose Document interface to allow direct usage with MongoDB.
 */
interface IDevice extends Document {
    id: number,
    ip: string;
    port: number;
    auth: {
        secret: Buffer;
        salt: Buffer;
        sessionId: Buffer;
    };
    connectAt: Date;
}

/**
 * Creates a new device object with the specified details.
 *
 * @param {string} ip - The IP address of the device.
 * @param {number} port - The port on which the device operates.
 * @param {Buffer} secret - The secret key for device authentication.
 * @param {Buffer} salt - The salt value used in cryptographic functions.
 * @param {Buffer} sessionId - The session ID for the device.
 * @param {Date} connectAt - The date and time when the device last connected.
 *
 * @returns {Partial<IDevice>} A new device object with the specified properties, ready for saving to the database.
 */
function createDevice(
    ip: string,
    port: number,
    secret: Buffer,
    salt: Buffer,
    sessionId: Buffer,
    connectAt: Date
) { 
    //TODO: Fazer metodo tostring
    return {
        ip: ip,
        port: port,
        auth: {
            secret: secret,
            salt: salt,
            sessionId: sessionId,
        },
        connectAt: connectAt,
    };
}

function deviceToString(device: IDevice){
    return `Device Information:
    IP: ${device.ip}
    Port: ${device.port}
    Connected At: ${device.connectAt.toISOString()}`;
}

export {
    IDevice,
    createDevice,
    deviceToString
}