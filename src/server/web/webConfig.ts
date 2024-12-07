import { DatabaseDAO } from "$common/db/databaseDAO.js";
import { Levels, Logger } from "$common/util/logger.js";
import { makeLocations } from "$common/util/paths.js";
import chalk from "chalk";
import express from "express";
import path from "path";
import { ServerSharedData } from "../index.js";

//#region ============== Types ==============
interface Options {
    logger: Logger<typeof WEB_LOGGER_LEVELS>,
    public: string,
    db: DatabaseDAO,
    sharedData: ServerSharedData
}

interface WebLoggerInitArg {
    req: express.Request,
    res: express.Response | undefined
}
//#endregion ============== Types ==============

//#region ============== Constants ==============
const { dirname: __dirname } = makeLocations(import.meta.url);

const WEB_LOGGER_LEVELS = {
    log:    { name: "log", color: chalk.reset },
    success: { name: "success", color: chalk.green },
    info:    { name: "info", color: chalk.cyan },
    warn:    { name: "warn", color: chalk.yellow },
    error:   { name: "error", color: chalk.red },
} as const satisfies Levels;

const CONNECTION_ALIVE_THRESHOLD = 5_000; // 5s
//#region ============== Constants ==============

const options: Options = {
    logger: <never>undefined,
    public: path.join(__dirname, "./public"),
    db: <never>undefined,
    sharedData: <never>undefined
};


export default options;
export {
    type WebLoggerInitArg,

    options,
    WEB_LOGGER_LEVELS,

    CONNECTION_ALIVE_THRESHOLD
};