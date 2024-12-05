/**
 * @module Shutdown
 * 
 * This module implements a gracious shutdown mechanism, where multiple subscribers can hook into this event,
 * to be called in subscription order before the application exits.
 * 
 * **NOTE:** This module only handles exists via SIGINT. Other signals like SIGKILL, SIGTERM or SIGSEGV are not handled.
 */

type ShutdownSubscriber = (() => void) | (() => Promise<void>);

/**
 * A list containing all subscribers to be triggered on a shutdown.
 */
const subscribers: ShutdownSubscriber[] = [];

/**
 * Subscribes to the shutdown event. A function subscribed to the shutdown event will be ran when a gracious shutdown occurs.
 * @param subscriber The function to subscribe to the shutdown event.
 */
function subscribeShutdown(subscriber: ShutdownSubscriber): void {
    if (subscribers.includes(subscriber)) return;

    subscribers.push(subscriber);
}

/**
 * Unsubscribes from the shutdown event. The passed function must be an existing subscriber to the shitdown event.
 * @param subscriber The function to unsubscribe from the shutdown event.
 */
function unsubscribeShutdown(subscriber: ShutdownSubscriber): void {
    const index = subscribers.findIndex((e) => e === subscriber);
    if (index === -1) return;

    subscribers.splice(index, 1);
}

function _handleShutdown() {
    // eslint-disable-next-line no-async-promise-executor
    new Promise<void>(async (resolve) => {
        for (const subscriber of subscribers) await subscriber();
        resolve();
    }).then(() => process.exit(0));
}

/**
 * Register the shutdown event handler. Should be called on the entry point after a successful CLI processing.
 */
function registerShutdown() {
    process.on("SIGINT", _handleShutdown);
}

export {
    type ShutdownSubscriber,

    subscribeShutdown,
    unsubscribeShutdown,

    registerShutdown
};