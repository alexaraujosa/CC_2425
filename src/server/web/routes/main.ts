import { Router } from "express";
import nocacheMiddleware from "../middlewares/nocache.js";
import path from "path";
import options, { CONNECTION_ALIVE_THRESHOLD } from "../webConfig.js";
import { preparedMemoize } from "$common/util/memoize.js";
import { IMetric } from "$common/db/interfaces/IMetrics.js";

interface UIMetric {
    alert: boolean,
    task: string,
    timestamp: Date,
    values: Record<string, unknown>
}

const router: Router = Router();
router.use(nocacheMiddleware);

const cache = {
    deviceNames: preparedMemoize(() => Object.fromEntries(Object.entries(config.devices).map(([k,v]) => [v.ip, k])))
};

router.get("/", async function(req, res) {
    ;(() => req)();
    // const deviceNames = memoize(() => Object.fromEntries(Object.entries(config.devices).map(([k,v]) => [v.ip, k])));
    const deviceNames = cache.deviceNames();
    const devices = await options.db.getAllDevices();

    const sendDevices = devices.map(d => ({ 
        name: deviceNames[d.ip] ?? undefined, 
        ip: d.ip, 
        connectedAt: d.connectAt,
        alive: ((options.sharedData.connectionStatus[d.ip] ?? new Date(0)).getTime() + CONNECTION_ALIVE_THRESHOLD > Date.now())
    }));
    // options.logger.log(`Devices:`, sendDevices);
    // options.logger.log(options.sharedData.connectionStatus, devices[1].ip);
    // options.logger.log((options.sharedData.connectionStatus[devices[1].ip] ?? new Date(0)).getTime() + CONNECTION_ALIVE_THRESHOLD);
    // options.logger.log(Date.now());
    // options.logger.log((options.sharedData.connectionStatus[devices[1].ip] ?? new Date(0)).getTime() + CONNECTION_ALIVE_THRESHOLD > Date.now());

    // res.status(200).send("Hello world!").end();
    res.status(200).render(path.join(options.public, "pages/index.ejs"), { devices: sendDevices });
});

router.get("/devices/:device", async function(req, res) {
    const logger = options.logger;
    const devices = config.devices;

    const deviceName = req.params.device;
    if (!(deviceName in devices)) {
        res.status(404).render(path.join(options.public, "pages/error.ejs"), { reason: "Unknown device.", status: 404 });
        return;
    }

    try {
        const deviceInfo = await options.db.getDeviceByIP(config.devices[deviceName].ip);
        if (!deviceInfo) {
            res.status(404).render(path.join(options.public, "pages/error.ejs"), { reason: "Unknown device.", status: 404 });
            return;
        }

        const deviceMetrics = config.devices[deviceName].tasks.map(t => options.sharedData.dbMapper.get(t)!);
        const _metrics = <IMetric[]>[];

        logger.log("DBMAPPER:", options.sharedData.dbMapper);
        for (const dm of deviceMetrics) {
            logger.log("DM:", dm);
            try {
                const dmm = await options.db.getMetrics(dm, deviceInfo.id);
                if (dmm) _metrics.push(dmm.metrics);
                else _metrics.push({});
            } catch (_) {
                // Silently ignore
            }
        }

        logger.log("_METRICS:", _metrics);

        const tsMetrics = <Record<number, UIMetric>>{};
        for (let i = 0; i < _metrics.length; i++) {
            const task = config.devices[deviceName].tasks[i];
            
            for (const metricKey in _metrics[i]) {
                const metric = _metrics[i][<keyof typeof _metrics[typeof i]>metricKey]!;
                
                for (const value of metric.metric) {
                    const ts = value.timestamp.getTime();
                    if (!tsMetrics[ts]) {
                        tsMetrics[ts] = {
                            alert: value.alert,
                            task: task,
                            timestamp: value.timestamp,
                            values: {
                                [metricKey]: value.value
                            }
                        };
                    } else {
                        tsMetrics[ts].values[metricKey] = value.value;
                    }
                }
            }
        }

        logger.log("TS METRICS:", tsMetrics);

        res.status(200).render(path.join(options.public, "pages/device.ejs"), { 
            ...config.devices[deviceName], 
            name: deviceName,
            connectedAt: deviceInfo.connectAt,
            alive: !(
                (options.sharedData.connectionStatus[config.devices[deviceName].ip] ?? new Date()).getTime() + CONNECTION_ALIVE_THRESHOLD 
                < Date.now()
            ),
            metrics: Object.values(tsMetrics)
            // metrics: [
            //     {
            //         task: "task1",
            //         timestamp: new Date("2024-12-07T01:12:45.290+00:00"),
            //         alert: false,
            //         values: {
            //             cpu_usage: 10,
            //             ram_usage: 20,
            //             interface_stats: { eth0: 123, eth1: 456 }
            //         }
            //     },
            //     {
            //         task: "task1",
            //         timestamp: new Date("2024-12-07T01:13:45.290+00:00"),
            //         alert: false,
            //         values: {
            //             cpu_usage: 40,
            //             ram_usage: 60,
            //             interface_stats: { eth0: 321, eth1: 654 }
            //         }
            //     },
            //     {
            //         task: "task2",
            //         timestamp: new Date("2024-12-07T01:13:45.290+00:00"),
            //         alert: false,
            //         values: {
            //             cpu_usage: 12,
            //             ram_usage: 34,
            //             interface_stats: { eth0: 321 },

            //         }
            //     }
            // ]
        });
    } catch (e) {
        res.status(500).render(path.join(options.public, "pages/error.ejs"), { reason: "Error fetching device.", status: 500 });
        logger.warn({ req, res }, "Error fetching device info:", e);
    }
});

export default router;