import path from "path";
import util from "util";
import chalk from "chalk";
import express from "express";
import { createLogger, Levels } from "$common/util/logger.js";
import { getCallerFilePathAndPosition } from "$common/util/getCaller.js";
import { loggerFormatDate } from "$common/util/date.js";
import webOptions, { WEB_LOGGER_LEVELS, WebLoggerInitArg } from "./webConfig.js";
import { CLIOptions, ServerSharedData } from "../index.js";
import { makeLocations } from "$common/util/paths.js";

// Add Middleware imports here
import loggerMiddleware from "./middlewares/logger.js";

// Add Router imports here
import mainRouter from "./routes/main.js";
import { DatabaseDAO } from "$common/db/databaseDAO.js";

const { dirname: __dirname } = makeLocations(import.meta.url);

function initWebServer(options: CLIOptions, db: DatabaseDAO, sharedData: ServerSharedData): express.Express {
    const logger = createLogger(WEB_LOGGER_LEVELS, { debug: options.debug, printCallerFile: options.debug });

    // Override logger logging function. 
    // DarkenLM: Preferrably, this would be done by allowing the Levels to provide a formatter,
    //   but I've only just realized that we're dealing with an ancient version of my logger,
    //   which means that we don't have that capability available, so this hack will have to suffice.
    Object.getPrototypeOf(logger)._log = function(level: keyof Levels, ...args: unknown[]) {
        let outMsg = "";
        if (this.printCallerFile) outMsg += `[${getCallerFilePathAndPosition(this.root, 3)}] `;
        outMsg += `[${loggerFormatDate(new Date())}] [${this.levels[level].name.toUpperCase()}]`;

        const initArg: WebLoggerInitArg | undefined = <WebLoggerInitArg>args[0];
        if (typeof initArg === "object" && initArg.req) {
            outMsg += ` [${chalk.magenta(initArg.req.method)} ${chalk.green(initArg.res?.statusCode ?? "N/A")}`
                + ` ${chalk.yellow(initArg.req.url)}] |`;

            const nArgs = [
                ...args.slice(1).map(arg => typeof arg === "string" ? this._colorize(level, arg) : util.inspect(arg, false, 5, true))
            ];

            // eslint-disable-next-line no-console
            console.log(this._colorize(level, outMsg), ...nArgs);
        } else {
            const nArgs = args.map(arg => typeof arg === "string" ? this._colorize(level, arg) : util.inspect(arg, false, 5, true));

            // eslint-disable-next-line no-console
            console.log(this._colorize(level, outMsg), ...nArgs);
        }
    };
    webOptions.logger = logger;

    webOptions.db = db;
    webOptions.sharedData = sharedData;

    const app = express();
    app.set("view engine", "ejs");
    app.use(express.urlencoded({ extended: true }), express.json());

    logger.info(`Preparing static files from ${path.join(__dirname, "./public")}...`);
    app.use("/public", express.static(path.join(__dirname, "./public")));
    logger.success(`Successfully attached static files.`);

    // Add Middleware registrations here.
    app.use(loggerMiddleware);

    // Add Router registrations here.
    app.use(mainRouter);

    const SERVER_PORT = options.port + 2;
    app.listen(SERVER_PORT, () => {
        logger.success(`Web server listening at ${options.host}:${SERVER_PORT}.`);
    });
    return app;
}

export {
    initWebServer
};