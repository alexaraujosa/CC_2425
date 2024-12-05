import express from "express";

/**
 * Middleware for disabling the cache on a given handler tree.
 * 
 * The entire tree of the handler registred after the registration of this middleware will cease to be cached client-side.
 */
const nocacheMiddleware: express.Handler = function loggerMiddleware(_req, res, next) {
    res.setHeader("Surrogate-Control", "no-store");
    res.setHeader("Cache-Control", "no-store, no-cache, must-revalidate, proxy-revalidate");
    res.setHeader("Expires", "0");
    
    next();
} satisfies express.Handler;

export default nocacheMiddleware;