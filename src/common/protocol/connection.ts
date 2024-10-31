import { Clonable } from "$types/util/Clonable.js";

interface RemoteInfo {
    address: string;
    family: "IPv4" | "IPv6";
    port: number;
    size: number;
}

type ConnectionTargetLike = ConnectionTarget | RemoteInfo;

/**
 * Represents a remote target that can be connected to.
 */
class ConnectionTarget implements Clonable<ConnectionTarget> {
    private _address: string;
    private _port: number;

    constructor(rinfo: RemoteInfo);
    constructor(address: string, port: number);
    constructor(first: RemoteInfo | string, port?: number) {
        if (!port) {
            this._address = (<RemoteInfo>first).address;
            this._port = (<RemoteInfo>first).port;
        } else {
            this._address = <string>first;
            this._port = port;
        }
    }

    /**
     * The public IP address for the target.
     */
    public get address(): string {
        return this._address;
    }

    /**
     * The connection port for the target.
     */
    public get port(): number {
        return this._port;
    }

    /**
     * The qualified address for the target, with the format "<IP>:<PORT>".
     */
    public get qualifiedName(): string {
        return `${this.address}:${this.port}`;
    }

    /**
     * Compares a {@link ConnectionTargetLike} with the current instance to check whether they point to the same target.
     * @param rinfo The ConnectionTargetLike to compare with.
     * @returns Whether the instances point to the same target.
     */
    public match(rinfo: ConnectionTargetLike): boolean {
        return rinfo.address === this._address && rinfo.port === this._port;
    }

    public clone(): ConnectionTarget {
        return new ConnectionTarget(this._address, this._port);
    }

    //#region ======= STATIC =======
    /**
     * Converts a {@link ConnectionTargetLike} to it's qualified name.
     * 
     * @param rinfo The ConnectionTargetLike to convert.
     * @returns The qualified address for the target, with the format "<IP>:<PORT>". 
     */
    public static toQualifiedName(rinfo: RemoteInfo): string;
    public static toQualifiedName(rinfo: ConnectionTarget): string;
    public static toQualifiedName(rinfo: RemoteInfo | ConnectionTarget): string {
        if (rinfo instanceof ConnectionTarget) return rinfo.qualifiedName;
        else return `${rinfo.address}:${rinfo.port}`;
    }
    //#endregion ======= STATIC =======
}

export {
    type RemoteInfo,
    type ConnectionTargetLike,

    ConnectionTarget
};