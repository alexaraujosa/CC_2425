import fs from "fs/promises";
import { getOrCreateGlobalLogger } from "../common/util/logger.js";
import { UDPClient } from "../agent/protocol/udp.js";
import { TCPClient } from "../agent/protocol/tcp.js";
import { NetTask, NetTaskMetric } from "$common/datagram/NetTask.js";
import { AlertFlow } from "$common/datagram/AlertFlow.js";
import { IgnoreValues, SPACKPacked, SPACKTask, SPACKTaskMetric } from "$common/datagram/spack.js";
import { executeIPerfClient, executeIPerfServer, executePing } from "$common/util/command.js";
import { getCpuUsage, getRamUsage } from "$common/util/systemMetrics.js";

//#region ============== Utilities ==============

/**
 * Creates a structured object representing network and device metrics, used for alerts.
 * Note that, the interface stats dictionary is directly included in the spack object without any modification.
 * 
 * @param metric The metric to update
 * @param value The valeu of the metric to set
 * @param interfaceStats A dictionary representing interface statistics
 * @returns SPACK Task Metric object
 */
function createSPACKTaskMetricForAlert(
    metric: string, 
    value: number, 
    interfaceStats: Record<string, number> | undefined
): SPACKTaskMetric {
    const spack = {
        device_metrics: {
            cpu_usage: IgnoreValues.s8,
            ram_usage: IgnoreValues.s8,
            interface_stats: interfaceStats,
            volume: IgnoreValues.s16
        },
        link_metrics: {
            bandwidth: IgnoreValues.s16,   
            jitter: IgnoreValues.s16,      
            packet_loss: IgnoreValues.s16, 
            latency: IgnoreValues.s16
        }
    };

    if (metric !== "interface_stats") {
        if (metric === "cpu_usage") spack.device_metrics.cpu_usage = value;
        if (metric === "ram_usage") spack.device_metrics.ram_usage = value;
        if (metric === "bandwidth") spack.link_metrics.bandwidth = value;
        if (metric === "jitter") spack.link_metrics.jitter = value;
        if (metric === "packet_loss") spack.link_metrics.packet_loss = value;
        if (metric === "latency") spack.link_metrics.latency = value;
    }

    return spack;
}

/**
 * Metrics monitorized during a task execution.
 */
interface MonitorDeviceMetrics {
    avgCpuUsage?: number;
    avgRamUsage?: number;
    interfacePPS?: Record<string, number>;
}

/**
 * Metrics monitorized after running system commands.
 */
interface MonitorLinkMetrics {
    bandwidth?: number;
    latency?: number;
    jitter?: number;
    packet_loss?: number;
}

//#endregion ============== Utilities ==============

/**
 * Monitor system and network metrics, detecting if any conditions exceed predefined thresholds and send alerts via a tcp client.
 * The monitor is wrapped in a Promise, which permits the asynchronous execution.
 * 
 * @param task Task configuration for which metrics and alerts are being monitored and sent, respectively
 * @param duration Total time (in milliseconds) to monitor
 * @param nt NetTask containing connection information
 * @param taskConfigId Config identifier of the task
 * @param schemas Task schemas for processing the metrics containing alerts
 * @param tcp TCP client to send alerts
 * @returns Average metrics 
 */
async function monitorMetrics(
    task: SPACKTask, 
    duration: number, 
    nt: NetTask, 
    taskConfigId: string, 
    schemas: SPACKPacked | { [key: string]: SPACKTask; }, 
    tcp: TCPClient
): Promise<MonitorDeviceMetrics> {
    const logger = getOrCreateGlobalLogger();
    const endTime = Date.now() + duration;
    
    //#region ============== METRICS VARIABLES ==============
    const result: MonitorDeviceMetrics = {};
    const interfaceStats: Record<string, number> = {};
    let cpuUsageSum = 0,
        cpuUsageCounter = 0,
        ramUsageSum = 0,
        ramUsageCounter = 0;
    
    const networkInterfaces = (await fs.readdir("/sys/class/net")).filter(
        (netInterface) => netInterface !== "" && !netInterface.startsWith("lo")
    );
    //#region ============== METRICS VARIABLES ==============

    //#region ============== ALERT FLAGS ==============
    let cpuAlert = false, ramAlert = false;
    const networkInterfacesAlertsControl: Record<string, boolean> = {};
    const networkInterfacesAlertsValue: Record<string, number> = {};
    //#endregion ============== ALERT FLAGS ==============

    for (const netInterface of networkInterfaces) {
        interfaceStats[netInterface] = 0;
        networkInterfacesAlertsControl[netInterface] = false;
        networkInterfacesAlertsValue[netInterface] = IgnoreValues.s8;
    }
    
    while (Date.now() < endTime) {

        if (task.device_metrics.cpu_usage) {
            const cpuUsage = getCpuUsage();
            if (
                typeof task.alert_conditions.cpu_usage === "number" 
                && cpuAlert === false 
                && task.alert_conditions.cpu_usage < cpuUsage
            ) {
                cpuAlert = true;
                logger.warn("CPU Usage exceeded! Value: " + cpuUsage);

                const spack: SPACKTaskMetric = createSPACKTaskMetricForAlert("cpu_usage", cpuUsage, networkInterfacesAlertsValue);
                const alMetric = new AlertFlow(
                    nt.getSessionId(),
                    taskConfigId,
                    (<SPACKTask>schemas[<never>taskConfigId]).getUnpacked(),
                    spack
                );
                tcp.send(alMetric.serialize());

                result.avgCpuUsage = IgnoreValues.s8;
            } else {
                cpuUsageCounter++;
                cpuUsageSum += cpuUsage;
            }
        }

        if (task.device_metrics.ram_usage) {
            const ramUsage = getRamUsage();
            if (
                typeof task.alert_conditions.ram_usage === "number" 
                && ramAlert === false 
                && task.alert_conditions.ram_usage < ramUsage
            ) {
                ramAlert = true;
                logger.warn("RAM Usage exceeded! Value: " + ramUsage);

                const spack: SPACKTaskMetric = createSPACKTaskMetricForAlert("ram_usage", ramUsage, networkInterfacesAlertsValue);
                const alMetric = new AlertFlow(
                    nt.getSessionId(),
                    taskConfigId,
                    (<SPACKTask>schemas[<never>taskConfigId]).getUnpacked(),
                    spack
                );
                tcp.send(alMetric.serialize());

                result.avgRamUsage = IgnoreValues.s8;
            } else {
                ramUsageCounter++;
                ramUsageSum += ramUsage;
            }
        }

        if (task.device_metrics.interface_stats) {
            for (const netInterface of networkInterfaces) {
                try {
                    const prevPackets = parseInt(
                        await fs.readFile(`/sys/class/net/${netInterface}/statistics/rx_packets`, "utf8")
                    );
                    await new Promise((resolve) => setTimeout(resolve, 1000));
                    const currentPackets = parseInt(
                        await fs.readFile(`/sys/class/net/${netInterface}/statistics/rx_packets`, "utf8")
                    );

                    const pps = currentPackets - prevPackets;
                    if (
                        typeof task.alert_conditions.interface_stats === "number" 
                        && networkInterfacesAlertsControl[netInterface] === false 
                        && task.alert_conditions.interface_stats < pps
                    ) {
                        networkInterfacesAlertsControl[netInterface] = true;
                        networkInterfacesAlertsValue[netInterface] = pps;
                        logger.warn("PPS Value exceeded! Value: " + pps);

                        const spack: SPACKTaskMetric = createSPACKTaskMetricForAlert(
                            "interface_stats", 
                            IgnoreValues.s8, 
                            networkInterfacesAlertsValue
                        );
                        const alMetric = new AlertFlow(
                            nt.getSessionId(),
                            taskConfigId,
                            (<SPACKTask>schemas[<never>taskConfigId]).getUnpacked(),
                            spack
                        );
                        tcp.send(alMetric.serialize());

                        networkInterfacesAlertsValue[netInterface] = IgnoreValues.s8;
                    } else {
                        interfaceStats[netInterface] = <number>interfaceStats[netInterface] + pps;
                    }
                } catch (err) {
                    logger.error(`Error reading Packets per Second (PPS) for interface ${netInterface}: ${err}`);
                }
            }
        }

        // Delay one second, if not already
        if (!task.device_metrics.interface_stats) await new Promise((resolve) => setTimeout(resolve, 1000));
    }

    // Only send metrics without alert
    if (task.device_metrics.cpu_usage && !cpuAlert) {
        result.avgCpuUsage = Math.round(cpuUsageSum / Math.max(cpuUsageCounter, 1));
    } else {
        result.avgCpuUsage = IgnoreValues.s8;
    }

    if (task.device_metrics.ram_usage && !ramAlert) {
        result.avgRamUsage = Math.round(ramUsageSum / Math.max(ramUsageCounter, 1));
    } else {
        result.avgRamUsage = IgnoreValues.s8;
    }

    if (task.device_metrics.interface_stats) {
        for (const value of Object.values(networkInterfacesAlertsControl)) {
            if (value) {
                result.interfacePPS = networkInterfacesAlertsValue;
                break;
            }
        }

        if (result.interfacePPS === undefined) {
            result.interfacePPS = interfaceStats;
        }
    } 

    return result;
}

/**
 * Execute various network link performance tests, detecting if any metric exceeds the threshold. 
 * The tests executors are wrapped in a Promise, which permits the asynchronous execution.
 * 
 * @param task Task configuration that contains information relative to the metrics to measure
 * @returns Results of the network link performance tests
 */
async function executeCommand(
    task: SPACKTask
): Promise<MonitorLinkMetrics> {
    const promises: Array<Promise<unknown>> = [];
    const result: MonitorLinkMetrics = {};

    if (task.link_metrics.latency) {
        const { target, counter, interval } = task.link_metrics.latency;
        promises.push(
            executePing(
                <string>target,
                <number>counter,
                <number>interval,
                task.frequency
            ).then( (latency) => {
                result.latency = latency;
            })
        );
    }

    for (const metric of ["bandwidth", "jitter", "packet_loss"] as const) {
        if (task.link_metrics[metric]) {
            const { mode, duration, transport, interval, target } = task.link_metrics[metric];

            if (mode === "server") {
                promises.push(
                    executeIPerfServer(
                        <number>duration, 
                        <string>transport, 
                        <number>interval,
                        metric
                    ).then( (metricResult) => {
                        if (metricResult !== IgnoreValues.s16) {
                            result[metric] = metricResult + 1;
                        }
                    })
                );
            } else if (mode === "client") {
                promises.push(
                    executeIPerfClient(
                        <string>target, 
                        <number>duration, 
                        <string>transport, 
                        <number>interval,
                        metric
                    ).then ( (metricResult) => {
                        if (metricResult !== IgnoreValues.s16) {
                            result[metric] = metricResult + 1;
                        }
                    })
                );
            }
        }
    }
    
    await Promise.allSettled(promises);

    return result;
}

/**
 * 
 * 
 * @param taskConfigId 
 * @param task 
 * @param udp 
 * @param nt 
 * @param schemas 
 */
async function executeTask(
    taskConfigId: string, 
    task: SPACKTask, 
    udp: UDPClient, 
    nt: NetTask, 
    schemas: SPACKPacked | { [key: string]: SPACKTask; }
): Promise<void> {
    const logger = getOrCreateGlobalLogger();
    logger.info(`Starting task '${taskConfigId}' execution. Repeating within ${task.frequency}ms.`);

    async function taskLoop() {
        logger.info(`Running a new task (${taskConfigId}) iteration.`);
        const frequency = task.frequency * 1000;

        // Parallel execution of monitor and executors
        const [deviceMetrics, linkMetrics] = await Promise.all([
            monitorMetrics(task, frequency, nt, taskConfigId, schemas, udp.tcpClient),
            executeCommand(task),
        ]);

        logger.pInfo(`Task '${taskConfigId}' metrics report:`);

        logger.pInfo("====== DEVICE METRICS ======");
        if (
            deviceMetrics.avgCpuUsage 
            && deviceMetrics.avgCpuUsage !== IgnoreValues.s8
        ) logger.pInfo(`Average CPU Usage: ${deviceMetrics.avgCpuUsage}%`);

        if (
            deviceMetrics.avgRamUsage 
            && deviceMetrics.avgRamUsage !== IgnoreValues.s8
        ) logger.pInfo(`Average RAM Usage: ${deviceMetrics.avgRamUsage}%`);

        if (deviceMetrics.interfacePPS && deviceMetrics.interfacePPS) {
            for (const [netInterface, pps] of Object.entries(deviceMetrics.interfacePPS)) {
                if (pps !== IgnoreValues.s8) logger.pInfo(`Total packets in '${netInterface}': ${pps}`);
            }
        }

        const interfaceStats: Record<string, number> | undefined = deviceMetrics.interfacePPS === undefined 
            ? undefined 
            : deviceMetrics.interfacePPS;

        logger.pInfo("====== LINK METRICS ======");

        //#region ============== ALERT TREATMENT ==============
        const interfaceDefaultAlert: Record<string, number> = {};
        if (interfaceStats) {
            for (const key of Object.keys(interfaceStats))
                interfaceDefaultAlert[key] = IgnoreValues.s8;
        }

        if (
            task.alert_conditions.jitter
            && linkMetrics.jitter
            && (linkMetrics.jitter - 1) >= task.alert_conditions.jitter
        ) {
            const spack: SPACKTaskMetric = createSPACKTaskMetricForAlert(
                "jitter", 
                (linkMetrics.jitter - 1) === IgnoreValues.s16 ? IgnoreValues.s16 : linkMetrics.jitter, 
                interfaceDefaultAlert
            );
            const alMetric = new AlertFlow(
                nt.getSessionId(),
                taskConfigId,
                (<SPACKTask>schemas[<never>taskConfigId]).getUnpacked(),
                spack
            );
            udp.tcpClient.send(alMetric.serialize());
            linkMetrics.jitter = IgnoreValues.s16;
        }

        if (
            task.alert_conditions.latency
            && linkMetrics.latency
            && (linkMetrics.latency - 1) >= task.alert_conditions.latency
        ) {

            const spack: SPACKTaskMetric = createSPACKTaskMetricForAlert(
                "latency", 
                linkMetrics.latency === IgnoreValues.s16 ? 10000 : linkMetrics.latency, // 10000 means Target Unreachable
                interfaceDefaultAlert
            );
            const alMetric = new AlertFlow(
                nt.getSessionId(),
                taskConfigId,
                (<SPACKTask>schemas[<never>taskConfigId]).getUnpacked(),
                spack
            );

            udp.tcpClient.send(alMetric.serialize());
            linkMetrics.latency = IgnoreValues.s16;
        }

        if (
            task.alert_conditions.packet_loss
            && linkMetrics.packet_loss
            && (linkMetrics.packet_loss - 1) >= task.alert_conditions.packet_loss
        ) {
            const spack: SPACKTaskMetric = createSPACKTaskMetricForAlert(
                "packet_loss", 
                linkMetrics.packet_loss === IgnoreValues.s16 ? 100 : linkMetrics.packet_loss, // 100 means Target Unreachable
                interfaceDefaultAlert
            );
            const alMetric = new AlertFlow(
                nt.getSessionId(),
                taskConfigId,
                (<SPACKTask>schemas[<never>taskConfigId]).getUnpacked(),
                spack
            );
            udp.tcpClient.send(alMetric.serialize());
            linkMetrics.packet_loss = IgnoreValues.s16;
        }
        //#endregion ============== ALERT TREATMENT ==============

        if (linkMetrics.bandwidth && linkMetrics.bandwidth !== IgnoreValues.s16) logger.pInfo(`Bandwidth: ${linkMetrics.bandwidth - 1} Mbps`);
        if (linkMetrics.jitter && linkMetrics.jitter !== IgnoreValues.s16) logger.pInfo(`Jitter: ${linkMetrics.jitter - 1} ms`);
        if (linkMetrics.latency && linkMetrics.latency !== IgnoreValues.s16) logger.pInfo(`Latency: ${linkMetrics.latency - 1} ms`);
        if (linkMetrics.packet_loss && linkMetrics.packet_loss !== IgnoreValues.s16) logger.pInfo(`Packet Loss: ${linkMetrics.packet_loss - 1}%`);

        // Send metrics
        const fwControl = udp.flowControl;
        const ntMetric = new NetTaskMetric(
            nt.getSessionId(),
            fwControl.getLastSeq(),
            fwControl.getLastAck(),
            0,
            false,
            0,
            {
                device_metrics: {
                    cpu_usage: deviceMetrics.avgCpuUsage,
                    ram_usage: deviceMetrics.avgRamUsage,
                    interface_stats: interfaceStats
                },
                link_metrics: {
                    bandwidth: linkMetrics.bandwidth,
                    jitter: linkMetrics.jitter,
                    packet_loss: linkMetrics.packet_loss,
                    latency: linkMetrics.latency
                }
            },
            taskConfigId,
            (<SPACKTask>schemas[<never>taskConfigId]).getUnpacked()
        ).link(udp.ecdhe);

        // logger.info(ntMetric);
        udp.send(ntMetric);

        logger.pInfo(`End of task '${taskConfigId}' execution.\n`);

        // Schedule next execution
        await taskLoop();
    }

    await taskLoop();
}

export { executeTask };