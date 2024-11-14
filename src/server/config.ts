import path from "path";
import { readJsonFile } from "$common/util/paths.js"
import { isValid, VALID, Validation } from "$common/util/validation.js";

//#region ============== Types ==============
declare global {
    var config: Config;
}

interface DeviceMetrics {
    cpu_usage?: boolean,
    ram_usage?: boolean,
    interface_stats?: boolean,
    volume?: boolean
}

interface GlobalOptions {
    mode?: string,
    target?: string,
    duration?: string,
    transport?: string,
    interval?: string,
    counter?: number
}

interface LinkMetrics {
    bandwith?: Bandwith,
    jitter?: Jitter,
    packet_loss?: Packet_loss,
    latency?: Latency
}

interface IperfMetrics {
    mode?: string,
    target?: string,
    duration?: string,
    transport?: string,
    interval?: string
}

interface Bandwith extends IperfMetrics {}
interface Jitter extends IperfMetrics {}
interface Packet_loss extends IperfMetrics {}
interface Latency {
    target?: string,
    counter?: number,
    interval?: string
}

interface AlertConditions {
    cpu_usage?: number,
    ram_usage?: number,
    interface_stats?: number,
    packet_loss?: number,
    jitter?: string,
    latency?: string
}

interface Device {
    ip: string,
    tasks: string[]
}

interface Task {
    frequency: string,
    device_metrics: DeviceMetrics,
    global_options: GlobalOptions,
    link_metrics: LinkMetrics,
    alert_conditions: AlertConditions
}

interface Config {
    tasks: Record<string, Task>,
    devices: Record<string, Device>
}
//#endregion ============== Types ==============

function validateConfig(config: Config): Validation {
    // TODO: Validate config contents to assert data validity.

    return VALID;
}

async function initConfig(file: string) {
    const filePath = path.join(process.cwd(), file);
    const json = await readJsonFile<Config>(filePath);

    const validation = validateConfig(json);
    if (!isValid(validation)) {
        throw new Error("Invalid config.", { cause: validation.error })
    }

    globalThis.config = json;
    return config;
}

export type { Config, Task, Device };
export {
    initConfig
};