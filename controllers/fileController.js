import fs from "fs";
import FileModel from "../models/fileModel.js";
import userModel from "../models/userModel.js";
import FolderModel from "../models/folderModel.js";
import localStorageService from "../services/storage/localStorageService.js";
import { createAuditLog } from "../services/auditLogService.js";

const PREVIEWABLE_MIME_PREFIX = ["image/", "video/", "audio/"];
const PREVIEWABLE_MIME_EXACT = ["application/pdf", "text/plain"];
const escapeRegex = (value) => value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

const getUserStorageLimitBytes = () => {
  const limitMb = Number(process.env.MAX_USER_STORAGE_MB || 200);
  return limitMb * 1024 * 1024;
};

const parseTags = (rawTags) => {
  if (!rawTags) return [];
  if (Array.isArray(rawTags)) {
    return rawTags.map((tag) => String(tag).trim()).filter(Boolean);
  }
  return String(rawTags)
    .split(",")
    .map((tag) => tag.trim())
    .filter(Boolean);
};

const resolveListQuery = (req) => {
  const { q, folder, type, starred, sort = "newest", page = 1, limit = 30 } = req.query;

  const parsedPage = Math.max(1, Number(page) || 1);
  const parsedLimit = Math.min(100, Math.max(1, Number(limit) || 30));

  const filter = {};
  if (q) {
    filter.$or = [
      { originalFilename: { $regex: q, $options: "i" } },
      { tags: { $elemMatch: { $regex: q, $options: "i" } } },
    ];
  }
  if (folder) {
    filter.folder = folder;
  }
  if (type) {
    filter.mimeType = { $regex: `^${type}/` };
  }
  if (starred === "true") {
    filter.isStarred = true;
  }

  let sortRule = { createdAt: -1 };
  if (sort === "oldest") sortRule = { createdAt: 1 };
  if (sort === "nameAsc") sortRule = { originalFilename: 1 };
  if (sort === "nameDesc") sortRule = { originalFilename: -1 };
  if (sort === "sizeAsc") sortRule = { size: 1 };
  if (sort === "sizeDesc") sortRule = { size: -1 };

  return { filter, sortRule, parsedPage, parsedLimit };
};

const canAccessFile = (file, reqUser) => {
  const isOwner = file.uploadedBy.toString() === reqUser._id.toString();
  const isAdmin = reqUser.role === 1;
  return isOwner || isAdmin;
};

const ensureFileExists = async (id) => FileModel.findById(id);

export const uploadFileController = async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).send({
        success: false,
        message: "Please upload a file with key 'file'",
      });
    }

    const currentUsage = await FileModel.aggregate([
      { $match: { uploadedBy: req.user._id } },
      { $group: { _id: null, totalSize: { $sum: "$size" } } },
    ]);
    const usedBytes = currentUsage[0]?.totalSize || 0;
    const storageLimitBytes = getUserStorageLimitBytes();
    if (usedBytes + req.file.size > storageLimitBytes && req.user.role !== 1) {
      return res.status(413).send({
        success: false,
        message: `Storage quota exceeded. Max ${(storageLimitBytes / (1024 * 1024)).toFixed(0)}MB`,
      });
    }

    const { storedFilename, storagePath } = await localStorageService.saveBuffer(
      req.file,
      req.user._id
    );

    const folder = (req.body.folder || "root").trim();
    const tags = parseTags(req.body.tags);

    const fileDoc = await FileModel.create({
      originalFilename: req.file.originalname,
      storedFilename,
      storagePath,
      size: req.file.size,
      mimeType: req.file.mimetype,
      uploadedBy: req.user._id,
      folder,
      tags,
    });

    return res.status(201).send({
      success: true,
      message: "File uploaded successfully",
      file: fileDoc,
    });
  } catch (error) {
    return res.status(500).send({
      success: false,
      message: "Error while uploading file",
      error: error.message,
    });
  }
};

export const getMyFilesController = async (req, res) => {
  try {
    const { filter, sortRule, parsedPage, parsedLimit } = resolveListQuery(req);
    filter.uploadedBy = req.user._id;

    const [files, total] = await Promise.all([
      FileModel.find(filter)
        .sort(sortRule)
        .skip((parsedPage - 1) * parsedLimit)
        .limit(parsedLimit)
        .populate("uploadedBy", "name email role"),
      FileModel.countDocuments(filter),
    ]);

    const usage = await FileModel.aggregate([
      { $match: { uploadedBy: req.user._id } },
      { $group: { _id: null, totalSize: { $sum: "$size" } } },
    ]);
    const usedBytes = usage[0]?.totalSize || 0;
    const limitBytes = getUserStorageLimitBytes();

    return res.status(200).send({
      success: true,
      total,
      page: parsedPage,
      limit: parsedLimit,
      totalPages: Math.max(1, Math.ceil(total / parsedLimit)),
      storage: {
        usedBytes,
        limitBytes,
      },
      files,
    });
  } catch (error) {
    return res.status(500).send({
      success: false,
      message: "Error while fetching your files",
      error: error.message,
    });
  }
};

export const downloadFileController = async (req, res) => {
  try {
    const file = await ensureFileExists(req.params.id);
    if (!file) {
      return res.status(404).send({
        success: false,
        message: "File not found",
      });
    }

    if (!canAccessFile(file, req.user)) {
      return res.status(403).send({
        success: false,
        message: "You are not allowed to access this file",
      });
    }

    const absolutePath = localStorageService.getAbsolutePath(file.storagePath);
    if (!fs.existsSync(absolutePath)) {
      return res.status(404).send({
        success: false,
        message: "File content is missing on storage",
      });
    }

    return res.download(absolutePath, file.originalFilename);
  } catch (error) {
    return res.status(500).send({
      success: false,
      message: "Error while downloading file",
      error: error.message,
    });
  }
};

export const previewFileController = async (req, res) => {
  try {
    const file = await ensureFileExists(req.params.id);
    if (!file) {
      return res.status(404).send({
        success: false,
        message: "File not found",
      });
    }

    if (!canAccessFile(file, req.user)) {
      return res.status(403).send({
        success: false,
        message: "You are not allowed to preview this file",
      });
    }

    const canPreview =
      PREVIEWABLE_MIME_EXACT.includes(file.mimeType) ||
      PREVIEWABLE_MIME_PREFIX.some((prefix) => file.mimeType.startsWith(prefix));
    if (!canPreview) {
      return res.status(400).send({
        success: false,
        message: "This file type is not previewable in browser",
      });
    }

    const absolutePath = localStorageService.getAbsolutePath(file.storagePath);
    if (!fs.existsSync(absolutePath)) {
      return res.status(404).send({
        success: false,
        message: "File content is missing on storage",
      });
    }

    res.setHeader("Content-Type", file.mimeType);
    res.setHeader("Content-Disposition", `inline; filename="${file.originalFilename}"`);
    return res.sendFile(absolutePath);
  } catch (error) {
    return res.status(500).send({
      success: false,
      message: "Error while previewing file",
      error: error.message,
    });
  }
};

export const updateFileMetaController = async (req, res) => {
  try {
    const file = await ensureFileExists(req.params.id);
    if (!file) {
      return res.status(404).send({
        success: false,
        message: "File not found",
      });
    }

    if (!canAccessFile(file, req.user)) {
      return res.status(403).send({
        success: false,
        message: "You are not allowed to update this file",
      });
    }

    const { originalFilename, folder, tags, isStarred, visibility } = req.body;

    if (originalFilename !== undefined) file.originalFilename = String(originalFilename).trim();
    if (folder !== undefined) file.folder = String(folder || "root").trim();
    if (tags !== undefined) file.tags = parseTags(tags);
    if (isStarred !== undefined) file.isStarred = Boolean(isStarred);
    if (visibility !== undefined && ["private", "public"].includes(visibility)) {
      file.visibility = visibility;
    }

    await file.save();

    return res.status(200).send({
      success: true,
      message: "File metadata updated",
      file,
    });
  } catch (error) {
    return res.status(500).send({
      success: false,
      message: "Error while updating file metadata",
      error: error.message,
    });
  }
};

export const deleteFileController = async (req, res) => {
  try {
    const file = await ensureFileExists(req.params.id);
    if (!file) {
      return res.status(404).send({
        success: false,
        message: "File not found",
      });
    }

    if (!canAccessFile(file, req.user)) {
      return res.status(403).send({
        success: false,
        message: "You are not allowed to delete this file",
      });
    }

    const storageDeleteResult = await localStorageService.deleteFile(file.storagePath);
    await file.deleteOne();

    return res.status(200).send({
      success: true,
      message: storageDeleteResult.deleted
        ? "File deleted successfully"
        : "File metadata deleted. Physical file will be cleaned later (locked by OS)",
    });
  } catch (error) {
    return res.status(500).send({
      success: false,
      message: "Error while deleting file",
      error: error.message,
    });
  }
};

export const getFileStatsController = async (req, res) => {
  try {
    const [count, usage] = await Promise.all([
      FileModel.countDocuments({ uploadedBy: req.user._id }),
      FileModel.aggregate([
        { $match: { uploadedBy: req.user._id } },
        { $group: { _id: null, totalSize: { $sum: "$size" } } },
      ]),
    ]);

    const usedBytes = usage[0]?.totalSize || 0;
    const limitBytes = getUserStorageLimitBytes();
    const user = await userModel.findById(req.user._id).select("name email role");

    return res.status(200).send({
      success: true,
      stats: {
        totalFiles: count,
        usedBytes,
        limitBytes,
        usedPercent:
          limitBytes > 0
            ? Math.min(100, Number(((usedBytes / limitBytes) * 100).toFixed(2)))
            : 0,
      },
      user,
    });
  } catch (error) {
    return res.status(500).send({
      success: false,
      message: "Error while fetching file stats",
      error: error.message,
    });
  }
};

export const createFolderController = async (req, res) => {
  try {
    const { name, parent = "" } = req.body;
    const cleanName = String(name || "").trim();
    if (!cleanName) {
      return res.status(400).send({
        success: false,
        message: "Folder name is required",
      });
    }

    if (cleanName.includes("..")) {
      return res.status(400).send({
        success: false,
        message: "Invalid folder name",
      });
    }

    const cleanParent = String(parent || "")
      .trim()
      .replace(/^\/+|\/+$/g, "");
    const path = cleanParent ? `${cleanParent}/${cleanName}` : cleanName;

    const existing = await FolderModel.findOne({ createdBy: req.user._id, path });
    if (existing) {
      return res.status(409).send({
        success: false,
        message: "Folder already exists",
      });
    }

    const folder = await FolderModel.create({
      name: cleanName,
      path,
      createdBy: req.user._id,
    });

    await createAuditLog({
      actor: req.user._id,
      action: "CREATE_FOLDER",
      targetType: "folder",
      targetId: folder._id,
      targetLabel: folder.path,
      metadata: {
        ownerId: req.user._id.toString(),
      },
    });

    return res.status(201).send({
      success: true,
      message: "Folder created",
      folder,
    });
  } catch (error) {
    return res.status(500).send({
      success: false,
      message: "Error while creating folder",
      error: error.message,
    });
  }
};

export const getMyFoldersController = async (req, res) => {
  try {
    const folders = await FolderModel.find({ createdBy: req.user._id })
      .select("_id name path createdAt")
      .sort({ path: 1 });

    return res.status(200).send({
      success: true,
      folders,
    });
  } catch (error) {
    return res.status(500).send({
      success: false,
      message: "Error while fetching folders",
      error: error.message,
    });
  }
};

export const deleteFolderController = async (req, res) => {
  try {
    const { path, force = false, ownerId } = req.body;
    const folderPath = String(path || "")
      .trim()
      .replace(/^\/+|\/+$/g, "");
    const shouldForceDelete = Boolean(force);
    const targetUserId = req.user.role === 1 && ownerId ? ownerId : req.user._id;

    if (!folderPath || folderPath === "root") {
      return res.status(400).send({
        success: false,
        message: "Invalid folder path",
      });
    }

    const folder = await FolderModel.findOne({
      createdBy: targetUserId,
      path: folderPath,
    });
    if (!folder) {
      return res.status(404).send({
        success: false,
        message: "Folder not found",
      });
    }

    const safePathRegex = escapeRegex(folderPath);

    const [fileCount, subFolderCount] = await Promise.all([
      FileModel.countDocuments({
        uploadedBy: targetUserId,
        folder: { $regex: `^${safePathRegex}(/|$)` },
      }),
      FolderModel.countDocuments({
        createdBy: targetUserId,
        path: { $regex: `^${safePathRegex}/` },
      }),
    ]);

    if ((fileCount > 0 || subFolderCount > 0) && !shouldForceDelete) {
      return res.status(409).send({
        success: false,
        message: "Folder is not empty. Confirm force delete to remove all contents",
        details: {
          fileCount,
          subFolderCount,
        },
      });
    }

    if (shouldForceDelete) {
      const filesToDelete = await FileModel.find({
        uploadedBy: targetUserId,
        folder: { $regex: `^${safePathRegex}(/|$)` },
      }).select("_id storagePath");

      const deleteResults = await Promise.all(
        filesToDelete.map((file) => localStorageService.deleteFile(file.storagePath))
      );
      const skippedStorageDeletes = deleteResults.filter((result) => !result.deleted).length;

      await FileModel.deleteMany({
        uploadedBy: targetUserId,
        folder: { $regex: `^${safePathRegex}(/|$)` },
      });
      await FolderModel.deleteMany({
        createdBy: targetUserId,
        path: { $regex: `^${safePathRegex}(/|$)` },
      });

      await createAuditLog({
        actor: req.user._id,
        action: req.user.role === 1 ? "ADMIN_FORCE_DELETE_FOLDER" : "FORCE_DELETE_FOLDER",
        targetType: "folder",
        targetId: folder._id,
        targetLabel: folderPath,
        metadata: {
          ownerId: String(targetUserId),
          skippedStorageDeletes,
          fileCount,
          subFolderCount,
        },
      });

      return res.status(200).send({
        success: true,
        message:
          skippedStorageDeletes > 0
            ? `Folder deleted. ${skippedStorageDeletes} physical file(s) are locked and will remain on disk`
            : "Folder and contents deleted",
      });
    } else {
      await folder.deleteOne();
      await createAuditLog({
        actor: req.user._id,
        action: req.user.role === 1 ? "ADMIN_DELETE_FOLDER" : "DELETE_FOLDER",
        targetType: "folder",
        targetId: folder._id,
        targetLabel: folderPath,
        metadata: {
          ownerId: String(targetUserId),
        },
      });
      return res.status(200).send({
        success: true,
        message: "Folder deleted",
      });
    }
  } catch (error) {
    return res.status(500).send({
      success: false,
      message: "Error while deleting folder",
      error: error.message,
    });
  }
};
