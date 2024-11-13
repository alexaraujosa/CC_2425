/**
 * Entry point for the AGENT Solution.
 * 
 * @copyright Copyright (c) 2024 DarkenLM https://github.com/DarkenLM
 */

// import net from "net";
import { cac } from "cac";
import isBinMode from "$common/util/isBinMode.js";
import { getOrCreateGlobalLogger } from "$common/util/logger.js";
import { UDPClient } from "./protocol/udp.js";
import { ConnectionTarget } from "$common/protocol/connection.js";
import { TCPClient } from "./protocol/tcp.js";
import { AlertFlow, AlertFlowDatagramType } from "$common/datagrams/AlertFlow.js";
// import { NetTask, NetTaskDatagramType, NetTaskRegister } from "$common/datagrams/NetTask.js";

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
 * Entry point for AGENT solution.
 */
export async function agentInit(options: CLIOptions) {
    const logger = getOrCreateGlobalLogger();
    logger.log("Hello world from AGENT.");

    const host = options.host;
    const port = options.port;

    const tcpClient = new TCPClient();
    await tcpClient.connect(new ConnectionTarget(host, port));
    tcpClient.send(Buffer.from("Hello from TCP Client."));

    let al = new AlertFlow(1, AlertFlowDatagramType.REQUEST_ALERT, 5);
    let al2 = new AlertFlow(2, AlertFlowDatagramType.REQUEST_ALERT, 10);             

    tcpClient.send(al.makeAlertFlowDatagram());
    tcpClient.send(al2.makeAlertFlowDatagram());

    const udpClient = new UDPClient();
    udpClient.connect(new ConnectionTarget(host, port + 1));

    // udpClient.send(Buffer.from("Hello from UDP Client."));

    // let nt = new NetTask(1, 0, 0, 1, 5);
    // let nt2 = new NetTask(2, 0, 0, 1, 10);

    // udpClient.send(nt.makeNetTaskDatagram());
    // udpClient.send(nt2.makeNetTaskDatagram());

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

    await agentInit(options as CLIOptions);
    return;
}
if (isBinMode(import.meta.url)) {
    cliHandler();
}
//#endregion ============== CLI ==============