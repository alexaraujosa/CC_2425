/**
 * @file assets.build.mts
 * @description Copies asset files from the source to dist.
 * @version 1.0.0
 * 
 * Copyright (c) 2024 DarkenLM https://github.com/DarkenLM
 */

import fs from "fs";
import fsp from "fs/promises";
import path from "path";
import { cac } from "cac";
import dotenv from "dotenv";
import isBinMode from "$scripts/util/isBinMode.mts";
import { DefaultLogger, getOrCreateGlobalLogger } from "$scripts/util/logger.mts";
import { isPathLeaf, makeLocations } from "$scripts/util/paths.mts";
import { generateRandomPhrase } from "$scripts/util/rand.mts";
import { confirmDangerousOperationPassphrase } from "$scripts/util/dangerZone.mts";
import chalk from "chalk";

let logger: DefaultLogger;
const { dirname: __dirname, filename: __filename } = makeLocations(import.meta.url);
dotenv.config();

//#region ============== Types ==============
interface CLIOptions {
    debug: boolean,
    force: boolean,
    target: string,
    ignore: string[]
}

interface CopyAssetsStatus {
    total: number,
    successful: number,
    failed: number,
    ignored: number
}
//#endregion

//#region ============== Constants ==============
const NAME = "clean.build";
const VERSION = "1.0.0";
const DEFAULT_ROOT = path.join(__dirname, "../src");
const DEFAULT_TARGET = "dist";
const DEFAULT_IGNORE_EXTS = ["ts", "mts", "cts", "old"];
//#endregion

//#region ============== Functions ==============

async function copyAssets(target: string, root: string, ignoreExts: string[], force: boolean): Promise<CopyAssetsStatus> {
    const files = await fsp.readdir(root, { withFileTypes: true });

    const status: CopyAssetsStatus = {
        total: 0,
        successful: 0,
        failed: 0,
        ignored: 0
    };

    for (const file of files) {
        logger.info(`[ASSETS] Evaluating entry at ${chalk.yellow(file.name)}.`);

        if (file.isDirectory()) {
            logger.info(`[ASSETS] Entry is a directory. Iterating.`)

            const stats = await copyAssets(
                path.join(target, file.name),
                path.join(root, file.name),
                ignoreExts,
                force
            )

            status.total += stats.total;
            status.successful += stats.successful;
            status.failed += stats.failed;
            status.ignored += stats.ignored;

            logger.success(`[ASSETS] Successfully iterated through ${chalk.yellow(file.name)}.`);
        } else if (file.isFile()) {
            status.total++;

            // if (ignoreExts.includes(file.name.split(".").slice(1).join("."))) {
            if (ignoreExts.includes(path.extname(file.name).replace(/^\./, ""))) {
                logger.error("[ASSETS] Cannot copy asset because entry is not an asset.");
                status.ignored++;
                continue;
            }

            const dest = path.join(target, file.name);
            if (fs.existsSync(dest) && !force) {
                logger.error("[ASSETS] Cannot copy asset because asset already exists in destination.");
                status.failed++;
                continue;
            }

            logger.info(`[ASSETS] Asserting directory structure at destination.`);
            await fsp.mkdir(path.dirname(dest), { recursive: true });

            logger.info(`[ASSETS] Copying asset to ${chalk.yellow(dest)}`);
            await fsp.copyFile(path.join(root, file.name), dest)
            logger.success(`[ASSETS] Successfully copied asset.`);

            status.successful++;
        } else {
            logger.warn(`[ASSETS] Entry is an unsupported filesystem entry.`);
        }
    }

    return status;
}


async function script(options: CLIOptions) {
    logger.log("Running script with options", options);
    
    let target: string = "";
    if (options.target) target = options.target;
    else target = DEFAULT_TARGET;
    target = path.resolve(process.cwd(), target);

    let ignoreExts: string[] = [];
    if (options.ignore) ignoreExts = options.ignore;
    else ignoreExts = DEFAULT_IGNORE_EXTS;

    const stats = await copyAssets(target, DEFAULT_ROOT, ignoreExts, options.force);
    logger.pSuccess(`[ASSETS] Successfully processed ${stats.total} entries.\n  - Successful: ${stats.successful}\n  - Failed: ${stats.failed}\n  - Ignored: ${stats.ignored}`)
}
//#endregion

//#region ============== CLI ==============
const cli = cac(NAME).version(VERSION);
cli.help();
cli.option("--debug, -d", "Enable debug mode");
cli.option("--force, -f", "Force the script to run");
cli.option("--root <root>", "The root directory to use", { default: DEFAULT_ROOT, type: String as never });
cli.option("--target, -t <target>", "The targets to clean", { default: DEFAULT_TARGET, type: String as never });
cli.option("--ignore, -i <ext>", "Extensions to ignore.", { default: DEFAULT_IGNORE_EXTS, type: [String] });

async function cliHandler() {
    const { options } = cli.parse();
    if (options.help || options.version) return; // Do not execute script if help message was requested.
    
    logger = getOrCreateGlobalLogger({ debug: options.debug });

    await script(options as CLIOptions);
}

if (isBinMode(import.meta.url)) {
    cliHandler();
}
//#endregion

export {
    copyAssets
};