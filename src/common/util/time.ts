/**
 * Halts the thread for N milliseconds.
 * 
 * @param ms The time in milliseconds to sleep for.
 * @returns 
 */
async function sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
}

export {
    sleep
};