import express from "express";
import webOptions, { WEB_LOGGER_LEVELS, WebLoggerInitArg } from "../webConfig.js";

const loggerMiddleware: express.Handler = function loggerMiddleware(req, res, next) {
    const _end = res.end;
    //@ts-expect-error Overriding the Response end method so that we get access to the response status from the 
    // route for logging purposes.
    res.end = function (...args) {
        let level: keyof typeof WEB_LOGGER_LEVELS;
        if (res.statusCode >= 100 && res.statusCode < 200) level = "info";
        else if (res.statusCode >= 200 && res.statusCode < 300) level = "success";
        else if (res.statusCode >= 300 && res.statusCode < 400) level = "warn";
        else if (res.statusCode >= 400 && res.statusCode < 500) level = "error";
        else if (res.statusCode >= 500 && res.statusCode < 600) level = "error";
        else level = "log";

        webOptions.logger[level](<WebLoggerInitArg>{ req, res });
        
        // Call the original 'end' method
        _end.apply(res, <never>args);
    };

    next();
} satisfies express.Handler;

export default loggerMiddleware;