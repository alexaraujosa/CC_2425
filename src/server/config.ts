/* eslint-disable @typescript-eslint/no-empty-object-type */
import path from "path";
import { readJsonFile } from "$common/util/paths.js";
import { isInvalid, isValid, makeInvalid, VALID, Validation } from "$common/util/validation.js";
import { getOrCreateGlobalLogger } from "$common/util/logger.js";
import { parseStringInterval } from "$common/util/date.js";
import { GenericObject } from "$common/util/object.js";

//#region ============== Types ==============
declare global {
    // eslint-disable-next-line no-var
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
    bandwidth?: Bandwidth,
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

interface Bandwidth extends IperfMetrics {}
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

interface RawTask {
    frequency: string,
    device_metrics: DeviceMetrics,
    global_options: GlobalOptions,
    link_metrics: LinkMetrics,
    alert_conditions: AlertConditions
}

interface RawConfig {
    tasks: Record<string, RawTask>,
    devices: Record<string, Device>
}

type Task = Omit<RawTask, "frequency" | "global_options" | "link_metrics" | "alert_conditions"> & {
    frequency: number;
    global_options: Omit<GlobalOptions, "duration" | "interval"> & {
        duration?: number;
        interval?: number;
    };
    link_metrics: {
        bandwidth?: Omit<Bandwidth, "duration" | "interval"> & { duration?: number, interval?: number };
        jitter?: Omit<Jitter, "duration" | "interval"> & { duration?: number, interval?: number };
        packet_loss?: Omit<Packet_loss, "duration" | "interval"> & { duration?: number, interval?: number };
        latency?: Omit<Latency, "interval"> & { interval?: number };
    };
    alert_conditions: Omit<AlertConditions, "jitter" | "latency"> & {
        jitter?: number;
        latency?: number;
    };
};

type Config = Omit<RawConfig, "tasks"> & {
    tasks: Record<string, Task>
}

//#endregion ============== Types ==============

//#region ============== Constants ==============
const TASK_KEYS = ["frequency", "device_metrics", "global_options", "link_metrics", "alert_conditions"];
const LINK_METRICS_KEYS = ["bandwidth", "jitter", "packet_loss", "latency"];
const IPERF_LINK_METRIC_KEYS = ["mode", "target", "duration", "transport", "interval"];
const LATENCY_LINK_METRIC_KEYS = ["target", "counter", "interval"];
const ALERT_CONDITIONS_KEYS = ["cpu_usage", "ram_usage", "interface_stats", "packet_loss", "jitter", "latency"];
const DEVICE_METRICS_KEYS = ["cpu_usage", "interface_stats", "ram_usage", "volume"];
const DEVICE_KEYS = ["ip", "tasks"];
//#endregion ============== Constants ==============

function validateTask(taskName: string, task: RawTask, _config: RawConfig): Validation<never> {
    const logger = getOrCreateGlobalLogger();

    // Validate nil components
    if (!task.frequency) return makeInvalid(new Error(`Task ${taskName} has missing property 'frequency'.`));
    const taskFrequency = parseStringInterval(task.frequency);

    if (!task.device_metrics && !task.link_metrics && !task.global_options) 
        return makeInvalid(new Error(`Task ${taskName} has no metrics defined.`));

    // Validate Device Metrics
    // if (
    //     !task.device_metrics.cpu_usage 
    //     && !task.device_metrics.interface_stats 
    //     && !task.device_metrics.ram_usage 
    //     && !task.device_metrics.volume
    // ) return makeInvalid(new Error(`Task ${taskName} has no device metrics defined.`));
    if (
        Object.entries(task.device_metrics).filter(([_, v]) => !!v).length === 0
        && Object.entries(task.link_metrics).filter(([_, v]) => !!v).length === 0
    ) return makeInvalid(new Error(`Task ${taskName} has no metrics defined.`));

    // Validate Alert Conditions for Device Metrics
    // if (!task.device_metrics.cpu_usage && task.alert_conditions.cpu_usage) return false;
    // if (!task.device_metrics.interface_stats && task.alert_conditions.interface_stats) return false;
    // if (!task.device_metrics.ram_usage && task.alert_conditions.ram_usage) return false;
    for (const metric of ["cpu_usage", "interface_stats", "ram_usage"] as const) {
        if (!task.device_metrics[metric] && task.alert_conditions[metric])
            return makeInvalid(new Error(`Task ${taskName} has alert condition for undefined device metric '${metric}'.`));
    }
        
    // Emit warnings for additional unknown properties, but ignore them.
    for (const key of Object.keys(task.device_metrics).filter((k) => !DEVICE_METRICS_KEYS.includes(k))) {
        logger.warn(`Task ${taskName} has unknown property '${key}' on device_metrics.`);
    }

    // Validate Metrics components
    let udpIPerfServers = 0;
    if (task.link_metrics.bandwidth) {
        // if (!task.global_options.mode && !task.link_metrics.bandwidth?.mode)  return false;
        // if (!task.global_options.target && !task.link_metrics.bandwidth?.target)  return false;
        // if (!task.global_options.duration && !task.link_metrics.bandwidth?.duration)  return false;
        // if (!task.global_options.transport && !task.link_metrics.bandwidth?.transport)  return false;
        // if (!task.global_options.interval && !task.link_metrics.bandwidth?.interval)  return false;

        for (const metric of ["mode", "target", "duration", "transport", "interval"] as const) {
            if (!task.global_options[metric] && !task.link_metrics.bandwidth[metric])
                return makeInvalid(new Error(`Task ${taskName} has link metric with non-overridden undefined option: '${metric}'.`));
        }

        // Verify IPerf UDP Server quantity
        if (
            (task.link_metrics.bandwidth.mode === "server" || (!task.link_metrics.bandwidth.mode && task.global_options.mode === "server"))
            && (task.link_metrics.bandwidth.transport === "udp" || (!task.link_metrics.bandwidth.transport && task.global_options.transport === "udp"))
        ) udpIPerfServers++;

        // Verify bandwidth duration
        const bandwidthDuration = typeof task.link_metrics.bandwidth.duration === "undefined" 
            ? parseStringInterval(<string>task.global_options.duration) 
            : parseStringInterval(<string>task.link_metrics.bandwidth.duration);

        if (bandwidthDuration >= taskFrequency) 
            return makeInvalid(new Error(`Task ${taskName} has bandwidth duration greater or equal to the task frequency.`));

        // Emit warning for a shorter interval, but ignore it.
        const bandwidthInterval = typeof task.link_metrics.bandwidth.interval === "undefined" 
            ? parseStringInterval(<string>task.global_options.interval) 
            : parseStringInterval(<string>task.link_metrics.bandwidth.interval);

        if (bandwidthInterval > bandwidthDuration)
            logger.warn(`Task ${taskName} bandwidth interval is greater than the duration.`);

        // Emit warnings for additional unknown properties, but ignore them.
        for (const key of Object.keys(task.link_metrics.bandwidth).filter((k) => !IPERF_LINK_METRIC_KEYS.includes(k))) {
            logger.warn(`Task ${taskName} has unknown property '${key}' on link_metrics.bandwidth.`);
        }
    }

    if (task.link_metrics.jitter) {
        // if (!task.global_options.mode && !task.link_metrics.jitter?.mode)  return false;
        // if (!task.global_options.target && !task.link_metrics.jitter?.target)  return false;
        // if (!task.global_options.duration && !task.link_metrics.jitter?.duration)  return false;
        // if (!task.global_options.transport && !task.link_metrics.jitter?.transport)  return false;
        // if (!task.global_options.interval && !task.link_metrics.jitter?.interval)  return false;

        for (const metric of ["mode", "target", "duration", "transport", "interval"] as const) {
            if (!task.global_options[metric] && !task.link_metrics.jitter[metric])
                return makeInvalid(new Error(`Task ${taskName} has link metric with non-overridden undefined option '${metric}'.`));
        }

        // Verify transport for iperf server
        if (
            (task.link_metrics.jitter && task.link_metrics.jitter.transport === "tcp") 
            || (task.link_metrics.jitter && !task.link_metrics.jitter.transport 
                && task.global_options.transport && task.global_options.transport === "tcp")
        ) {
            return makeInvalid(new Error(`Task ${taskName} has iperf transport has TCP, but wants to read jitter.`));
        } 

        // Verify IPerf UDP Server quantity
        if (task.link_metrics.jitter.mode === "server" || (!task.link_metrics.jitter.mode && task.global_options.mode === "server"))
            udpIPerfServers++;

        // Verify jitter duration
        const jitterDuration = typeof task.link_metrics.jitter.duration === "undefined" 
            ? parseStringInterval(<string>task.global_options.duration) 
            : parseStringInterval(<string>task.link_metrics.jitter.duration);

        if (jitterDuration >= taskFrequency) 
            return makeInvalid(new Error(`Task ${taskName} has jitter duration greater or equal to the task frequency.`));

        // Emit warning for a shorter interval, but ignore it.
        const jitterInterval = typeof task.link_metrics.jitter.interval === "undefined" 
            ? parseStringInterval(<string>task.global_options.interval) 
            : parseStringInterval(<string>task.link_metrics.jitter.interval);

        if (jitterInterval > jitterDuration)
            logger.warn(`Task ${taskName} jitter interval is greater than the duration.`);

        // Emit warnings for additional unknown properties, but ignore them.
        for (const key of Object.keys(task.link_metrics.jitter).filter((k) => !IPERF_LINK_METRIC_KEYS.includes(k))) {
            logger.warn(`Task ${taskName} has unknown property '${key}' on link_metrics.jitter.`);
        }
    }

    if (task.link_metrics.packet_loss) {
        // if (!task.global_options.mode && !task.link_metrics.packet_loss?.mode)  return false;
        // if (!task.global_options.target && !task.link_metrics.packet_loss?.target)  return false;
        // if (!task.global_options.duration && !task.link_metrics.packet_loss?.duration)  return false;
        // if (!task.global_options.transport && !task.link_metrics.packet_loss?.transport)  return false;
        // if (!task.global_options.interval && !task.link_metrics.packet_loss?.interval)  return false;

        for (const metric of ["mode", "target", "duration", "transport", "interval"] as const) {
            if (!task.global_options[metric] && !task.link_metrics.packet_loss[metric])
                return makeInvalid(new Error(`Task ${taskName} has link metric with non-overridden undefined option '${metric}'.`));
        }

        // Verify transport for iperf server
        if (
            (task.link_metrics.packet_loss && task.link_metrics.packet_loss.transport === "tcp") 
            || (task.link_metrics.packet_loss && !task.link_metrics.packet_loss.transport 
                && task.global_options.transport && task.global_options.transport === "tcp")
        ) {
            return makeInvalid(new Error(`Task ${taskName} has iperf transport has TCP, but wants to read packet loss.`));
        }

        // Verify IPerf UDP Server quantity
        if (task.link_metrics.packet_loss.mode === "server" || (!task.link_metrics.packet_loss.mode && task.global_options.mode === "server"))
            udpIPerfServers++;

        // Verify packet loss duration
        const packetLossDuration = typeof task.link_metrics.packet_loss.duration === "undefined" 
            ? parseStringInterval(<string>task.global_options.duration) 
            : parseStringInterval(<string>task.link_metrics.packet_loss.duration);

        if (packetLossDuration >= taskFrequency) 
            return makeInvalid(new Error(`Task ${taskName} has packet loss duration greater or equal to the task frequency.`));

        // Emit warning for a shorter interval, but ignore it.
        const packetLossInterval = typeof task.link_metrics.packet_loss === "undefined" 
            ? parseStringInterval(<string>task.global_options.interval) 
            : parseStringInterval(<string>task.link_metrics.packet_loss);

        if (packetLossInterval > packetLossDuration)
            logger.warn(`Task ${taskName} packet loss interval is greater than the duration.`);

        
        // Emit warnings for additional unknown properties, but ignore them.
        for (const key of Object.keys(task.link_metrics.packet_loss).filter((k) => !IPERF_LINK_METRIC_KEYS.includes(k))) {
            logger.warn(`Task ${taskName} has unknown property '${key}' on link_metrics.packet_loss.`);
        }
    }

    if (task.link_metrics.latency) {
        // if (!task.global_options.target && !task.link_metrics.latency?.target)  return false;
        // if (!task.global_options.counter && !task.link_metrics.latency?.counter)  return false;
        // if (!task.global_options.interval && !task.link_metrics.latency?.interval)  return false;

        for (const metric of ["target", "counter", "interval"] as const) {
            if (!task.global_options[metric] && !task.link_metrics.latency[metric])
                return makeInvalid(new Error(`Task ${taskName} has link metric with non-overridden undefined option '${metric}'.`));
        }
        
        // Verify latency execution time
        const latencyInterval = typeof task.link_metrics.latency.interval === "undefined" 
            ? parseStringInterval(<string>task.global_options.interval) 
            : parseStringInterval(<string>task.link_metrics.latency.interval); 
        const latencyCounter = typeof task.link_metrics.latency.counter === "undefined" 
            ? task.global_options.counter : task.link_metrics.latency.counter;

        if ((latencyInterval * <number>latencyCounter) >= taskFrequency)
            return makeInvalid(new Error(`Task ${taskName} has a latency execution time greater or equal to the task frequency.`));

        // Emit warnings for additional unknown properties, but ignore them.
        for (const key of Object.keys(task.link_metrics.latency).filter((k) => !LATENCY_LINK_METRIC_KEYS.includes(k))) {
            logger.warn(`Task ${taskName} has unknown property '${key}' on link_metrics.latency.`);
        }
    }

    // Verify IPerf UDP Server quantity
    if (udpIPerfServers > 1) return makeInvalid(new Error(`Task ${taskName} has more than 1 UDP IPerf Server. Current value: ${udpIPerfServers}`));

    // Emit warnings for additional unknown properties, but ignore them.
    for (const key of Object.keys(task.link_metrics).filter((k) => !LINK_METRICS_KEYS.includes(k))) {
        logger.warn(`Task ${taskName} has unknown property '${key}' on link_metrics.`);
    }

    // Validate Alert Conditions for Link Metrics
    if (task.alert_conditions) {
        if (task.alert_conditions.jitter && !task.link_metrics.jitter) 
            return makeInvalid(new Error(`Task ${taskName} has alert condition for undefined link metric 'jitter'.`));

        if (task.alert_conditions.packet_loss && !task.link_metrics.packet_loss) 
            return makeInvalid(new Error(`Task ${taskName} has alert condition for undefined link metric 'packet_loss'.`));

        if (task.alert_conditions.latency && !task.link_metrics.latency) 
            return makeInvalid(new Error(`Task ${taskName} has alert condition for undefined link metric 'latency'.`));

        // Emit warnings for additional unknown properties, but ignore them.
        for (const key of Object.keys(task.alert_conditions).filter((k) => !ALERT_CONDITIONS_KEYS.includes(k))) {
            logger.warn(`Task ${taskName} has unknown property '${key}' on alert_conditions.`);
        }

        if (task.alert_conditions.latency && parseStringInterval(task.alert_conditions.latency) === 0)
            return makeInvalid(new Error(`Task ${taskName} has latency alert condition with an unvalid format. Should have unit (ms)`));

        if (task.alert_conditions.jitter && parseStringInterval(task.alert_conditions.jitter) === 0)
            return makeInvalid(new Error(`Task ${taskName} has jitter alert condition with an unvalid format. Should have unit (ms)`));
    }

    // Emit warnings for additional unknown properties, but ignore them.
    for (const key of Object.keys(task).filter((k) => !TASK_KEYS.includes(k))) {
        logger.warn(`Task ${taskName} has unknown property '${key}'.`);
    }

    return VALID;
}

function validateDevice(deviceName: string, device: Device, config: RawConfig): Validation<never> {
    const logger = getOrCreateGlobalLogger();

    if (!device.ip) return makeInvalid(new Error(`Device ${deviceName} has missing property 'ip'.`));
    if (!device.tasks) return makeInvalid(new Error(`Device ${deviceName} has missing property 'tasks'.`));
    if (device.tasks.length == 0) return makeInvalid(new Error(`Device ${deviceName} has empty task list.`));
    
    // Emit warnings for additional unknown properties, but ignore them.
    for (const key of Object.keys(device).filter((k) => !DEVICE_KEYS.includes(k))) {
        logger.warn(`Device ${deviceName} has unknown property '${key}'.`);
    }

    if (!device.ip.match(/^\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}$/))
        return makeInvalid(new Error(`Device ${deviceName} has invalid ip.`));
    
    // TODO: Ensure task in config.
    for (const task of device.tasks) {
        if (!(task in config.tasks)) return makeInvalid(new Error(`Device ${deviceName} has unknown task: '${task}'.`));
    }

    return VALID;
}

function validateConfig(config: RawConfig): Validation<never> {
    if (Object.entries(config).length == 0) {
        // logger.error("Error on empty config.");
        // return INVALID;
        return makeInvalid(new Error("Empty config."));
    }

    // Validate tasks
    for (const [taskId, task] of Object.entries(config.tasks)) {
        // if (!taskId || !validateTask(task))  {
        //     logger.error("Error on task with id: " + taskId);
        //     return INVALID;
        // }

        const val = validateTask(taskId, task, config);
        if (isInvalid(val)) return val;
    }

    for (const [deviceId, device] of Object.entries(config.devices)) {
        // if (!deviceId || !validateDevice(device)) {
        //     logger.error("Error on device with id: " + deviceId);
        //     return INVALID;    
        // }
        
        const val = validateDevice(deviceId, device, config);
        if (isInvalid(val)) return val;
    }

    return VALID;
}

function transformConfig(config: RawConfig): Config {
    return {
        ...config,
        tasks: Object.fromEntries(
            Object.entries(config.tasks).map(([taskId, task]) => [
                taskId,
                {
                    ...task,
                    frequency: parseStringInterval(task.frequency) / 1000,
                    global_options: cleanUndefined({
                        ...task.global_options,
                        duration: task.global_options.duration
                            ? parseStringInterval(task.global_options.duration) / 1000
                            : undefined,
                        interval: task.global_options.interval
                            ? parseStringInterval(task.global_options.interval) / 1000
                            : undefined,
                    }),
                    link_metrics: task.link_metrics
                        ? cleanUndefined({
                            bandwidth: task.link_metrics.bandwidth
                                ? isEmpty(task.link_metrics.bandwidth)
                                    ? {}
                                    : cleanUndefined({
                                        ...task.link_metrics.bandwidth,
                                        duration: task.link_metrics.bandwidth.duration
                                            ? parseStringInterval(task.link_metrics.bandwidth.duration) / 1000
                                            : undefined,
                                        interval: task.link_metrics.bandwidth.interval
                                            ? parseStringInterval(task.link_metrics.bandwidth.interval) / 1000
                                            : undefined,
                                    })
                                : undefined,
                            jitter: task.link_metrics.jitter
                                ? isEmpty(task.link_metrics.jitter)
                                    ? {}
                                    : cleanUndefined({
                                        ...task.link_metrics.jitter,
                                        duration: task.link_metrics.jitter.duration
                                            ? parseStringInterval(task.link_metrics.jitter.duration) / 1000
                                            : undefined,
                                        interval: task.link_metrics.jitter.interval
                                            ? parseStringInterval(task.link_metrics.jitter.interval) / 1000
                                            : undefined,
                                    })
                                : undefined,
                            packet_loss: task.link_metrics.packet_loss
                                ? isEmpty(task.link_metrics.packet_loss)
                                    ? {}
                                    : cleanUndefined({
                                        ...task.link_metrics.packet_loss,
                                        duration: task.link_metrics.packet_loss.duration
                                            ? parseStringInterval(task.link_metrics.packet_loss.duration) / 1000
                                            : undefined,
                                        interval: task.link_metrics.packet_loss.interval
                                            ? parseStringInterval(task.link_metrics.packet_loss.interval) / 1000
                                            : undefined,
                                    })
                                : undefined,
                            latency: task.link_metrics.latency
                                ? isEmpty(task.link_metrics.latency)
                                    ? {}
                                    : cleanUndefined({
                                        ...task.link_metrics.latency,
                                        interval: task.link_metrics.latency.interval
                                            ? parseStringInterval(task.link_metrics.latency.interval)
                                            : undefined,
                                    })
                                : undefined,
                        })
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

function isEmpty(obj: unknown): boolean {
    return (typeof obj === "object" && obj !== null) && Object.keys(obj).length === 0;
}

function cleanUndefined<T extends GenericObject>(obj: T): { [P in keyof T]-?: T[P]; } {
    return <{ [P in keyof T]-?: T[P]; }>Object.fromEntries(
        Object.entries(obj).filter(([_, value]) => value !== undefined)
    );
}

async function initConfig(file: string) {
    const filePath = path.join(process.cwd(), file);
    const json = await readJsonFile<RawConfig>(filePath);

    const validation = validateConfig(json);
    if (!isValid(validation)) {
        throw new Error("Invalid config.", { cause: validation.error });
    }

    const conf = transformConfig(json);
    globalThis.config = conf;
    
    return config;
}

// export type { RawConfig as Config, RawTask as Task, Task as TransformedTask, Device };
export type { Config, RawTask, Task, Device};
export {
    initConfig
};