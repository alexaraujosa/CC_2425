/**
 * Entry point for the SERVER Solution.
 * 
 * @copyright Copyright (c) 2024 DarkenLM https://github.com/DarkenLM
 */

// import path from "path";
import { cac } from "cac";
import isBinMode from "$common/util/isBinMode.js";
// import { readJsonFile } from "$common/util/paths.js";
import { initConfig } from "./config.js";
import { getOrCreateGlobalLogger } from "$common/util/logger.js";
import { DatabaseDAO } from "$common/db/databaseDAO.js";
// import { createDevice } from "$common/db/interfaces/IDevice.js";
import { createAlertConditions, createLinkMetrics, createOptions, createTask, IOptions, IPERF_MODE, IPERF_TRANSPORT, taskToString } from "$common/db/interfaces/ITask.js";
// import { dbTester } from "../db/dbTester.js";
// DatabaseDAO;createDevice;createTask;
import { UDPServer } from "./protocol/udp.js";
import { TCPServer } from "./protocol/tcp.js";
import { ConnectionTarget } from "$common/protocol/connection.js";
// import { initWebServer } from "./web/index.js";

//#region ============== Types ==============
interface CLIOptions {
    debug: boolean,
    host: string,
    port: number
}
//#endregion ============== Types ==============

//#region ============== Constants ==============
const NAME = "agent";
const VERSION = "1.0.0";
const DEFAULT_HOST = "127.0.0.1";
const DEFAULT_PORT = 2022;
//#endregion ============== Constants ==============

/**
 * Entry point for SERVER solution.
 */
export async function serverInit(options: CLIOptions) {
    const logger = getOrCreateGlobalLogger();
    logger.info("Hello world from SERVER.");

    const host = options.host;
    const port = options.port;

    // Config loader
    const json = await initConfig("docs/assets/config.json");
    // const json = await initConfig("tmp/config.json");
    logger.info(json);

    const db = new DatabaseDAO();
    const dbMapper = new Map<string, number>();

    for (const [taskConfigId, task] of Object.entries(config.tasks)) {
        const device_metrics: string[] = [];
        if (task.device_metrics.cpu_usage)  device_metrics.push("cpu");
        if (task.device_metrics.interface_stats)  device_metrics.push("interface_stats");
        if (task.device_metrics.ram_usage)  device_metrics.push("memory");
        if (task.device_metrics.volume)  device_metrics.push("volume");

        const link_metrics: string[] = [];
        const options: IOptions[] = [];
        if (task.link_metrics.bandwidth)  {
            link_metrics.push("bandwidth");
            options.push(
                createOptions(
                    task.link_metrics.bandwidth.mode ? ((task.link_metrics.bandwidth?.mode === "client") ? IPERF_MODE.CLIENT : IPERF_MODE.SERVER) : undefined,
                    task.link_metrics.bandwidth?.target,
                    task.link_metrics.bandwidth?.duration,
                    task.link_metrics.bandwidth.transport ? ((task.link_metrics.bandwidth?.transport === "tcp") ? IPERF_TRANSPORT.TPC : IPERF_TRANSPORT.UDP) : undefined,
                    task.link_metrics.bandwidth?.interval,
                    undefined
                )
            );
        }
        if (task.link_metrics.jitter)  {
            link_metrics.push("jitter");
            options.push(
                createOptions(
                    task.link_metrics.jitter.mode ? ((task.link_metrics.jitter?.mode === "client") ? IPERF_MODE.CLIENT : IPERF_MODE.SERVER) : undefined,
                    task.link_metrics.jitter?.target,
                    task.link_metrics.jitter?.duration,
                    task.link_metrics.jitter.transport ? ((task.link_metrics.jitter?.transport === "tcp") ? IPERF_TRANSPORT.TPC : IPERF_TRANSPORT.UDP) : undefined,
                    task.link_metrics.jitter?.interval,
                    undefined
                )
            );
        }
        if (task.link_metrics.latency)  {
            link_metrics.push("latency");
            options.push(
                createOptions(
                    undefined,
                    task.link_metrics.latency?.target,
                    undefined,
                    undefined,
                    task.link_metrics.latency?.interval,
                    task.link_metrics.latency.counter
                )
            );
        }
        if (task.link_metrics.packet_loss)  {
            link_metrics.push("packet_loss");
            options.push(
                createOptions(
                    task.link_metrics.packet_loss.mode ? ((task.link_metrics.packet_loss?.mode === "client") ? IPERF_MODE.CLIENT : IPERF_MODE.SERVER) : undefined,
                    task.link_metrics.packet_loss?.target,
                    task.link_metrics.packet_loss?.duration,
                    task.link_metrics.packet_loss.transport ? ((task.link_metrics.packet_loss?.transport === "tcp") ? IPERF_TRANSPORT.TPC : IPERF_TRANSPORT.UDP) : undefined,
                    task.link_metrics.packet_loss?.interval,
                    undefined
                )
            );
        }


        const newTask = createTask(
            task.frequency,
            device_metrics,
            createOptions(
                task.global_options.mode ? ((task.global_options.mode === "client") ? IPERF_MODE.CLIENT : IPERF_MODE.SERVER) : undefined,
                task.global_options.target,
                task.global_options.duration,
                task.global_options.transport ? ((task.global_options.transport === "tcp") ? IPERF_TRANSPORT.TPC : IPERF_TRANSPORT.UDP) : undefined,
                task.global_options.interval,
                task.global_options.counter
            ),
            createLinkMetrics(
                link_metrics,
                options
            ),
            createAlertConditions(
                task.alert_conditions.cpu_usage,
                task.alert_conditions.ram_usage,
                task.alert_conditions.interface_stats,
                task.alert_conditions.packet_loss,
                task.alert_conditions.jitter
            )
        );

        const taskDatabaseId = await db.storeTask(newTask);
        dbMapper.set(taskConfigId, taskDatabaseId);
        logger.info("New task created with id: " + taskDatabaseId);

        const taskByID = await db.getTaskByID(taskDatabaseId);
        if(taskByID)    logger.info("Retrieved Task by ID:", taskToString(taskByID));
    }


    // await dbTester();

    // Server setup
    const tcpCT = new ConnectionTarget(host, port);
    logger.info("TCP Target:", tcpCT.qualifiedName);
    const tcpServer = new TCPServer(dbMapper, db);
    tcpServer.listen(tcpCT);

    const udpServer = new UDPServer(db, dbMapper);
    udpServer.listen(port + 1);

    // initWebServer(options);
}

//#region ============== CLI ==============
const cli = cac(NAME).version(VERSION);
cli.help();
cli.option("--debug, -d", "Enable debug mode");
cli.option("--host [host]", "The IP address of the host to connect to.", { type: <never>String, default: DEFAULT_HOST });
cli.option("--port [port]", "The port to the host to connect to.", { type: <never>Number, default: DEFAULT_PORT });

async function cliHandler() {
    const { options } = cli.parse();
    if (options.help || options.version) return; // Do not execute script if help message was requested.
    
    getOrCreateGlobalLogger({ printCallerFile: options.debug, debug: options.debug });

    await serverInit(<CLIOptions>options);
    return;
}
if (isBinMode(import.meta.url)) {
    cliHandler();
}
//#endregion ============== CLI ==============

export {
    type CLIOptions
};