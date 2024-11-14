import { Document } from 'mongoose';

// Interface para dispositivos
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

function createDevice(
    ip: string,
    port: number,
    secret: Buffer,
    salt: Buffer,
    sessionId: Buffer,
    connectAt: Date
) { 
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

export {
    IDevice,
    createDevice
}