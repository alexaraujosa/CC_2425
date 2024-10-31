/**
 * Entry point for the SERVER Solution.
 * 
 * Copyright (c) 2024 DarkenLM https://github.com/DarkenLM
 */

import path from "path";
// import net  from "net";
import { cac } from "cac";
import isBinMode from "$common/util/isBinMode.js";
import { readJsonFile } from "$common/util/paths.js";
import { Config } from "./config.js";
import { getOrCreateGlobalLogger } from "$common/util/logger.js";
import { TestUDPServer } from "./protocol/udp.js";
import { TCPServer } from "./protocol/tcp.js";
import { ConnectionTarget } from "$common/protocol/connection.js";

//#region ============== Types ==============
interface CLIOptions {
    debug: boolean,
    host: string,
    port: number
}
//#endregion

//#region ============== Constants ==============
const NAME = "agent";
const VERSION = "1.0.0";
const DEFAULT_HOST = "127.0.0.1";
const DEFAULT_PORT = 2022;
//#endregion

/**
 * Example server function with documentaton.
 * 
 * *Also* ~~Supports~~ **Markdown**
 */
export async function serverInit(options: CLIOptions) {
    const logger = getOrCreateGlobalLogger();
    logger.info("Hello world from SERVER.");

    const host = options.host;
    const port = options.port;

    // Config loader
    const json = await readJsonFile<Config>(path.join(process.cwd(), "/tmp/settings.json"));
    logger.info(json);

    // Server setup
    // const server = net.createServer();
    
    // server.on("connection", socket => {
    //     logger.log("Agent connected.");
    //     socket.write("Hello agent, I'm the server.");
    //     socket.write("See you on the other side.");
    //     socket.end();

    //     socket.on("data", data => {
    //         logger.log("Received data: " + data);
    //     });

    //     socket.on("error", error => {
    //         logger.log(error);
    //         server.close();
    //     });

    //     socket.on("close", () => {
    //         logger.log("Agent disconnected.");
    //     });
        
    // });

    // server.listen({port: port, host: host}, () => logger.pLog("Server bound to port " + port + " with success."));  

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