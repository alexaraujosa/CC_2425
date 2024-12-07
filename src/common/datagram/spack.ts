/**
 * @module Schema Packaging (SPACK)
 * 
 * @description This module contains an implementation of a header compression system to reduce the memory footprint of
 * and schema data. It consists on the usage of a dictionary of well-known header values and per-value and multi-value
 * compression algorithms to reduce the memory used in transmitted packets while remaining lossless.
 * 
 * **Author's note:** If you have to debug this thing, you better start praying, because the dark magic employed within
 * this file is a blight upon god's green earth.
 * 
 * @copyright Copyright (c) 2024 DarkenLM https://github.com/DarkenLM
 */

import { BufferReader, BufferWriter } from "$common/util/buffer.js";
import { parseStringInterval } from "$common/util/date.js";
import { getOrCreateGlobalLogger } from "$common/util/logger.js";
import { AssertUniqueProperty, dropEmpty, GenericObject } from "$common/util/object.js";
import { Task } from "../../server/config.js";

//#region ============== Types ==============
/**
 * Represents a Packer, that converts live objects into semi-serialized objects.
 */
type SPACKPacker = (value: unknown) => SPACKTaskPacked
/**
 * Represents an Unpacker, that converts packed objects back into their live counter-parts.
 */
type SPACKUnpacker = ((value: SPACKTaskPackedValue) => unknown) | ((value: SPACKTaskPackedObject) => unknown)

/**
 * Represents an entry in the SPACKTaskKeyMap, containing it's schema Id, and it's packer/unpacker.
 */
interface SPACKMapEntry {
    id: number,
    packer: SPACKPacker,
    unpacker: SPACKUnpacker
}

// The types below represent SPACK Packed values. Only used internally.
type SPACKTaskPackedValue = number;
type SPACKTaskPackedNullable = SPACKTaskPackedValue | undefined;
interface SPACKTaskPackedObject { [key: number]: SPACKTaskPacked }; // Must be an interface because TS
type SPACKTaskPacked = SPACKTaskPackedNullable | SPACKTaskPackedObject;
type SPACKTaskPackedNonNullable = SPACKTaskPackedValue | SPACKTaskPackedObject;
interface SPACKTaskCollectionPacked { [key: string]: SPACKTaskPacked };

/**
 * Represents a packed object using SPACK.
 */
type SPACKPacked = SPACKTaskPackedNonNullable | SPACKTaskCollectionPacked;
//#endregion ============== Types ==============

//#region ============== Constants ==============
/**
 * Symbol mark used to determine if a given object is a live Task Collection, deserialized by SPACK.
 */
const SPACK_MARK_TASK_COLLECTION = Symbol("SPACK_Mark_Task_Collection");

/**
 * Symbol used to represent undefined values in control schemas.
 * Used because using plain undefined values turn into the bottom type in certain occasions when using the control
 * schemas, which would prevent the keys from being typed.
 */
const UNDEFINED = Symbol("SPACK_Undefined");
/**
 * Symbol used to represent squashed option fields in control schemas.
 * Squashed Option Fields are fields used in link metrics, which contain all the keys from the Global Options, overriden
 * by locally defined keys in each field.
 */
const OPTIONS = Symbol("SPACK_Options");
/**
 * Represents a KeyMap.
 * A KeyMap is a hidden structure that maps strings to numeric representations, in order to reduce payload size.
 */
const KEYMAP = Symbol("SPACK_KeyMap");
/**
 * Default Control Schema for Tasks.
 */
const DEFAULT_TASK = <Task><unknown>{
    "frequency": UNDEFINED,
    "device_metrics": {
        "cpu_usage": false,
        "ram_usage": false,
        "interface_stats": false,
        "volume": false
    },
    "global_options": {
        "mode": "client",
        "target": UNDEFINED,
        "duration": 10000,
        "transport": "udp",
        "interval": 30000,
        "counter": 5 
    },
    "link_metrics":{
        "bandwidth": OPTIONS,
        "jitter": OPTIONS,
        "packet_loss": OPTIONS,
        "latency": OPTIONS 
    },
    "alert_conditions": {
        "cpu_usage": UNDEFINED,
        "ram_usage": UNDEFINED,
        "interface_stats": UNDEFINED,
        "packet_loss": UNDEFINED,
        "jitter": UNDEFINED
    }
} satisfies Partial<Task>;

/**
 * The bytesize to be used for keys on packed objects.
 */
const SERIALIZED_KEY_SIZE = 1;

/**
 * The value to be ignored when processing a metric.
 */
enum IgnoreValues {
    s8 = 128,
    s16 = 32767
};
//#endregion ============== Constants ==============

//#endregion ============== Errors ==============
/**
 * A custom Error class used within SPACK methods.
 */
class SPACKError extends Error {
    constructor(message?: string, options?: ErrorOptions) {
        super(message, options);
        this.name = "SPACKError";
    }
}
//#endregion ============== Errors ==============

//#region ============== Utilities ==============
/**
 * Given a {@link SPACKTaskKey}, returns it's Schema ID in the {@link SPACKTaskKeyMap}.
 */
function ID<T extends SPACKTaskKey>(key: T): SPACKTaskKeyMap[T]["id"] {
    return SPACKTaskKeyMap[key].id;
}
/**
 * Given a Schema ID in the {@link SPACKTaskKeyMap}, returns it's {@link SPACKTaskKey}.
 */
function KEY<T extends SPACKTaskKey, K extends SPACKTaskKeyMap[T]["id"]>(id: K): T {
    return <T>_SPACKTaskIDMap[id];
}

/**
 * Middleware for packers that allows for for undefined values to be returned, effectively making the property optional.
 * @param packer A {@link SPACKPacker} to be proxied.
 * @returns A new SPACKPacker with the same functionality as the passed packer, but with undefined keys allowed.
 */
function Omissible(packer: SPACKPacker): SPACKPacker {
    return function(value) {
        const ret = packer(value);

        if (typeof ret === "object") {
            if (Object.keys(ret).length > 0) return ret;
            else return undefined;
        }
        
        return ret;
    };
}

/**
 * {@link Omissible} counter-part middleware for unpackers.
 * @param unpacker A {@link SPACKUnpacker} to be proxied.
 * @returns A new SPACKUnacker with the same functionality as the passed unpacker, but with undefined keys allowed.
 */
function Omissed(unpacker: SPACKUnpacker): SPACKUnpacker {
    return function(value: Parameters<SPACKUnpacker>[0]) {
        const ret = unpacker(<never>value);

        if (typeof ret === "object") {
            if (ret !== null && Object.keys(ret).length > 0) return ret;
            else return true;
        }
        
        return ret;
    };
}
//#endregion ============== Utilities ==============

//#region ============== General Packers ==============
function packTimeIntervalString(value: unknown) {
    if (typeof value === "number") return value;
    else if (typeof value === "string") return parseStringInterval(value);
    
    throw new SPACKError("Packing error: Unexpected value.");
}
//#endregion ============== General Packers ==============

//#region ============== Task Schema ==============
/**
 * Single Source of Truth for the keys used at any level in a SPACK supported schema.
 * 
 * _Technically incorrect, as the config should be the SSoT, but there's not enough time for it._
 */
enum SPACKTaskKey {
    NULL = "null",
    TASKS = "tasks",
    FREQUENCY = "frequency",
    DEVICE_METRICS = "device_metrics",
    GLOBAL_OPTIONS = "global_options",
    MODE = "mode",
    TARGET = "target",
    DURATION = "duration",
    TRANSPORT = "transport",
    INTERVAL = "interval",
    COUNTER = "counter",
    LINK_METRICS = "link_metrics",
    BANDWIDTH = "bandwidth",
    JITTER = "jitter",
    PACKET_LOSS = "packet_loss",
    LATENCY = "latency",
    ALERT_CONDITIONS = "alert_conditions",
    CPU_USAGE = "cpu_usage",
    RAM_USAGE = "ram_usage",
    INTERFACE_STATS = "interface_stats",
    VOLUME = "volume",
    _NAMED_KEY = "::NAMED_KEY::"
};
/**
 * A static collection of all SPACKTaskKeys. Honestly, I don't think it makes that much of a difference here, but I'm not
 * refactoring this at this stage, fuck that.
 */
const SPACKTaskKeys = Object.freeze(Object.values(SPACKTaskKey));
function isSPACKTaskKey(k: string): k is SPACKTaskKey {
    return (<string[]>SPACKTaskKeys).includes(k);
}

/**
 * A placeholder packer/unpacker that does nothing.
 */
const nilpack = (v: unknown) => <SPACKTaskPacked>v;
/**
 * A mapper beterrn {@link SPACKTaskKey|SPACKTaskKeys} and their corresponding {@link SPACKMapEntry|SPACKMapEntries}.
 */
const SPACKTaskKeyMap = {
    [SPACKTaskKey.NULL]:             { id: 0, packer: nilpack, unpacker: nilpack },
    [SPACKTaskKey.TASKS]:            { id: 1, packer: nilpack, unpacker: nilpack },
    [SPACKTaskKey.FREQUENCY]:        { id: 2, packer: Omissible(packTimeIntervalString), unpacker: nilpack },
    [SPACKTaskKey.DEVICE_METRICS]:   { id: 3, packer: Omissible(packDeviceMetrics), unpacker: Omissed(unpackDeviceMetrics) },
    [SPACKTaskKey.GLOBAL_OPTIONS]:   { id: 4, packer: Omissible(packGlobalOptions), unpacker: Omissed(unpackGlobalOptions) },
    [SPACKTaskKey.MODE]:             { id: 5, packer: nilpack, unpacker: nilpack },
    [SPACKTaskKey.TARGET]:           { id: 6, packer: nilpack, unpacker: nilpack },
    [SPACKTaskKey.DURATION]:         { id: 7, packer: Omissible(packTimeIntervalString), unpacker: nilpack },
    [SPACKTaskKey.TRANSPORT]:        { id: 8, packer: nilpack, unpacker: nilpack },
    [SPACKTaskKey.INTERVAL]:         { id: 9, packer: Omissible(packTimeIntervalString), unpacker: nilpack },
    [SPACKTaskKey.COUNTER]:          { id: 10, packer: nilpack, unpacker: nilpack },
    [SPACKTaskKey.LINK_METRICS]:     { id: 11, packer: packLinkMetrics, unpacker: unpackLinkMetrics },
    [SPACKTaskKey.BANDWIDTH]:        { id: 12, packer: nilpack, unpacker: nilpack },
    [SPACKTaskKey.JITTER]:           { id: 13, packer: nilpack, unpacker: nilpack },
    [SPACKTaskKey.PACKET_LOSS]:      { id: 14, packer: nilpack, unpacker: nilpack },
    [SPACKTaskKey.LATENCY]:          { id: 15, packer: nilpack, unpacker: nilpack },
    [SPACKTaskKey.ALERT_CONDITIONS]: { id: 16, packer: Omissible(packAlertConditions), unpacker: Omissed(unpackAlertConditions) },
    [SPACKTaskKey.CPU_USAGE]:        { id: 17, packer: nilpack, unpacker: nilpack },
    [SPACKTaskKey.RAM_USAGE]:        { id: 18, packer: nilpack, unpacker: nilpack },
    [SPACKTaskKey.INTERFACE_STATS]:  { id: 19, packer: packInterfaceStats, unpacker: unpackInterfaceStats },
    [SPACKTaskKey.VOLUME]:           { id: 20, packer: nilpack, unpacker: nilpack },
    [SPACKTaskKey._NAMED_KEY]:       { id: 255, packer: nilpack, unpacker: nilpack },
} as const satisfies Record<SPACKTaskKey, SPACKMapEntry>;
type SPACKTaskKeyMap = typeof SPACKTaskKeyMap;
type SPACKTaskKeyMapID = SPACKTaskKeyMap[keyof SPACKTaskKeyMap]["id"];

// Compile-time guard for SPACKTaskKeyMap. If any malformed properties are present in the map, this should explode.
type _SPACKTaskKeyMapGuard = AssertUniqueProperty<typeof SPACKTaskKeyMap, "id">;
const _SPACKTaskKeyMapGuard: _SPACKTaskKeyMapGuard = SPACKTaskKeyMap;

// Inverse mapper of SPACKTaskKeyMap
const _SPACKTaskIDMap = <Record<SPACKTaskKeyMapID, keyof SPACKTaskKeyMap>>
    Object.fromEntries(Object.entries(SPACKTaskKeyMap).map(([k, v]) => [v.id, k]));

/**
 * Represents a deserialized {@link Task} using SPACK. The properties are proxied in order for the Control Schemas
 * to be able to transform properties before being used.
 * 
 * Initially, it would be statically allocated, but deepMerges were being problematic.
 */
class _SPACKTask {
    private unpacked: Partial<Task>;
    private defaults: Task;
    private globalOptions: Task["global_options"];
    // private data: Task;

    constructor(unpacked: Partial<Task>, defaults?: Task) {
        this.unpacked = unpacked;
        this.defaults = defaults ?? DEFAULT_TASK;
        this.globalOptions = { ...this.defaults?.global_options, ...unpacked.global_options };

        return new Proxy(this, {
            get: (target, prop) => {
                if (prop in target) {
                    return (<GenericObject>target)[prop];
                }
        
                return this.proxyAccess(prop as keyof Task);
            },
        });
    }

    private proxyAccess<P extends keyof Task>(prop: P): unknown {
        const valueInData = this.unpacked[prop];
        const valueInDefaults = this.defaults[prop];

        if (valueInData !== undefined) {
            if (typeof valueInData === "object" && valueInData !== null) {
                return this.createNestedProxy(<GenericObject>valueInData, <GenericObject>valueInDefaults);
            }
            return valueInData;
        }

        if (valueInDefaults !== undefined) {
            if (typeof valueInDefaults === "object" && valueInDefaults !== null) {
                return this.createNestedProxy({}, <GenericObject>valueInDefaults);
            }
            return valueInDefaults;
        }

        return valueInDefaults;
    }

    private createNestedProxy(data: GenericObject, defaults: GenericObject): unknown {
        return new Proxy(data || {}, {
            get: (_, prop) => {
                const valueInData = data?.[prop];
                const valueInDefaults = defaults?.[prop];
                
                let ret;
                
                // Defaults is being used as a schema here, to check whether this property should be merged with the global options.
                if (valueInDefaults === OPTIONS) {
                    if (valueInData === undefined) return undefined;

                    if (typeof valueInData === "object" && valueInData !== null) {
                        ret = { ...this.globalOptions, ...valueInData };
                    } else {
                        ret = this.globalOptions;
                    }
                } else {
                    if (valueInData !== undefined) {
                        if (typeof valueInData === "object" && valueInData !== null) {
                            return this.createNestedProxy(<GenericObject>valueInData, <GenericObject>valueInDefaults);
                        }
    
                        ret = valueInData;
                    } else ret = valueInDefaults;

                }

                if (ret === UNDEFINED) return undefined;
                else return ret;
            },
        });
    }

    public getUnpacked() {
        return this.unpacked;
    }
}
type SPACKTask = _SPACKTask & Task;
/**
 * A {@link SPACKPacker} that packs {@link Task.device_metrics|Device Metrics}.
 */
function packDeviceMetrics(value: unknown): SPACKTaskPackedNullable {
    if (typeof value !== "object" || value === null) throw new SPACKError("Packing error: Unexpected value.");

    let byte = 0 & 0;
    if (SPACKTaskKey.CPU_USAGE in value && value[SPACKTaskKey.CPU_USAGE])             byte |= 0b0001;
    if (SPACKTaskKey.RAM_USAGE in value && value[SPACKTaskKey.RAM_USAGE])             byte |= 0b0010;
    if (SPACKTaskKey.INTERFACE_STATS in value && value[SPACKTaskKey.INTERFACE_STATS]) byte |= 0b0100;
    if (SPACKTaskKey.VOLUME in value && value[SPACKTaskKey.VOLUME])                   byte |= 0b1000;

    return byte || undefined;
}
/**
 * A {@link SPACKUnpacker} that unpacks {@link Task.device_metrics|Device Metrics}.
 */
function unpackDeviceMetrics(value: SPACKTaskPackedValue): Record<string, unknown> {
    const unpacked: Record<string, unknown> = {};

    if ((value & 0b0001) === 0b0001) unpacked[SPACKTaskKey.CPU_USAGE] = true;
    if ((value & 0b0010) === 0b0010) unpacked[SPACKTaskKey.RAM_USAGE] = true;
    if ((value & 0b0100) === 0b0100) unpacked[SPACKTaskKey.INTERFACE_STATS] = true;
    if ((value & 0b1000) === 0b1000) unpacked[SPACKTaskKey.VOLUME] = true;

    return unpacked;
}

/**
 * A {@link SPACKPacker} that packs {@link Task.device_metrics.interface_stats|Interface Stats}.
 * Interface Stats are a object of the type `Record<string, number>`, where the keys are the names of the interfaces 
 * (e.g, "eth0", "wlo1") and the values are the throughput of said interface.
 * 
 * This function expects a value in the form `{ [KEYMAP]: Record<number, string>, value: Record<string, number> }`,
 * where `[KEYMAP]` is a {@link KEYMAP|KeyMap}, and the `value` is the Interface Stats themselves.
 * 
 * This function causes side effects to the KeyMap. Keys are computed or inserted as needed by reference.
 * 
 * @returns A record with the keys mapped to their key index.
 */
function packInterfaceStats(value: unknown): SPACKTaskPackedObject {
    if (typeof value !== "object" || value === null) 
        throw new SPACKError("Interface Stats packing error: Not an array.");

    if (!(KEYMAP in value)) throw new SPACKError("Interface Stats packing error: No keymap present.");
    if (typeof value[KEYMAP] !== "object") throw new SPACKError("Interface Stats packing error: Keymap is not an object.");

    if (!("value" in value)) throw new SPACKError("Interface Stats packing error: No value present.");
    // if (!Array.isArray(value.value)) throw new SPACKError("Interface Stats packing error: Value is not an array.");
    if (typeof value.value !== "object") throw new SPACKError("Interface Stats packing error: Value is not an array.");

    const packed: Record<number, number> = {};
    for (const prop in value.value) {
        // if (!Array.isArray(value.value[prop])) throw new SPACKError("Interface Stats packing error: Interface satt is not an array.");
    
        // let keyIndex: number;
        // if ((keyIndex = value[KEYMAP].findIndex((v) => v === prop)) === -1) {
        //     keyIndex = value[KEYMAP].push(prop);
        // }

        let key: number = -1;
        for (const mk in value[KEYMAP]) {
            if (value[KEYMAP][<never>mk] === prop) {
                key = parseInt(mk, 10);
                break;
            }
        }

        if (key === -1) {
            key = Object.keys(<never>value[KEYMAP]).length + 1;
            (<Record<number, unknown>>value[KEYMAP])[key] = prop;
        }

        packed[ID(SPACKTaskKey._NAMED_KEY) + key] = value.value[<keyof typeof value.value>prop];
    }

    return packed;
}

/**
 * A {@link SPACKUnpacker} that unpacks {@link Task.device_metrics.interface_stats|Interface Stats}.
 */
function unpackInterfaceStats(value: SPACKTaskPackedObject): Record<string, number> {
    if (!(KEYMAP in value)) throw new SPACKError("Interface Stats unpacking error: No keymap present.");
    if (!Array.isArray(value[KEYMAP])) throw new SPACKError("Interface Stats unpacking error: Keymap is not an array.");

    const unpacked: Record<string, number> = {};
    for (const prop in value) {
        // TODO: Assert that the property is actually a number, instead of just trusting it.
        unpacked[value[KEYMAP][prop]] = <number>value[prop];
    }

    return unpacked;
}

/**
 * A {@link SPACKPacker} that packs {@link Task.global_options|Global Options}.
 */
function packGlobalOptions(value: unknown): SPACKTaskPackedObject {
    if (typeof value !== "object" || value === null) throw new SPACKError("Packing error: Unexpected value.");

    const packed: SPACKTaskPackedObject = {};

    let mtByte = 0 & 0; // Mode and Transport Byte.
    let hasMT = false;
    if (SPACKTaskKey.MODE in value) {
        hasMT = true;
        if (value[SPACKTaskKey.MODE] === "client") mtByte |= 0b10;
        else if (value[SPACKTaskKey.MODE] === "server") mtByte |= 0b11;
        else throw new SPACKError(`Packing error: Unexpected value for property '${SPACKTaskKey.MODE}'.`);
    }
    if (SPACKTaskKey.TRANSPORT in value) {
        hasMT = true;
        if (value[SPACKTaskKey.TRANSPORT] === "udp") mtByte |= 0b1000;
        else if (value[SPACKTaskKey.TRANSPORT] === "tcp") mtByte |= 0b1100;
        else throw new SPACKError(`Packing error: Unexpected value for property '${SPACKTaskKey.TRANSPORT}'.`);
    }
    if (hasMT) packed[ID(SPACKTaskKey.MODE)] = mtByte;

    if (SPACKTaskKey.TARGET in value) {
        if (typeof value[SPACKTaskKey.TARGET] !== "string") 
            throw new SPACKError(`Packing error: Unexpected type for property '${SPACKTaskKey.TARGET}'.`);

        let ip;
        if (value[SPACKTaskKey.TARGET].includes(".")) { // Direct IP
            ip = value[SPACKTaskKey.TARGET];
        } else { // Device reference
            const device = global.config.devices[value[SPACKTaskKey.TARGET]];
            if (!device) throw new SPACKError(`Packing error: Invalid device reference for property '${SPACKTaskKey.TARGET}'.`);

            ip = device.ip;
        }

        const ipNum = ip.split(".").map(p => parseInt(p, 10)).reduce((acc, cur) => ((acc << 8) | cur) >>> 0, 0);
        // let recIp = [24, 16, 8, 0].map(o => (ipNum >> o >>> 0) & 255);

        packed[ID(SPACKTaskKey.TARGET)] = ipNum;
    }

    if (SPACKTaskKey.DURATION in value) {
        packed[ID(SPACKTaskKey.DURATION)] = packTimeIntervalString(value[SPACKTaskKey.DURATION]);
    }

    if (SPACKTaskKey.INTERVAL in value) {
        packed[ID(SPACKTaskKey.INTERVAL)] = packTimeIntervalString(value[SPACKTaskKey.INTERVAL]);
    }

    if (SPACKTaskKey.COUNTER in value) {
        packed[ID(SPACKTaskKey.COUNTER)] = <number>value[SPACKTaskKey.COUNTER];
    }

    return packed;
}
/**
 * A {@link SPACKUnpacker} that unpacks {@link Task.global_options|Global Options}.
 */
function unpackGlobalOptions(value: SPACKTaskPackedObject): Record<string, unknown> {
    const unpacked: Record<string, unknown> = {};

    if (ID(SPACKTaskKey.MODE) in value) {
        const mtByte = <number>value[ID(SPACKTaskKey.MODE)];

        if ((mtByte & 0b11) === 0b11) unpacked[SPACKTaskKey.MODE] = "server";
        else if ((mtByte & 0b10) === 0b10) unpacked[SPACKTaskKey.MODE] = "client";

        if ((mtByte & 0b1100) === 0b1100) unpacked[SPACKTaskKey.TRANSPORT] = "tcp";
        else if ((mtByte & 0b1000) === 0b1000) unpacked[SPACKTaskKey.TRANSPORT] = "udp";
    }

    if (ID(SPACKTaskKey.TARGET) in value) {
        unpacked[SPACKTaskKey.TARGET] = [24, 16, 8, 0].map(o => (<number>value[ID(SPACKTaskKey.TARGET)] >> o >>> 0) & 255).join(".");
    }

    if (ID(SPACKTaskKey.DURATION) in value) {
        unpacked[SPACKTaskKey.DURATION] = value[ID(SPACKTaskKey.DURATION)];
    }

    if (ID(SPACKTaskKey.INTERVAL) in value) {
        unpacked[SPACKTaskKey.INTERVAL] = value[ID(SPACKTaskKey.INTERVAL)];
    }
    
    if (ID(SPACKTaskKey.COUNTER) in value) {
        unpacked[SPACKTaskKey.COUNTER] = value[ID(SPACKTaskKey.COUNTER)];
    }
    

    return unpacked;
}

/**
 * A {@link SPACKUnpacker} that unpacks {@link Task.link_metrics|Link Metrics}.
 */
function packLinkMetrics(value: unknown): SPACKTaskPackedObject {
    if (typeof value !== "object" || value === null) throw new SPACKError("Packing error: Unexpected value.");

    const packed: SPACKTaskPackedObject = {};

    for (const key of [SPACKTaskKey.BANDWIDTH, SPACKTaskKey.JITTER, SPACKTaskKey.PACKET_LOSS, SPACKTaskKey.LATENCY]) {
        if (key in value) {
            const options = packGlobalOptions(value[<keyof typeof value>key]);
            
            if (Object.keys(options).length > 0) packed[ID(key)] = options;
            else packed[ID(key)] = 0b1;
        }
    }

    return packed;
}
/**
 * A {@link SPACKUnpacker} that unpacks {@link Task.link_metrics|Link Metrics}.
 * 
 * At this point, options are not squashed, see {@link _SPACKTask|SPACKTask} for more information.
 */
function unpackLinkMetrics(value: SPACKTaskPackedObject): Record<string, unknown> {
    const unpacked: Record<string, unknown> = {};

    for (const key of [SPACKTaskKey.BANDWIDTH, SPACKTaskKey.JITTER, SPACKTaskKey.PACKET_LOSS, SPACKTaskKey.LATENCY]) {
        if (ID(key) in value) {
            if (typeof value[ID(key)] !== "object") {
                // Edge case: No overrides, 0x01 transmitted for bandwidth saving.
                if (value[ID(key)] === 0x01) {
                    unpacked[key] = {};
                } else {
                    throw new SPACKError("Unpacking error: Invalid value.");
                }
            } else {
                unpacked[key] = unpackGlobalOptions(<SPACKTaskPackedObject>value[ID(key)]);
            }
        }
    }

    return unpacked;
}

/**
 * A {@link SPACKPacker} that packs {@link Task.alert_conditions|Alert Condition}.
 */
function packAlertConditions(value: unknown): SPACKTaskPackedObject {
    if (typeof value !== "object" || value === null) throw new SPACKError("Packing error: Unexpected value.");

    const packed: SPACKTaskPackedObject = {};

    let hasCR = false;
    let crShort = 0 & 0;
    if (SPACKTaskKey.CPU_USAGE in value) {
        hasCR = true;
        crShort |= <number>value[SPACKTaskKey.CPU_USAGE];
    }
    if (SPACKTaskKey.RAM_USAGE in value) {
        hasCR = true;
        crShort |= <number>value[SPACKTaskKey.RAM_USAGE] << 8;
    }
    if (hasCR) packed[ID(SPACKTaskKey.CPU_USAGE)] = crShort;

    if (SPACKTaskKey.INTERFACE_STATS in value) {
        packed[ID(SPACKTaskKey.INTERFACE_STATS)] = <number>value[SPACKTaskKey.INTERFACE_STATS];
    }

    if (SPACKTaskKey.PACKET_LOSS in value) {
        packed[ID(SPACKTaskKey.PACKET_LOSS)] = <number>value[SPACKTaskKey.PACKET_LOSS];
    }

    if (SPACKTaskKey.JITTER in value) {
        packed[ID(SPACKTaskKey.JITTER)] = <number>value[SPACKTaskKey.JITTER];
    }

    if (SPACKTaskKey.LATENCY in value) {
        packed[ID(SPACKTaskKey.LATENCY)] = <number>value[SPACKTaskKey.LATENCY];
    }

    return packed;
}
/**
 * A {@link SPACKUnpacker} that unpacks {@link Task.alert_conditions|Alert Conditions}.
 */
function unpackAlertConditions(value: SPACKTaskPackedObject): Record<string, unknown> {
    const unpacked: Record<string, unknown> = {};

    if (ID(SPACKTaskKey.CPU_USAGE) in value) {
        const crShort = <number>value[ID(SPACKTaskKey.CPU_USAGE)];
        unpacked[SPACKTaskKey.CPU_USAGE] = crShort & 255;
        unpacked[SPACKTaskKey.RAM_USAGE] = crShort >> 8 & 255;

        if (unpacked[SPACKTaskKey.CPU_USAGE] === 0) delete unpacked[SPACKTaskKey.CPU_USAGE];
        if (unpacked[SPACKTaskKey.RAM_USAGE] === 0) delete unpacked[SPACKTaskKey.RAM_USAGE];
    }

    if (ID(SPACKTaskKey.INTERFACE_STATS) in value) {
        unpacked[SPACKTaskKey.INTERFACE_STATS] = value[ID(SPACKTaskKey.INTERFACE_STATS)];
    }

    if (ID(SPACKTaskKey.PACKET_LOSS) in value) {
        unpacked[SPACKTaskKey.PACKET_LOSS] = value[ID(SPACKTaskKey.PACKET_LOSS)];
    }

    if (ID(SPACKTaskKey.JITTER) in value) {
        unpacked[SPACKTaskKey.JITTER] = value[ID(SPACKTaskKey.JITTER)];
    }

    if (ID(SPACKTaskKey.LATENCY) in value) {
        unpacked[SPACKTaskKey.LATENCY] = value[ID(SPACKTaskKey.LATENCY)];
    }

    return unpacked;
}

/**
 * A list of the keys allowed in a Task Schema.
 */
const _TASK_KEYS = [
    SPACKTaskKey.FREQUENCY, 
    SPACKTaskKey.DEVICE_METRICS, 
    SPACKTaskKey.GLOBAL_OPTIONS, 
    SPACKTaskKey.LINK_METRICS, 
    SPACKTaskKey.ALERT_CONDITIONS
];

/**
 * A {@link SPACKPacker} that packs {@link Task|Tasks}.
 */
function packTaskSchema(task: Task): SPACKTaskPackedNonNullable {
    // logger.log("TASK:", task);
    const packed: SPACKTaskPacked = {};

    for (const key in task) {
        const prop = task[<keyof Task>key];
        
        if (!isSPACKTaskKey(key)) throw new SPACKError(`Task schema packing error: Key '${key}' is unknown.`);
        
        const spack = SPACKTaskKeyMap[key];
        packed[spack.id] = spack.packer(prop);
    }

    return packed;
}

/**
 * A {@link SPACKUnpacker} that unpacks {@link Task|Tasks}. This function returns a proxy that hydrates the values
 * as needed (i.e squashing option fields).
 */
function unpackTaskSchema(value: SPACKTaskPacked): SPACKTask {
    if (typeof value !== "object" || value === null) throw new SPACKError("Task schema unpacking error: Unexpected value.");

    const unpacked: Partial<Task> = {};

    for (const key in value) {
        const prop = SPACKTaskKeyMap[KEY(<SPACKTaskKeyMapID>Number(key))];

        if (!isSPACKTaskKey(KEY(<SPACKTaskKeyMapID>Number(key)))) 
            throw new SPACKError(`Task schema unpacking error: Packed key '${key}' is unknown.`);
        if (!_TASK_KEYS.includes(KEY(<SPACKTaskKeyMapID>Number(key)))) 
            throw new SPACKError(`Task schema unpacking error: Unexpected key '${KEY(<SPACKTaskKeyMapID>Number(key))}' is unknown.`);
        
        //@ts-expect-error The previous conditional statement already guarantees that the key exists, 
        // and I'm way too tired to deal with typescript's bullshit right now.
        unpacked[KEY(<SPACKTaskKeyMapID>Number(key))] = prop.unpacker(<never>value[key]);
    }

    // return unpacked;

    //@ts-expect-error Typescript has quite the hard time infering the type of Proxies, but the type is guaranteed to be
    // correct at runtime.
    return new _SPACKTask(unpacked);
}

/**
 * A {@link SPACKUnpacker} that unpacks {@link Task|Tasks}.
 */
function packTaskSchemas(tasks: Record<string, Task>): Record<string, SPACKTaskPacked> {
    const ret: Record<string, SPACKTaskPacked> = {
        /** Used in serialization, to distinguish the keys. */
        [KEYMAP]: <Record<number, string>>{}
    };

    let offset = 0;
    for (const key in tasks) {
        offset++;
        ret[offset + ID(SPACKTaskKey._NAMED_KEY)] = dropEmpty(<never>packTaskSchema(tasks[key]));
        //@ts-expect-error Due to sheer stupidity, the Typescript developers refuse to make the typesystem correctly work
        // with symbols, because fuck you, that's why.
        (<Record<number, string>>ret[KEYMAP])[offset] = key;
    }

    return ret;
}

/**
 * A {@link SPACKUnpacker} that unpacks a collection of {@link Task|Tasks}.
 */
function unpackTaskSchemas(value: SPACKTaskCollectionPacked): { [key: string]: SPACKTask } {
    const obj = Object.fromEntries(Object.entries(value).map(([k,v]) => [k, unpackTaskSchema(v)]));
    Object.defineProperty(obj, SPACK_MARK_TASK_COLLECTION, {
        value: true,
        enumerable: false,
        configurable: true
    });

    return obj;
}

/**
 * The numerical Id for each type to be used in (de)serialization.
 */
const SerializationType = {
    u8:  1,
    u16: 2,
    u32: 3,
    s8:  4,
    s16: 5,
    s32: 6,
    float: 7,
    double: 8,
    object: 255
} as const;
type SerializationType = typeof SerializationType;

/**
 * The bytesize for each {@link SerializationType}.
 * 
 * Objects have -1 for their bytesize as it's size is not directly stated, but rather dynamically read.
 */
const SerializationTypeByteSize = {
    u8:  1,
    u16: 2,
    u32: 4,
    s8:  1,
    s16: 2,
    s32: 4,
    float: 4,
    double: 8,

    object: -1
} as const satisfies Record<keyof SerializationType, number>;

const SerializationTypeUnsignedKeys = ["u8", "u16", "u32"] as const satisfies Array<keyof SerializationType>;
const SerializationTypeSignedKeys = ["s8", "s16", "s32"] as const satisfies Array<keyof SerializationType>;

/**
 * Converts a packed object into a serialized Buffer for transmission.
 * @param spack The packed object to be serialized.
 * @param keymap An optional keymap to be used in object to rehydrate the keys. Objects have their own keymap embedded,
 * having preference over the passed keymap.
 */
function serializeSPACK(spack: SPACKPacked, keymap?: Record<number, string>): Buffer {
    if (typeof spack === "object") {
        const writer = new BufferWriter();

        writer.writeUInt8(SerializationType.object);
        writer.writeUInt8(Object.keys(spack).length);

        for (const key in spack) {
            if (spack[<never>key] === undefined) continue; // Silently ignore nulled values
            //@ts-expect-error Do not attempt to serialize the Keymap, if it exists.
            if (key === KEYMAP) continue;

            const keyMap: Record<number, string> | undefined = (KEYMAP in spack) 
                ? <Record<number, string>>spack[KEYMAP] 
                : keymap;

            const serVal = serializeSPACK(spack[<never>key], keyMap);
            const keyId = parseInt(key);

            if (keyId > ID(SPACKTaskKey._NAMED_KEY)) {
                if (!keyMap) throw new Error("Malformed SPACK Object: Named key references missing keymap.");
                const keyName = keyMap[keyId - ID(SPACKTaskKey._NAMED_KEY)];

                // if (!(KEYMAP in spack)) throw new Error("Malformed SPACK Object: Named key references missing keymap.");
                // const keyName = (<Record<number, string>>spack[KEYMAP])[keyId - ID(SPACKTaskKey._NAMED_KEY)];

                writer.writeUInt8(ID(SPACKTaskKey._NAMED_KEY));
                writer.writeUInt8(keyName.length);
                writer.write(Buffer.from(keyName, "utf8"));
            } else {
                writer.writeUInt8(keyId);
            }
            // No need to write the size of the KVP because it follows a static structure.
            writer.write(serVal);
        }

        return writer.finish();
    } else {
        if (spack) {
            let sType: keyof SerializationType;
            if (spack < 0) {
                for (const type in SerializationTypeSignedKeys) {
                    // if (spack < (1 << (SerializationTypeByteSize[SerializationTypeSignedKeys[type]] * 8))) {
                    if (spack >= -(2 ** (SerializationTypeByteSize[SerializationTypeSignedKeys[type]] * 8) - 1)) {
                        sType = SerializationTypeSignedKeys[Number(type)];
                        break;
                    }
                }

                sType ??= <never>SerializationTypeSignedKeys.at(-1);
            } else {
                for (const type in SerializationTypeUnsignedKeys) {
                    // if (spack < (1 << (SerializationTypeByteSize[SerializationTypeUnsignedKeys[type]] * 8))) {
                    if (spack < (2 ** (SerializationTypeByteSize[SerializationTypeUnsignedKeys[type]] * 8) - 1)) {
                        sType = SerializationTypeUnsignedKeys[Number(type)];
                        break;
                    }
                }

                sType ??= <never>SerializationTypeUnsignedKeys.at(-1);
            }
            
            const buf = Buffer.alloc(SERIALIZED_KEY_SIZE + SerializationTypeByteSize[sType]);
            buf.writeUInt8(SerializationType[sType]);

            switch (sType) {
                case "u8":  buf.writeUInt8(spack, 1); break;
                case "u16": buf.writeUInt16BE(spack, 1); break;
                case "u32": buf.writeUInt32BE(spack, 1); break;

                case "s8":  buf.writeInt8(spack, 1); break;
                case "s16": buf.writeInt16BE(spack, 1); break;
                case "s32": buf.writeInt32BE(spack, 1); break;

                case "float": buf.writeFloatBE(spack, 1); break;
                case "double": buf.writeDoubleBE(spack, 1); break;
            }

            return buf;
        } // Silently ignore nulled values

        return Buffer.alloc(0);
    }
}

/**
 * Deserialized a transmitted Buffer into packed objects. These objects may not be rehydrated.
 */
function deserializeSPACK(ser: Buffer): SPACKPacked;
function deserializeSPACK(ser: BufferReader): SPACKPacked
function deserializeSPACK(ser: Buffer | BufferReader): SPACKPacked {
    const reader = ser instanceof BufferReader ? ser : new BufferReader(ser);

    let spack: SPACKPacked;
    const type = reader.readUInt8();

    switch (type) {
        case SerializationType.u8:  spack = reader.readUInt8(); break;
        case SerializationType.u16: spack = reader.readUInt16(); break;
        case SerializationType.u32: spack = reader.readUInt32(); break;

        case SerializationType.s8:  spack = reader.readInt8(); break;
        case SerializationType.s16: spack = reader.readInt16(); break;
        case SerializationType.s32: spack = reader.readInt32(); break;

        case SerializationType.float: spack = reader.readFloat(); break;
        case SerializationType.double: spack = reader.readDouble(); break;

        case SerializationType.object: {
            spack = {};

            const size = reader.readUInt8();
            for (let i = 0; i < size; i++) {
                let key: string | number = reader.readUInt8();
                
                if (key == ID(SPACKTaskKey._NAMED_KEY)) {
                    const keyLen = reader.readUInt8();
                    key = reader.read(keyLen).toString("utf8");
                }

                //@ts-expect-error If the key is a string, the value is assumed to be a task, complying with the type.
                spack[key] = deserializeSPACK(reader);
            }

            break;
        }

        default: {
            // If this happens, god help you.
            spack = 0;
        }
    }

    return spack;
}
//#endregion ============== Task Schema ==============

//#region ============== Metric Schema ==============
interface SPACKTaskMetric {
    device_metrics?: {
        cpu_usage?: number,
        ram_usage?: number,
        interface_stats?: Record<string, number>,
        volume?: number
    },
    link_metrics?: {
        bandwidth?: number,
        jitter?: number,
        packet_loss?: number,
        latency?: number
    }
}

const TASK_METRIC_SCHEMA = {
    device_metrics: {
        cpu_usage: SerializationType.s8,
        ram_usage: SerializationType.s8,
        interface_stats: SerializationType.object,
        volume: SerializationType.object
    },
    link_metrics: {
        bandwidth: SerializationType.s16,
        jitter: SerializationType.s16,
        packet_loss: SerializationType.s16,
        latency: SerializationType.s16
    }
};
// function packTaskMetric(metric: TaskMetric, task: Partial<Task>) {
//     const packed: Record<number, unknown> = {
//         //@ts-expect-error Hidden property, used internally.
//         [KEYMAP]: {}
//         // [ID(SPACKTaskKey._NAMED_KEY)]: []
//     };

//     // Sanity checks
//     if ("device_metrics" in task) {
//         if (!("device_metrics" in metric)) 
//             throw new SPACKError(`Metric packing error: Key missing: 'device_metrics'.`);

//         for (const key in metric.device_metrics!) {
//             if (!(key in task.device_metrics!)) logger.warn(`Metric packing warning: Unknown key: 'device_metrics.${key}'.`);
//         }

//         for (const key in task.device_metrics) {
//             if (!(key in metric.device_metrics!)) 
//                 throw new SPACKError(`Metric packing error: Key missing: 'device_metrics.${key}'.`);
            
//             if (SPACKTaskKeyMap[<SPACKTaskKey>key].packer === nilpack) {
//                 packed[ID(<SPACKTaskKey>key)] = metric.device_metrics![<keyof typeof metric.device_metrics>key];
//             } else {
//                 // Edge-case: Interface Stats needs a keymap.
//                 if (key === SPACKTaskKey.INTERFACE_STATS) {
//                     packed[ID(<SPACKTaskKey>key)] = SPACKTaskKeyMap[<SPACKTaskKey>key].packer(
//                         {
//                             //@ts-expect-error Internal use only.
//                             [KEYMAP]: packed[KEYMAP],
//                             // [KEYMAP]: packed[ID(SPACKTaskKey._NAMED_KEY)],
//                             value: metric.device_metrics![<keyof typeof metric.device_metrics>key]
//                         }
//                     );
//                 }
//             }
//         }
//     }

//     if ("link_metrics" in metric) {
//         if (!("link_metrics" in task) || !task.link_metrics) 
//             throw new SPACKError(`Metric packing error: Key not in schema: 'link_metrics'.`);

//         for (const key in metric.link_metrics) {
//             if (!(key in task.link_metrics)) 
//                 throw new SPACKError(`Metric packing error: Key not in schema: 'link_metrics.${key}'.`);
//         }

//         for (const key in task.link_metrics) {
//             if (!(key in metric.link_metrics!)) 
//                 throw new SPACKError(`Metric packing error: Key not in schema: 'link_metrics.${key}'.`);
            
//             if (SPACKTaskKeyMap[<SPACKTaskKey>key].packer === nilpack) {
//                 packed[ID(<SPACKTaskKey>key)] = metric.link_metrics![<keyof typeof metric.link_metrics>key];
//             } else {
//                 packed[ID(<SPACKTaskKey>key)] = SPACKTaskKeyMap[<SPACKTaskKey>key].packer(
//                     metric.link_metrics![<keyof typeof metric.link_metrics>key]
//                 );
//             }
//         }
//     }

//     return packed;
// }

function serializedTaskMetric(metric: SPACKTaskMetric, task: Partial<Task>): Buffer {
    const logger = getOrCreateGlobalLogger();
    // const packed: Record<number, unknown> = {
    //     //@ts-expect-error Hidden property, used internally.
    //     [KEYMAP]: {}
    //     // [ID(SPACKTaskKey._NAMED_KEY)]: []
    // };
    const keyMap = {};
    const writer = new BufferWriter();
    ;(() => TASK_METRIC_SCHEMA)();

    // Sanity checks
    if ("device_metrics" in task) {
        if (!("device_metrics" in metric)) 
            throw new SPACKError(`Metric packing error: Key missing: 'device_metrics'.`);

        for (const key in metric.device_metrics!) {
            if (!(key in task.device_metrics!)) logger.warn(`Metric packing warning: Unknown key: 'device_metrics.${key}'.`);
        }

        for (const key in task.device_metrics) {
            if (!(key in metric.device_metrics!)) 
                throw new SPACKError(`Metric packing error: Key missing: 'device_metrics.${key}'.`);
            
            if (SPACKTaskKeyMap[<SPACKTaskKey>key].packer === nilpack) {
                writer.write(serializeSPACK(metric.device_metrics![<keyof typeof metric.device_metrics>key]));
            } else {
                // Edge-case: Interface Stats needs a keymap.
                if (key === SPACKTaskKey.INTERFACE_STATS) {
                    // packed[ID(<SPACKTaskKey>key)] = SPACKTaskKeyMap[<SPACKTaskKey>key].packer(
                    //     {
                    //         //@ts-expect-error Internal use only.
                    //         [KEYMAP]: packed[KEYMAP],
                    //         // [KEYMAP]: packed[ID(SPACKTaskKey._NAMED_KEY)],
                    //         value: metric.device_metrics![<keyof typeof metric.device_metrics>key]
                    //     }
                    // );
                    writer.write(serializeSPACK(SPACKTaskKeyMap[<SPACKTaskKey>key].packer(
                        {
                            [KEYMAP]: keyMap,
                            // [KEYMAP]: packed[ID(SPACKTaskKey._NAMED_KEY)],
                            value: metric.device_metrics![<keyof typeof metric.device_metrics>key]
                        }
                    )!, keyMap));
                }
            }
        }
    }

    if ("link_metrics" in task) {
        if (!("link_metrics" in metric)) 
            throw new SPACKError(`Metric packing error: Key missing: 'link_metrics'.`);

        for (const key in metric.link_metrics!) {
            if (!(key in task.link_metrics!)) 
                logger.warn(`Metric packing warning: Key not in schema: 'link_metrics.${key}'.`);
        }

        for (const key in task.link_metrics) {
            if (!(key in metric.link_metrics!)) 
                throw new SPACKError(`Metric packing error: Key not in schema: 'link_metrics.${key}'.`);
            
            if (SPACKTaskKeyMap[<SPACKTaskKey>key].packer === nilpack) {
                // packed[ID(<SPACKTaskKey>key)] = metric.link_metrics![<keyof typeof metric.link_metrics>key];
                writer.write(serializeSPACK(metric.link_metrics![<keyof typeof metric.link_metrics>key]));
            } else {
                // packed[ID(<SPACKTaskKey>key)] = SPACKTaskKeyMap[<SPACKTaskKey>key].packer(
                //     metric.link_metrics![<keyof typeof metric.link_metrics>key]
                // );
                writer.write(serializeSPACK(SPACKTaskKeyMap[<SPACKTaskKey>key].packer(
                    metric.link_metrics![<keyof typeof metric.link_metrics>key]
                )!));
            }
        }
    }

    return writer.finish();
}

function deserializeTaskMetric(metric: Buffer, task: Partial<Task>) {
    // const logger = getOrCreateGlobalLogger();

    const unpacked = {
        device_metrics: <Record<string, unknown>>{},
        link_metrics: <Record<string, unknown>>{}
    };

    const reader = new BufferReader(metric);

    if ("device_metrics" in task) {
        for (const key in task.device_metrics) {
            if (!task.device_metrics[<keyof typeof task.device_metrics>key]) continue;

            if (SPACKTaskKeyMap[<SPACKTaskKey>key].packer === nilpack) {
                unpacked["device_metrics"][key] = deserializeSPACK(reader);
            } else {
                // Edge-cases. Currently none.
                unpacked["device_metrics"][key] = deserializeSPACK(reader);
            }
        }
    }

    if ("link_metrics" in task) {
        for (const key in task.link_metrics) {
            if (!task.link_metrics[<keyof typeof task.link_metrics>key]) continue;

            if (SPACKTaskKeyMap[<SPACKTaskKey>key].packer === nilpack) {
                unpacked["link_metrics"][key] = deserializeSPACK(reader);
            } else {
                // Edge-cases. Currently none.
                unpacked["link_metrics"][key] = deserializeSPACK(reader);
            }
        }
    }

    return unpacked;
}
//#endregion ============== Metric Schema ==============

//#region ============== Type Assertions ==============
function isSPACKTaskCollection(obj: unknown): obj is { [key: string]: SPACKTask } {
    return typeof obj === "object" && obj !== null && SPACK_MARK_TASK_COLLECTION in obj && !!obj[SPACK_MARK_TASK_COLLECTION];
}
//#endregion ============== Type Assertions ==============

export {
    type SPACKTaskPackedNonNullable,
    type SPACKTaskCollectionPacked,
    type SPACKPacked,
    type _SPACKTask,
    type SPACKTaskMetric,
    SPACKTask,
    IgnoreValues,

    packTaskSchema,
    packTaskSchemas,
    unpackTaskSchema,
    unpackTaskSchemas,
    serializeSPACK,
    deserializeSPACK,
    serializedTaskMetric,
    deserializeTaskMetric,

    isSPACKTaskCollection
};



// const { initConfig } = await import("../../server/config.js");

// const logger = getOrCreateGlobalLogger({ debug: true, printCallerFile: true });
// if (!("config" in globalThis)) await initConfig("tmp/config.json");
// logger.log("CONFIG:", config);

// const pack = dropEmpty(<never>packTaskSchema(config.tasks["task1"]));

// logger.log("PACK:", pack);

// const ser = serializeSPACK(pack);
// logger.log("SERIALIZED:", ser);
// logger.log("SERIALIZED PASTE:", ser.toString("hex"));
// logger.log("PACK SCHEMA:", pack);

// const deser = deserializeSPACK(ser);
// logger.log("DESERIALIZED:", deser);

// const unpacked = unpackTaskSchema(pack);
// logger.log("UNPACK SCHEMA:", unpacked);
// // logger.log("EXPANDED SCHEMA:", expandUnpackedTaskSchema(unpacked));

// const task: SPACKTask = <never>new _SPACKTask(unpacked);
// logger.log("SPACKTASK:", task.global_options);





// const tasks = Object.fromEntries(Object.entries(config.tasks).filter(([k,_]) => config.devices["deviceLH"].tasks.includes(k)));
// logger.log("TASKS:", tasks);

// const pack = packTaskSchemas(tasks);
// logger.log("PACK:", pack);

// const ser = serializeSPACK(pack);
// logger.log("SERIALIZED:", ser);
// logger.log("SERIALIZED PASTE:", ser.toString("hex"));

// const deser = deserializeSPACK(ser);
// logger.log("DESER:", deser);

// const ntasks = unpackTaskSchemas(<never>deser);
// logger.log("NTASKS:", ntasks);
// logger.log("NTASK:", ntasks["task1"].device_metrics);

// const metric = serializedTaskMetric({
//     device_metrics: {
//         cpu_usage: 90,
//         ram_usage: 70,
//         interface_stats: {
//             eth0: 1234,
//             eth1: 5678
//         },
//         volume: 10
//     },
//     link_metrics: {
//         bandwidth: 123,
//         jitter: 456,
//         packet_loss: 789,
//         latency: 147
//     }
// }, ntasks.task1.getUnpacked());
// logger.log("METRIC:", metric);

// const demetric = deserializeTaskMetric(ntasks.task1.getUnpacked(), metric);
// logger.log("DEMETRIC:", demetric);

// // logger.log("DEMETRIC:", deserializeSPACK(metric));

// // const serMetric = serializeSPACK(<never>metric);
// // logger.log("SERIALIZED METRIC:", serMetric);
// // logger.log("SERIALIZED METRIC PASTE:", serMetric.toString("hex"));

// // const deserMetric = deserializeSPACK(serMetric);
// // logger.log("DESERIALIZED METRIC:", deserMetric);
