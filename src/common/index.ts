/**
 * Exports required for documentation.
 * 
 * Copyright (c) 2024 DarkenLM https://github.com/DarkenLM
 */

//#region ============== Protocol ==============
export * as Connection from "./protocol/connection.js";
export * as TCP from "./protocol/tcp.js";
export * as UDP from "./protocol/udp.js";
//#endregion ============== Protocol ==============

//#region ============== Util ==============
export * as date from "./util/date.js";
export * from "./util/dedent.js";
export * from "./util/getCaller.js";
export * from "./util/isBinMode.js";
export * as logger from "./util/logger.js";
export * as Object from "./util/object.js";
export * as Paths from "./util/paths.js";
export * as Time from "./util/time.js";
//#endregion ============== Util ==============