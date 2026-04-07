import express from "express";
import {
  getAllFilesController,
  getAllUsersController,
  updateUserRoleController,
  getAdminStatsController,
  getAllFoldersController,
  getAuditLogsController,
} from "../controllers/adminController.js";
import { requireSignIn, isAdmin } from "../middlewares/authMiddleware.js";
import { deleteFolderController } from "../controllers/fileControllerV2.js";

const router = express.Router();

router.get("/files", requireSignIn, isAdmin, getAllFilesController);
router.get("/users", requireSignIn, isAdmin, getAllUsersController);
router.patch("/users/:id/role", requireSignIn, isAdmin, updateUserRoleController);
router.get("/stats", requireSignIn, isAdmin, getAdminStatsController);
router.get("/folders", requireSignIn, isAdmin, getAllFoldersController);
router.delete("/folders", requireSignIn, isAdmin, deleteFolderController);
router.get("/audit-logs", requireSignIn, isAdmin, getAuditLogsController);

export default router;
