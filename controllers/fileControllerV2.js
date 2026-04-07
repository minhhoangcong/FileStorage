import fs from "fs";
import crypto from "crypto";
import FileModel from "../models/fileModel.js";
import userModel from "../models/userModel.js";
import FolderModel from "../models/folderModel.js";
import ShareLinkModel from "../models/shareLinkModel.js";
import storageService from "../services/storage/index.js";
import { createAuditLog } from "../services/auditLogService.js";

const PREVIEWABLE_MIME_PREFIX = ["image/", "video/", "audio/"];
const PREVIEWABLE_MIME_EXACT = ["application/pdf", "text/plain"];
const escapeRegex = (value) => value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

const getUserStorageLimitBytes = () => {
  const limitMb = Number(process.env.MAX_USER_STORAGE_MB || 200);
  return limitMb * 1024 * 1024;
};

const normalizeFolderPath = (value, fallback = "root") => {
  const path = String(value || "")
    .trim()
    .replace(/^\/+|\/+$/g, "");
  if (!path) return fallback;
  if (path.includes("..")) throw new Error("Invalid folder path");
  return path;
};

const parseTags = (rawTags) => {
  if (!rawTags) return [];
  if (Array.isArray(rawTags)) return rawTags.map((tag) => String(tag).trim()).filter(Boolean);
  return String(rawTags)
    .split(",")
    .map((tag) => tag.trim())
    .filter(Boolean);
};

const resolveListQuery = (req) => {
  const { q, folder, type, starred, sort = "newest", page = 1, limit = 30 } = req.query;
  const parsedPage = Math.max(1, Number(page) || 1);
  const parsedLimit = Math.min(100, Math.max(1, Number(limit) || 30));

  const filter = { isDeleted: false };
  if (q) {
    filter.$or = [
      { originalFilename: { $regex: q, $options: "i" } },
      { tags: { $elemMatch: { $regex: q, $options: "i" } } },
    ];
  }
  if (folder) filter.folder = folder;
  if (type) filter.mimeType = { $regex: `^${type}/` };
  if (starred === "true") filter.isStarred = true;

  let sortRule = { createdAt: -1 };
  if (sort === "oldest") sortRule = { createdAt: 1 };
  if (sort === "nameAsc") sortRule = { originalFilename: 1 };
  if (sort === "nameDesc") sortRule = { originalFilename: -1 };
  if (sort === "sizeAsc") sortRule = { size: 1 };
  if (sort === "sizeDesc") sortRule = { size: -1 };

  return { filter, sortRule, parsedPage, parsedLimit };
};

const canAccessFile = (file, reqUser) =>
  file.uploadedBy.toString() === reqUser._id.toString() || reqUser.role === 1;

const getUploadFiles = (req) => {
  const list = [];
  if (req.file) list.push(req.file);
  const fieldFiles = req.files;
  if (Array.isArray(fieldFiles)) list.push(...fieldFiles);
  else if (fieldFiles && typeof fieldFiles === "object") {
    if (Array.isArray(fieldFiles.file)) list.push(...fieldFiles.file);
    if (Array.isArray(fieldFiles.files)) list.push(...fieldFiles.files);
  }
  return list;
};

const isPreviewableMime = (mimeType) =>
  PREVIEWABLE_MIME_EXACT.includes(mimeType) ||
  PREVIEWABLE_MIME_PREFIX.some((prefix) => mimeType.startsWith(prefix));

const requireLocalStorage = () => {
  if (storageService.isLocal()) return null;
  return `Current storage driver '${storageService.getDriverName()}' does not support local preview/download API yet`;
};

const buildFolderTree = (folders) => {
  const root = new Map();
  for (const folder of folders) {
    const parts = folder.path.split("/").filter(Boolean);
    let current = root;
    let currentPath = "";
    parts.forEach((part) => {
      currentPath = currentPath ? `${currentPath}/${part}` : part;
      if (!current.has(part)) {
        current.set(part, { name: part, path: currentPath, childrenMap: new Map() });
      }
      current = current.get(part).childrenMap;
    });
  }
  const mapToArray = (map) =>
    Array.from(map.values())
      .map((node) => ({ name: node.name, path: node.path, children: mapToArray(node.childrenMap) }))
      .sort((a, b) => a.path.localeCompare(b.path));
  return mapToArray(root);
};

const withFileById = async (fileId, reqUser, includeDeleted = false) => {
  const filter = { _id: fileId };
  if (!includeDeleted) filter.isDeleted = false;
  const file = await FileModel.findOne(filter);
  if (!file) return { error: { status: 404, message: "File not found" } };
  if (!canAccessFile(file, reqUser)) {
    return { error: { status: 403, message: "You are not allowed to access this file" } };
  }
  return { file };
};

const ensureFolderExistsForUpload = async (ownerId, folderPath) => {
  if (folderPath === "root") return;
  const existing = await FolderModel.findOne({ createdBy: ownerId, path: folderPath });
  if (!existing) {
    await FolderModel.create({
      name: folderPath.split("/").slice(-1)[0],
      path: folderPath,
      createdBy: ownerId,
      isDeleted: false,
    });
    return;
  }
  if (existing.isDeleted) {
    existing.isDeleted = false;
    existing.deletedAt = null;
    existing.deletedBy = null;
    await existing.save();
  }
};

export const uploadFileController = async (req, res) => {
  try {
    const files = getUploadFiles(req);
    if (!files.length) {
      return res.status(400).send({
        success: false,
        message: "Please upload at least one file with key 'file' or 'files'",
      });
    }

    const totalUploadSize = files.reduce((sum, file) => sum + (file.size || 0), 0);
    const currentUsage = await FileModel.aggregate([
      { $match: { uploadedBy: req.user._id, isDeleted: false } },
      { $group: { _id: null, totalSize: { $sum: "$size" } } },
    ]);
    const usedBytes = currentUsage[0]?.totalSize || 0;
    const storageLimitBytes = getUserStorageLimitBytes();
    if (usedBytes + totalUploadSize > storageLimitBytes && req.user.role !== 1) {
      return res.status(413).send({
        success: false,
        message: `Storage quota exceeded. Max ${(storageLimitBytes / (1024 * 1024)).toFixed(0)}MB`,
      });
    }

    const folder = normalizeFolderPath(req.body.folder || "root");
    const tags = parseTags(req.body.tags);
    await ensureFolderExistsForUpload(req.user._id, folder);

    const createdFiles = [];
    for (const file of files) {
      const { storedFilename, storagePath } = await storageService.saveBuffer(file, req.user._id);
      const fileDoc = await FileModel.create({
        originalFilename: file.originalname,
        storedFilename,
        storagePath,
        size: file.size,
        mimeType: file.mimetype,
        uploadedBy: req.user._id,
        folder,
        tags,
      });
      createdFiles.push(fileDoc);
    }

    return res.status(201).send({
      success: true,
      message: createdFiles.length > 1 ? "Files uploaded successfully" : "File uploaded successfully",
      totalUploaded: createdFiles.length,
      files: createdFiles,
      file: createdFiles[0] || null,
    });
  } catch (error) {
    return res.status(500).send({ success: false, message: "Error while uploading file", error: error.message });
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
      { $match: { uploadedBy: req.user._id, isDeleted: false } },
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
      storage: { usedBytes, limitBytes },
      files,
    });
  } catch (error) {
    return res.status(500).send({ success: false, message: "Error while fetching your files", error: error.message });
  }
};

export const getTrashFilesController = async (req, res) => {
  try {
    const files = await FileModel.find({ uploadedBy: req.user._id, isDeleted: true })
      .sort({ deletedAt: -1 })
      .populate("uploadedBy", "name email role")
      .populate("deletedBy", "name email role");

    return res.status(200).send({ success: true, total: files.length, files });
  } catch (error) {
    return res.status(500).send({ success: false, message: "Error while fetching trash files", error: error.message });
  }
};

export const downloadFileController = async (req, res) => {
  try {
    const localStorageError = requireLocalStorage();
    if (localStorageError) return res.status(501).send({ success: false, message: localStorageError });
    const result = await withFileById(req.params.id, req.user, false);
    if (result.error) return res.status(result.error.status).send({ success: false, message: result.error.message });
    const file = result.file;
    const absolutePath = storageService.getAbsolutePath(file.storagePath);
    if (!fs.existsSync(absolutePath)) {
      return res.status(404).send({ success: false, message: "File content is missing on storage" });
    }
    return res.download(absolutePath, file.originalFilename);
  } catch (error) {
    return res.status(500).send({ success: false, message: "Error while downloading file", error: error.message });
  }
};

export const previewFileController = async (req, res) => {
  try {
    const localStorageError = requireLocalStorage();
    if (localStorageError) return res.status(501).send({ success: false, message: localStorageError });
    const result = await withFileById(req.params.id, req.user, false);
    if (result.error) return res.status(result.error.status).send({ success: false, message: result.error.message });
    const file = result.file;
    if (!isPreviewableMime(file.mimeType)) {
      return res.status(400).send({ success: false, message: "This file type is not previewable in browser" });
    }
    const absolutePath = storageService.getAbsolutePath(file.storagePath);
    if (!fs.existsSync(absolutePath)) {
      return res.status(404).send({ success: false, message: "File content is missing on storage" });
    }
    res.setHeader("Content-Type", file.mimeType);
    res.setHeader("Content-Disposition", `inline; filename=\"${file.originalFilename}\"`);
    return res.sendFile(absolutePath);
  } catch (error) {
    return res.status(500).send({ success: false, message: "Error while previewing file", error: error.message });
  }
};

export const updateFileMetaController = async (req, res) => {
  try {
    const result = await withFileById(req.params.id, req.user, false);
    if (result.error) return res.status(result.error.status).send({ success: false, message: result.error.message });
    const file = result.file;
    const { originalFilename, folder, tags, isStarred, visibility } = req.body;

    if (originalFilename !== undefined) file.originalFilename = String(originalFilename).trim();
    if (folder !== undefined) {
      const nextFolder = normalizeFolderPath(folder || "root");
      await ensureFolderExistsForUpload(file.uploadedBy, nextFolder);
      file.folder = nextFolder;
    }
    if (tags !== undefined) file.tags = parseTags(tags);
    if (isStarred !== undefined) file.isStarred = Boolean(isStarred);
    if (visibility !== undefined && ["private", "public"].includes(visibility)) file.visibility = visibility;

    await file.save();
    return res.status(200).send({ success: true, message: "File metadata updated", file });
  } catch (error) {
    return res.status(500).send({ success: false, message: "Error while updating file metadata", error: error.message });
  }
};

export const deleteFileController = async (req, res) => {
  try {
    const result = await withFileById(req.params.id, req.user, false);
    if (result.error) return res.status(result.error.status).send({ success: false, message: result.error.message });
    const file = result.file;
    file.isDeleted = true;
    file.deletedAt = new Date();
    file.deletedBy = req.user._id;
    await file.save();

    await createAuditLog({
      actor: req.user._id,
      action: req.user.role === 1 ? "ADMIN_SOFT_DELETE_FILE" : "SOFT_DELETE_FILE",
      targetType: "file",
      targetId: file._id,
      targetLabel: file.originalFilename,
      metadata: { ownerId: String(file.uploadedBy) },
    });

    return res.status(200).send({ success: true, message: "File moved to trash" });
  } catch (error) {
    return res.status(500).send({ success: false, message: "Error while deleting file", error: error.message });
  }
};

export const restoreFileController = async (req, res) => {
  try {
    const result = await withFileById(req.params.id, req.user, true);
    if (result.error) return res.status(result.error.status).send({ success: false, message: result.error.message });
    const file = result.file;
    if (!file.isDeleted) return res.status(200).send({ success: true, message: "File is already active", file });

    file.isDeleted = false;
    file.deletedAt = null;
    file.deletedBy = null;
    await file.save();
    return res.status(200).send({ success: true, message: "File restored successfully", file });
  } catch (error) {
    return res.status(500).send({ success: false, message: "Error while restoring file", error: error.message });
  }
};

export const permanentDeleteFileController = async (req, res) => {
  try {
    const result = await withFileById(req.params.id, req.user, true);
    if (result.error) return res.status(result.error.status).send({ success: false, message: result.error.message });
    const file = result.file;
    const storageDeleteResult = await storageService.deleteFile(file.storagePath);
    await ShareLinkModel.deleteMany({ file: file._id });
    await file.deleteOne();

    await createAuditLog({
      actor: req.user._id,
      action: req.user.role === 1 ? "ADMIN_PERMANENT_DELETE_FILE" : "PERMANENT_DELETE_FILE",
      targetType: "file",
      targetId: file._id,
      targetLabel: file.originalFilename,
      metadata: { ownerId: String(file.uploadedBy), storageDeleted: storageDeleteResult.deleted },
    });

    return res.status(200).send({
      success: true,
      message: storageDeleteResult.deleted
        ? "File permanently deleted"
        : "Metadata deleted. Physical file is locked by OS",
    });
  } catch (error) {
    return res.status(500).send({ success: false, message: "Error while permanently deleting file", error: error.message });
  }
};

export const getFileStatsController = async (req, res) => {
  try {
    const [count, usage] = await Promise.all([
      FileModel.countDocuments({ uploadedBy: req.user._id, isDeleted: false }),
      FileModel.aggregate([
        { $match: { uploadedBy: req.user._id, isDeleted: false } },
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
        usedPercent: limitBytes > 0 ? Math.min(100, Number(((usedBytes / limitBytes) * 100).toFixed(2))) : 0,
      },
      user,
    });
  } catch (error) {
    return res.status(500).send({ success: false, message: "Error while fetching file stats", error: error.message });
  }
};

export const createFolderController = async (req, res) => {
  try {
    const { name, parent = "" } = req.body;
    const cleanName = String(name || "").trim();
    if (!cleanName) return res.status(400).send({ success: false, message: "Folder name is required" });
    if (cleanName.includes("..")) return res.status(400).send({ success: false, message: "Invalid folder name" });

    const cleanParent = normalizeFolderPath(parent || "", "");
    const path = cleanParent ? `${cleanParent}/${cleanName}` : cleanName;

    const existing = await FolderModel.findOne({ createdBy: req.user._id, path });
    if (existing && !existing.isDeleted) {
      return res.status(409).send({ success: false, message: "Folder already exists" });
    }

    let folder = existing;
    if (folder && folder.isDeleted) {
      folder.isDeleted = false;
      folder.deletedAt = null;
      folder.deletedBy = null;
      folder.name = cleanName;
      await folder.save();
    } else {
      folder = await FolderModel.create({ name: cleanName, path, createdBy: req.user._id });
    }

    await createAuditLog({
      actor: req.user._id,
      action: "CREATE_FOLDER",
      targetType: "folder",
      targetId: folder._id,
      targetLabel: folder.path,
      metadata: { ownerId: req.user._id.toString() },
    });

    return res.status(201).send({ success: true, message: "Folder created", folder });
  } catch (error) {
    return res.status(500).send({ success: false, message: "Error while creating folder", error: error.message });
  }
};

export const getMyFoldersController = async (req, res) => {
  try {
    const folders = await FolderModel.find({ createdBy: req.user._id, isDeleted: false })
      .select("_id name path createdAt")
      .sort({ path: 1 });
    return res.status(200).send({ success: true, folders });
  } catch (error) {
    return res.status(500).send({ success: false, message: "Error while fetching folders", error: error.message });
  }
};

export const getTrashFoldersController = async (req, res) => {
  try {
    const folders = await FolderModel.find({ createdBy: req.user._id, isDeleted: true })
      .select("_id name path createdAt deletedAt")
      .sort({ deletedAt: -1 });
    return res.status(200).send({ success: true, folders });
  } catch (error) {
    return res.status(500).send({ success: false, message: "Error while fetching trash folders", error: error.message });
  }
};

export const getFolderTreeController = async (req, res) => {
  try {
    const ownerId = req.user.role === 1 && req.query.ownerId ? req.query.ownerId : req.user._id;
    const folders = await FolderModel.find({ createdBy: ownerId, isDeleted: false })
      .select("path")
      .sort({ path: 1 });
    return res.status(200).send({ success: true, tree: buildFolderTree(folders) });
  } catch (error) {
    return res.status(500).send({ success: false, message: "Error while building folder tree", error: error.message });
  }
};

export const moveFolderController = async (req, res) => {
  try {
    const { fromPath, toPath, ownerId } = req.body;
    const sourcePath = normalizeFolderPath(fromPath, "");
    const destinationPath = normalizeFolderPath(toPath, "");

    if (!sourcePath || sourcePath === "root" || !destinationPath || destinationPath === "root") {
      return res.status(400).send({ success: false, message: "Invalid fromPath/toPath" });
    }
    if (destinationPath === sourcePath || destinationPath.startsWith(`${sourcePath}/`)) {
      return res.status(400).send({ success: false, message: "Invalid destination path" });
    }

    const targetUserId = req.user.role === 1 && ownerId ? ownerId : req.user._id;
    const sourceFolder = await FolderModel.findOne({ createdBy: targetUserId, path: sourcePath, isDeleted: false });
    if (!sourceFolder) return res.status(404).send({ success: false, message: "Source folder not found" });

    const existingTarget = await FolderModel.findOne({
      createdBy: targetUserId,
      path: destinationPath,
      isDeleted: false,
    });
    if (existingTarget) return res.status(409).send({ success: false, message: "Destination folder already exists" });

    const sourceRegex = new RegExp(`^${escapeRegex(sourcePath)}(/|$)`);
    const folders = await FolderModel.find({ createdBy: targetUserId, path: { $regex: sourceRegex } }).select("_id path");
    const files = await FileModel.find({ uploadedBy: targetUserId, folder: { $regex: sourceRegex } }).select("_id folder");

    if (folders.length) {
      await FolderModel.bulkWrite(
        folders.map((folder) => {
          const suffix = folder.path.slice(sourcePath.length);
          const newPath = `${destinationPath}${suffix}`;
          return {
            updateOne: {
              filter: { _id: folder._id },
              update: { $set: { path: newPath, name: newPath.split("/").slice(-1)[0] } },
            },
          };
        })
      );
    }

    if (files.length) {
      await FileModel.bulkWrite(
        files.map((file) => {
          const suffix = file.folder.slice(sourcePath.length);
          return {
            updateOne: {
              filter: { _id: file._id },
              update: { $set: { folder: `${destinationPath}${suffix}` } },
            },
          };
        })
      );
    }

    await createAuditLog({
      actor: req.user._id,
      action: req.user.role === 1 ? "ADMIN_MOVE_FOLDER" : "MOVE_FOLDER",
      targetType: "folder",
      targetId: sourceFolder._id,
      targetLabel: sourcePath,
      metadata: { ownerId: String(targetUserId), toPath: destinationPath },
    });

    return res.status(200).send({
      success: true,
      message: "Folder moved successfully",
      movedFolders: folders.length,
      movedFiles: files.length,
    });
  } catch (error) {
    return res.status(500).send({ success: false, message: "Error while moving folder", error: error.message });
  }
};

export const restoreFolderController = async (req, res) => {
  try {
    const { path, ownerId } = req.body;
    const folderPath = normalizeFolderPath(path, "");
    if (!folderPath || folderPath === "root") {
      return res.status(400).send({ success: false, message: "Invalid folder path" });
    }
    const targetUserId = req.user.role === 1 && ownerId ? ownerId : req.user._id;
    const deletedFolder = await FolderModel.findOne({
      createdBy: targetUserId,
      path: folderPath,
      isDeleted: true,
    });
    if (!deletedFolder) return res.status(404).send({ success: false, message: "Deleted folder not found" });

    const activeConflict = await FolderModel.findOne({
      createdBy: targetUserId,
      path: folderPath,
      isDeleted: false,
    });
    if (activeConflict) {
      return res.status(409).send({
        success: false,
        message: "An active folder with the same path already exists",
      });
    }

    const safePathRegex = escapeRegex(folderPath);
    await FolderModel.updateMany(
      { createdBy: targetUserId, path: { $regex: `^${safePathRegex}(/|$)` } },
      { $set: { isDeleted: false, deletedAt: null, deletedBy: null } }
    );
    await FileModel.updateMany(
      { uploadedBy: targetUserId, folder: { $regex: `^${safePathRegex}(/|$)` } },
      { $set: { isDeleted: false, deletedAt: null, deletedBy: null } }
    );

    return res.status(200).send({ success: true, message: "Folder restored" });
  } catch (error) {
    return res.status(500).send({ success: false, message: "Error while restoring folder", error: error.message });
  }
};

export const permanentDeleteFolderController = async (req, res) => {
  try {
    const { path, ownerId } = req.body;
    const folderPath = normalizeFolderPath(path, "");
    if (!folderPath || folderPath === "root") {
      return res.status(400).send({ success: false, message: "Invalid folder path" });
    }

    const targetUserId = req.user.role === 1 && ownerId ? ownerId : req.user._id;
    const deletedFolder = await FolderModel.findOne({
      createdBy: targetUserId,
      path: folderPath,
      isDeleted: true,
    });
    if (!deletedFolder) {
      return res.status(404).send({ success: false, message: "Deleted folder not found" });
    }

    const sourceRegex = new RegExp(`^${escapeRegex(folderPath)}(/|$)`);
    const filesInFolder = await FileModel.find({
      uploadedBy: targetUserId,
      folder: { $regex: sourceRegex },
    }).select("_id storagePath");

    const fileIds = filesInFolder.map((file) => file._id);
    let storageDeletedCount = 0;
    let storageDeleteFailedCount = 0;
    for (const file of filesInFolder) {
      try {
        const storageDeleteResult = await storageService.deleteFile(file.storagePath);
        if (storageDeleteResult?.deleted) storageDeletedCount += 1;
        else storageDeleteFailedCount += 1;
      } catch (_error) {
        storageDeleteFailedCount += 1;
      }
    }

    if (fileIds.length) {
      await ShareLinkModel.deleteMany({ file: { $in: fileIds } });
      await FileModel.deleteMany({ _id: { $in: fileIds } });
    }

    const deletedFoldersResult = await FolderModel.deleteMany({
      createdBy: targetUserId,
      path: { $regex: sourceRegex },
    });

    await createAuditLog({
      actor: req.user._id,
      action: req.user.role === 1 ? "ADMIN_PERMANENT_DELETE_FOLDER" : "PERMANENT_DELETE_FOLDER",
      targetType: "folder",
      targetId: deletedFolder._id,
      targetLabel: folderPath,
      metadata: {
        ownerId: String(targetUserId),
        deletedFolders: deletedFoldersResult.deletedCount || 0,
        deletedFiles: fileIds.length,
        storageDeletedCount,
        storageDeleteFailedCount,
      },
    });

    return res.status(200).send({
      success: true,
      message:
        storageDeleteFailedCount > 0
          ? "Folder metadata deleted. Some physical files are locked by OS"
          : "Folder permanently deleted",
      deletedFolders: deletedFoldersResult.deletedCount || 0,
      deletedFiles: fileIds.length,
      storageDeletedCount,
      storageDeleteFailedCount,
    });
  } catch (error) {
    return res.status(500).send({
      success: false,
      message: "Error while permanently deleting folder",
      error: error.message,
    });
  }
};

export const deleteFolderController = async (req, res) => {
  try {
    const { path, force = false, ownerId } = req.body;
    const folderPath = normalizeFolderPath(path, "");
    const shouldForceDelete = Boolean(force);
    const targetUserId = req.user.role === 1 && ownerId ? ownerId : req.user._id;

    if (!folderPath || folderPath === "root") {
      return res.status(400).send({ success: false, message: "Invalid folder path" });
    }

    const folder = await FolderModel.findOne({ createdBy: targetUserId, path: folderPath, isDeleted: false });
    if (!folder) return res.status(404).send({ success: false, message: "Folder not found" });

    const safePathRegex = escapeRegex(folderPath);
    const activeFileFilter = {
      uploadedBy: targetUserId,
      folder: { $regex: `^${safePathRegex}(/|$)` },
      isDeleted: false,
    };
    const activeFolderFilter = {
      createdBy: targetUserId,
      path: { $regex: `^${safePathRegex}(/|$)` },
      isDeleted: false,
    };
    const [fileCount, subFolderCount] = await Promise.all([
      FileModel.countDocuments(activeFileFilter),
      FolderModel.countDocuments({ ...activeFolderFilter, path: { $regex: `^${safePathRegex}/` } }),
    ]);

    if ((fileCount > 0 || subFolderCount > 0) && !shouldForceDelete) {
      return res.status(409).send({
        success: false,
        message: "Folder is not empty. Confirm force delete to remove all contents",
        details: { fileCount, subFolderCount },
      });
    }

    const now = new Date();
    if (shouldForceDelete) {
      await FileModel.updateMany(activeFileFilter, {
        $set: { isDeleted: true, deletedAt: now, deletedBy: req.user._id },
      });
      await FolderModel.updateMany(activeFolderFilter, {
        $set: { isDeleted: true, deletedAt: now, deletedBy: req.user._id },
      });
      await createAuditLog({
        actor: req.user._id,
        action: req.user.role === 1 ? "ADMIN_FORCE_DELETE_FOLDER" : "FORCE_DELETE_FOLDER",
        targetType: "folder",
        targetId: folder._id,
        targetLabel: folderPath,
        metadata: { ownerId: String(targetUserId), fileCount, subFolderCount },
      });
      return res.status(200).send({ success: true, message: "Folder moved to trash with all contents" });
    }

    folder.isDeleted = true;
    folder.deletedAt = now;
    folder.deletedBy = req.user._id;
    await folder.save();

    await createAuditLog({
      actor: req.user._id,
      action: req.user.role === 1 ? "ADMIN_DELETE_FOLDER" : "DELETE_FOLDER",
      targetType: "folder",
      targetId: folder._id,
      targetLabel: folderPath,
      metadata: { ownerId: String(targetUserId) },
    });

    return res.status(200).send({ success: true, message: "Folder moved to trash" });
  } catch (error) {
    return res.status(500).send({ success: false, message: "Error while deleting folder", error: error.message });
  }
};

export const createShareLinkController = async (req, res) => {
  try {
    const result = await withFileById(req.params.id, req.user, false);
    if (result.error) return res.status(result.error.status).send({ success: false, message: result.error.message });

    const file = result.file;
    const expiresInHours = Math.max(1, Math.min(24 * 30, Number(req.body.expiresInHours || 24)));
    const expiresAt = new Date(Date.now() + expiresInHours * 3600 * 1000);
    const token = crypto.randomUUID().replace(/-/g, "") + crypto.randomBytes(8).toString("hex");
    const share = await ShareLinkModel.create({ file: file._id, token, createdBy: req.user._id, expiresAt });

    const baseUrl = `${req.protocol}://${req.get("host")}`;
    return res.status(201).send({
      success: true,
      message: "Share link created",
      share: {
        _id: share._id,
        token: share.token,
        expiresAt: share.expiresAt,
        downloadUrl: `${baseUrl}/api/v1/files/shared/${share.token}/download`,
        previewUrl: `${baseUrl}/api/v1/files/shared/${share.token}/preview`,
      },
    });
  } catch (error) {
    return res.status(500).send({ success: false, message: "Error while creating share link", error: error.message });
  }
};

export const getFileShareLinksController = async (req, res) => {
  try {
    const result = await withFileById(req.params.id, req.user, true);
    if (result.error) return res.status(result.error.status).send({ success: false, message: result.error.message });
    const links = await ShareLinkModel.find({ file: req.params.id })
      .sort({ createdAt: -1 })
      .populate("createdBy", "name email role");
    return res.status(200).send({ success: true, total: links.length, links });
  } catch (error) {
    return res.status(500).send({ success: false, message: "Error while fetching share links", error: error.message });
  }
};

export const revokeShareLinkController = async (req, res) => {
  try {
    const share = await ShareLinkModel.findById(req.params.shareId).populate("file");
    if (!share || !share.file) return res.status(404).send({ success: false, message: "Share link not found" });
    if (!canAccessFile(share.file, req.user)) return res.status(403).send({ success: false, message: "Unauthorized" });

    share.revokedAt = new Date();
    await share.save();
    return res.status(200).send({ success: true, message: "Share link revoked" });
  } catch (error) {
    return res.status(500).send({ success: false, message: "Error while revoking share link", error: error.message });
  }
};

const resolveActiveShareFile = async (token) => {
  const share = await ShareLinkModel.findOne({ token }).populate("file");
  if (!share || !share.file) return { error: "Share link not found" };
  if (share.revokedAt) return { error: "Share link has been revoked" };
  if (share.expiresAt && new Date(share.expiresAt).getTime() < Date.now()) return { error: "Share link has expired" };
  if (share.file.isDeleted) return { error: "Shared file is in trash" };
  return { share, file: share.file };
};

export const sharedDownloadController = async (req, res) => {
  try {
    const localStorageError = requireLocalStorage();
    if (localStorageError) return res.status(501).send({ success: false, message: localStorageError });
    const resolved = await resolveActiveShareFile(req.params.token);
    if (resolved.error) return res.status(404).send({ success: false, message: resolved.error });
    const file = resolved.file;
    const absolutePath = storageService.getAbsolutePath(file.storagePath);
    if (!fs.existsSync(absolutePath)) return res.status(404).send({ success: false, message: "File content missing" });
    return res.download(absolutePath, file.originalFilename);
  } catch (error) {
    return res.status(500).send({ success: false, message: "Error while downloading shared file", error: error.message });
  }
};

export const sharedPreviewController = async (req, res) => {
  try {
    const localStorageError = requireLocalStorage();
    if (localStorageError) return res.status(501).send({ success: false, message: localStorageError });
    const resolved = await resolveActiveShareFile(req.params.token);
    if (resolved.error) return res.status(404).send({ success: false, message: resolved.error });
    const file = resolved.file;
    if (!isPreviewableMime(file.mimeType)) {
      return res.status(400).send({ success: false, message: "This shared file type cannot be previewed" });
    }
    const absolutePath = storageService.getAbsolutePath(file.storagePath);
    if (!fs.existsSync(absolutePath)) return res.status(404).send({ success: false, message: "File content missing" });
    res.setHeader("Content-Type", file.mimeType);
    res.setHeader("Content-Disposition", `inline; filename=\"${file.originalFilename}\"`);
    return res.sendFile(absolutePath);
  } catch (error) {
    return res.status(500).send({ success: false, message: "Error while previewing shared file", error: error.message });
  }
};
