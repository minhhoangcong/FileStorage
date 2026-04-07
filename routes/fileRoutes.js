import express from "express";
import { requireSignIn } from "../middlewares/authMiddleware.js";
import { uploadFiles } from "../middlewares/uploadMiddleware.js";
import {
  uploadFileController,
  getMyFilesController,
  downloadFileController,
  previewFileController,
  updateFileMetaController,
  deleteFileController,
  restoreFileController,
  permanentDeleteFileController,
  getTrashFilesController,
  getFileStatsController,
  createFolderController,
  getMyFoldersController,
  deleteFolderController,
  getTrashFoldersController,
  restoreFolderController,
  permanentDeleteFolderController,
  getFolderTreeController,
  moveFolderController,
  createShareLinkController,
  getFileShareLinksController,
  revokeShareLinkController,
  sharedDownloadController,
  sharedPreviewController,
} from "../controllers/fileControllerV2.js";

const router = express.Router();

router.get("/shared/:token/download", sharedDownloadController);
router.get("/shared/:token/preview", sharedPreviewController);

router.post("/upload", requireSignIn, uploadFiles, uploadFileController);
router.get("/my-files", requireSignIn, getMyFilesController);
router.get("/stats", requireSignIn, getFileStatsController);
router.get("/trash/files", requireSignIn, getTrashFilesController);
router.get("/trash/folders", requireSignIn, getTrashFoldersController);
router.get("/folders", requireSignIn, getMyFoldersController);
router.get("/folders/tree", requireSignIn, getFolderTreeController);
router.post("/folders", requireSignIn, createFolderController);
router.patch("/folders/move", requireSignIn, moveFolderController);
router.post("/folders/restore", requireSignIn, restoreFolderController);
router.delete("/folders/permanent", requireSignIn, permanentDeleteFolderController);
router.delete("/folders", requireSignIn, deleteFolderController);

router.post("/:id/share", requireSignIn, createShareLinkController);
router.get("/:id/shares", requireSignIn, getFileShareLinksController);
router.delete("/shares/:shareId", requireSignIn, revokeShareLinkController);

router.post("/:id/restore", requireSignIn, restoreFileController);
router.delete("/:id/permanent", requireSignIn, permanentDeleteFileController);
router.get("/:id/preview", requireSignIn, previewFileController);
router.get("/:id/download", requireSignIn, downloadFileController);
router.patch("/:id/meta", requireSignIn, updateFileMetaController);
router.delete("/:id", requireSignIn, deleteFileController);

export default router;
