import path from "path";
import { readJsonFile } from "$common/util/paths.js"
import { INVALID, isValid, VALID, Validation } from "$common/util/validation.js";
import { getOrCreateGlobalLogger } from "$common/util/logger.js";
import { parseStringInterval } from "$common/util/date.js";

//#region ============== Types ==============
declare global {
    var config: TransformedConfig;
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

type TransformedTask = Omit<Task, "frequency" | "global_options" | "link_metrics" | "alert_conditions"> & {
    frequency: number;
    global_options: Omit<GlobalOptions, "duration" | "interval"> & {
        duration?: number;
        interval?: number;
    };
    link_metrics: {
        bandwith?: Omit<Bandwith, "duration" | "interval"> & { duration?: number, interval?: number };
        jitter?: Omit<Jitter, "duration" | "interval"> & { duration?: number, interval?: number };
        packet_loss?: Omit<Packet_loss, "duration" | "interval"> & { duration?: number, interval?: number };
        latency?: Omit<Latency, "interval"> & { interval?: number };
    };
    alert_conditions: Omit<AlertConditions, "jitter" | "latency"> & {
        jitter?: number;
        latency?: number;
    };
};

type TransformedConfig = Omit<Config, "tasks"> & {
    tasks: Record<string, TransformedTask>
}

//#endregion ============== Types ==============

function validateTask(task: Task): boolean {
    // Validate nil components
    if (!task.frequency) return false;
    if (!task.device_metrics && !task.link_metrics && !task.global_options)   return false;

    // Validate Device Metrics
    if (!task.device_metrics.cpu_usage && !task.device_metrics.interface_stats && !task.device_metrics.ram_usage && !task.device_metrics.volume)  return false;

    // Validate Alert Conditions for Device Metrics
    if (!task.device_metrics.cpu_usage && task.alert_conditions.cpu_usage)  return false;
    if (!task.device_metrics.interface_stats && task.alert_conditions.interface_stats) return false;
    if (!task.device_metrics.ram_usage && task.alert_conditions.ram_usage)  return false;

    // Validate Metrics components
    if (task.link_metrics.bandwith) {
        if (!task.global_options.mode && !task.link_metrics.bandwith?.mode)  return false;
        if (!task.global_options.target && !task.link_metrics.bandwith?.target)  return false;
        if (!task.global_options.duration && !task.link_metrics.bandwith?.duration)  return false;
        if (!task.global_options.transport && !task.link_metrics.bandwith?.transport)  return false;
        if (!task.global_options.interval && !task.link_metrics.bandwith?.interval)  return false;
    }

    if (task.link_metrics.jitter) {
        if (!task.global_options.mode && !task.link_metrics.jitter?.mode)  return false;
        if (!task.global_options.target && !task.link_metrics.jitter?.target)  return false;
        if (!task.global_options.duration && !task.link_metrics.jitter?.duration)  return false;
        if (!task.global_options.transport && !task.link_metrics.jitter?.transport)  return false;
        if (!task.global_options.interval && !task.link_metrics.jitter?.interval)  return false;
    }

    if (task.link_metrics.packet_loss) {
        if (!task.global_options.mode && !task.link_metrics.packet_loss?.mode)  return false;
        if (!task.global_options.target && !task.link_metrics.packet_loss?.target)  return false;
        if (!task.global_options.duration && !task.link_metrics.packet_loss?.duration)  return false;
        if (!task.global_options.transport && !task.link_metrics.packet_loss?.transport)  return false;
        if (!task.global_options.interval && !task.link_metrics.packet_loss?.interval)  return false;
    }

    if (task.link_metrics.latency) {
        if (!task.global_options.target && !task.link_metrics.latency?.target)  return false;
        if (!task.global_options.counter && !task.link_metrics.latency?.counter)  return false;
        if (!task.global_options.interval && !task.link_metrics.latency?.interval)  return false;
    }

    // // Validate Alert Conditions for Link Metrics
    if (task.alert_conditions) {
        if (task.alert_conditions.jitter && !task.link_metrics.jitter && (!task.global_options.mode || !task.global_options.target || !task.global_options.duration || !task.global_options.transport || !task.global_options.interval))  return false;
        if (task.alert_conditions.packet_loss && !task.link_metrics.packet_loss && (!task.global_options.mode || !task.global_options.target || !task.global_options.duration || !task.global_options.transport || !task.global_options.interval))  return false;
        if (task.alert_conditions.latency && !task.link_metrics.latency && (!task.global_options.target || !task.global_options.counter || !task.global_options.interval))  return false;
    }

    return true;
}

function validateDevice(device: Device): boolean {
    if (!device.ip)  return false;
    if (!device.tasks)  return false;
    if (device.tasks.length == 0)  return false;
    for (const task of device.tasks) {
        if (!task)  return false;
    }

    return true;
}

function validateConfig(config: Config): Validation {
    const logger = getOrCreateGlobalLogger();

    if (Object.entries(config).length == 0) {
        logger.error("Error on empty config.");
        return INVALID;
    }

    // Validate tasks
    for (const [taskId, task] of Object.entries(config.tasks)) {
        if (!taskId || !validateTask(task))  {
            logger.error("Error on task with id: " + taskId);
            return INVALID;
        }
    }

    for (const [deviceId, device] of Object.entries(config.devices)) {
        if (!deviceId || !validateDevice(device)) {
            logger.error("Error on device with id: " + deviceId);
            return INVALID;    
        }
    }

    return VALID;
}

function transformConfig(config: Config): TransformedConfig {
    return {
        ...config,
        tasks: Object.fromEntries(
            Object.entries(config.tasks).map(([taskId, task]) => [
                taskId,
                {
                    ...task,
                    frequency: parseStringInterval(task.frequency),
                    global_options: cleanUndefined({
                        ...task.global_options,
                        duration: task.global_options.duration
                            ? parseStringInterval(task.global_options.duration)
                            : undefined,
                        interval: task.global_options.interval
                            ? parseStringInterval(task.global_options.interval)
                            : undefined,
                    }),
                    link_metrics: task.link_metrics
                        ? {
                            bandwith: task.link_metrics.bandwith
                                ? isEmpty(task.link_metrics.bandwith)
                                    ? {}
                                    : cleanUndefined({
                                        ...task.link_metrics.bandwith,
                                        duration: task.link_metrics.bandwith.duration
                                            ? parseStringInterval(task.link_metrics.bandwith.duration)
                                            : undefined,
                                        interval: task.link_metrics.bandwith.interval
                                            ? parseStringInterval(task.link_metrics.bandwith.interval)
                                            : undefined,
                                    })
                                : {},
                            jitter: task.link_metrics.jitter
                                ? isEmpty(task.link_metrics.jitter)
                                    ? {}
                                    : cleanUndefined({
                                        ...task.link_metrics.jitter,
                                        duration: task.link_metrics.jitter.duration
                                            ? parseStringInterval(task.link_metrics.jitter.duration)
                                            : undefined,
                                        interval: task.link_metrics.jitter.interval
                                            ? parseStringInterval(task.link_metrics.jitter.interval)
                                            : undefined,
                                    })
                                : {},
                            packet_loss: task.link_metrics.packet_loss
                                ? isEmpty(task.link_metrics.packet_loss)
                                    ? {}
                                    : cleanUndefined({
                                        ...task.link_metrics.packet_loss,
                                        duration: task.link_metrics.packet_loss.duration
                                            ? parseStringInterval(task.link_metrics.packet_loss.duration)
                                            : undefined,
                                        interval: task.link_metrics.packet_loss.interval
                                            ? parseStringInterval(task.link_metrics.packet_loss.interval)
                                            : undefined,
                                    })
                                : {},
                            latency: task.link_metrics.latency
                                ? isEmpty(task.link_metrics.latency)
                                    ? {}
                                    : cleanUndefined({
                                        ...task.link_metrics.latency,
                                        interval: task.link_metrics.latency.interval
                                            ? parseStringInterval(task.link_metrics.latency.interval)
                                            : undefined,
                                    })
                                : {},
                        }
                        : {},
                    alert_conditions: cleanUndefined({
                            ...task.alert_conditions,
                            jitter: task.alert_conditions.jitter
                                ? parseStringInterval(task.alert_conditions.jitter)
                                : undefined,
                            latency: task.alert_conditions.latency
                                ? parseStringInterval(task.alert_conditions.latency)
                                : undefined,
                    }),
                },
            ])
        ),
    };
}

function isEmpty(obj: any): boolean {
    return obj && Object.keys(obj).length === 0;
}

function cleanUndefined(obj: any): any {
    return Object.fromEntries(
        Object.entries(obj).filter(([_, value]) => value !== undefined)
    );
}



async function initConfig(file: string) {
    const filePath = path.join(process.cwd(), file);
    const json = await readJsonFile<Config>(filePath);

    const validation = validateConfig(json);
    if (!isValid(validation)) {
        throw new Error("Invalid config.", { cause: validation.error })
    }

    const conf = transformConfig(json);
    globalThis.config = conf;
    
    return config;
}

export type { Config, Task, Device };
export {
    initConfig
};