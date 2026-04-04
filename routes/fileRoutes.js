import express from "express";
import { requireSignIn } from "../middlewares/authMiddleware.js";
import { uploadSingleFile } from "../middlewares/uploadMiddleware.js";
import {
  uploadFileController,
  getMyFilesController,
  downloadFileController,
  previewFileController,
  updateFileMetaController,
  deleteFileController,
  getFileStatsController,
  createFolderController,
  getMyFoldersController,
  deleteFolderController,
} from "../controllers/fileController.js";

const router = express.Router();

router.post("/upload", requireSignIn, uploadSingleFile, uploadFileController);
router.get("/my-files", requireSignIn, getMyFilesController);
router.get("/stats", requireSignIn, getFileStatsController);
router.get("/folders", requireSignIn, getMyFoldersController);
router.post("/folders", requireSignIn, createFolderController);
router.delete("/folders", requireSignIn, deleteFolderController);
router.get("/:id/preview", requireSignIn, previewFileController);
router.get("/:id/download", requireSignIn, downloadFileController);
router.patch("/:id/meta", requireSignIn, updateFileMetaController);
router.delete("/:id", requireSignIn, deleteFileController);

export default router;
