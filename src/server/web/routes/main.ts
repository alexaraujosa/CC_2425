import { Router } from "express";
import nocacheMiddleware from "../middlewares/nocache.js";

const router: Router = Router();
router.use(nocacheMiddleware);

router.get("/", function(req, res) {
    ;(() => req)();

    res.status(200).send("Hello world!").end();
});

export default router;