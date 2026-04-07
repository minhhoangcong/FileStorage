import express from "express";
import {
  registerController,
  loginController,
  testController,
  meController,
} from "../controllers/authController.js";
import { isAdmin, requireSignIn } from "../middlewares/authMiddleware.js";
import { authRateLimiter } from "../middlewares/rateLimitMiddleware.js";

const router = express.Router();

router.post("/register", authRateLimiter, registerController);
router.post("/login", authRateLimiter, loginController);
router.get("/me", requireSignIn, meController);
router.get("/test", requireSignIn, isAdmin, testController);

export default router;
