import { Levels, Logger } from "$common/util/logger.js";
import chalk from "chalk";
import express from "express";

//#region ============== Types ==============
interface Options {
    logger: Logger<typeof WEB_LOGGER_LEVELS>
}

interface WebLoggerInitArg {
    req: express.Request,
    res: express.Response | undefined
}
//#endregion ============== Types ==============

//#region ============== Constants ==============
const WEB_LOGGER_LEVELS = {
    log:    { name: "log", color: chalk.reset },
    success: { name: "success", color: chalk.green },
    info:    { name: "info", color: chalk.cyan },
    warn:    { name: "warn", color: chalk.yellow },
    error:   { name: "error", color: chalk.red },
} as const satisfies Levels;
//#region ============== Constants ==============

const options: Options = {
    logger: <never>undefined
};


export default options;
export {
    type WebLoggerInitArg,

    options,
    WEB_LOGGER_LEVELS
};