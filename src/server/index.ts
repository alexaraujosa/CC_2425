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
import { DatabaseDAO } from "../db/databaseDAO.js";
import { createDevice } from "../db/interfaces/IDevice.js";
import { createTask } from "../db/interfaces/ITask.js";
import { dbTester } from "../db/dbTester.js";
DatabaseDAO;createDevice;createTask;
import { TestUDPServer } from "./protocol/udp.js";
import { TCPServer } from "./protocol/tcp.js";
import { ConnectionTarget } from "$common/protocol/connection.js";

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
    // const json = await readJsonFile<Config>(path.join(process.cwd(), "/docs/assets/config.json"));
    const json = await initConfig("docs/assets/config.json");

    // json.tasks.forEach(task => {    // TODO: Colocar como assincrono, sendo melhor usar um ciclo for
    //     task.devices.forEach(device => {
    //         device.device_id;

    //         // TODO: Através do device_id, obtenho  na base de dados o seu ip.
    //         // TODO: Crio o datagrama NetTask.
    //         // TODO: Invoco o metodo udpServer.send(nt, ip+port). O ip+port vou buscar a base de dados atraves do device_id
    //     })
    // });

    logger.info(json);

    
    await dbTester();

    // Server setup
    const tcpCT = new ConnectionTarget(host, port);
    logger.info("TCP Target:", tcpCT.qualifiedName);
    const tcpServer = new TCPServer();
    tcpServer.listen(tcpCT);

    const udpServer = new TestUDPServer();
    udpServer.listen(port + 1);
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