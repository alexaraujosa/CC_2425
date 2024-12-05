import { Router } from "express";
import nocacheMiddleware from "../middlewares/nocache.js";
import path from "path";
import options from "../webConfig.js";

const router: Router = Router();
router.use(nocacheMiddleware);

router.get("/", function(req, res) {
    ;(() => req)();

    // res.status(200).send("Hello world!").end();
    res.status(200).sendFile(path.join(options.public, "pages/main/index.html"));
});

export default router;