import os from "os";

/**
 * Calculates the cpu usage percentage based on the current system statistics.
 * 
 * @returns Rounded cpu usage percentage
 */
function getCpuUsage(): number {
    const cpus = os.cpus();
    const cpuCount = cpus.length;

    let idleMs = 0;
    let totalMs = 0;

    for (let i = 0; i < cpuCount; i++) {
        const cpu = cpus[i];
        for (const type in cpu.times) {
            totalMs += cpu.times[<keyof typeof cpu.times>type];
        }
        idleMs += cpu.times.idle;
    }

    const idlePercentage = (idleMs / totalMs) * 100;
    return Math.round(100 - idlePercentage);
}

/**
 * Calculates the ram usage percentage based on the current system statistics.
 * 
 * @returns Rounded ram usage percentage
 */
function getRamUsage(): number {
    const total = os.totalmem();
    const inUse = total - os.freemem();
    return Math.round((inUse / total) * 100);
}

export { getCpuUsage, getRamUsage };