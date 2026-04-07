import FileModel from "../models/fileModel.js";
import userModel from "../models/userModel.js";
import FolderModel from "../models/folderModel.js";
import AuditLogModel from "../models/auditLogModel.js";
import { createAuditLog } from "../services/auditLogService.js";

const resolveAdminListQuery = (req) => {
  const { q, owner, type, includeDeleted = "false", sort = "newest", page = 1, limit = 50 } =
    req.query;
  const parsedPage = Math.max(1, Number(page) || 1);
  const parsedLimit = Math.min(100, Math.max(1, Number(limit) || 50));

  const filter = {};
  if (includeDeleted !== "true") filter.isDeleted = false;
  if (q) {
    filter.$or = [
      { originalFilename: { $regex: q, $options: "i" } },
      { tags: { $elemMatch: { $regex: q, $options: "i" } } },
    ];
  }
  if (owner) filter.uploadedBy = owner;
  if (type) filter.mimeType = { $regex: `^${type}/` };

  let sortRule = { createdAt: -1 };
  if (sort === "oldest") sortRule = { createdAt: 1 };
  if (sort === "nameAsc") sortRule = { originalFilename: 1 };
  if (sort === "nameDesc") sortRule = { originalFilename: -1 };
  if (sort === "sizeAsc") sortRule = { size: 1 };
  if (sort === "sizeDesc") sortRule = { size: -1 };

  return { filter, sortRule, parsedPage, parsedLimit };
};

export const getAllFilesController = async (req, res) => {
  try {
    const { filter, sortRule, parsedPage, parsedLimit } = resolveAdminListQuery(req);
    const [files, total] = await Promise.all([
      FileModel.find(filter)
        .sort(sortRule)
        .skip((parsedPage - 1) * parsedLimit)
        .limit(parsedLimit)
        .populate("uploadedBy", "name email role"),
      FileModel.countDocuments(filter),
    ]);

    return res.status(200).send({
      success: true,
      total,
      page: parsedPage,
      limit: parsedLimit,
      totalPages: Math.max(1, Math.ceil(total / parsedLimit)),
      files,
    });
  } catch (error) {
    return res.status(500).send({
      success: false,
      message: "Error while fetching all files",
      error: error.message,
    });
  }
};

export const getAdminStatsController = async (_req, res) => {
  try {
    const [totalUsers, totalFiles, fileUsage, roleStats] = await Promise.all([
      userModel.countDocuments({}),
      FileModel.countDocuments({}),
      FileModel.aggregate([{ $group: { _id: null, totalSize: { $sum: "$size" } } }]),
      userModel.aggregate([{ $group: { _id: "$role", count: { $sum: 1 } } }]),
    ]);

    const totalStorageBytes = fileUsage[0]?.totalSize || 0;
    const usersByRole = roleStats.reduce(
      (acc, row) => {
        if (row._id === 1) acc.admins = row.count;
        else acc.users = row.count;
        return acc;
      },
      { admins: 0, users: 0 }
    );

    return res.status(200).send({
      success: true,
      stats: {
        totalUsers,
        totalFiles,
        totalStorageBytes,
        usersByRole,
      },
    });
  } catch (error) {
    return res.status(500).send({
      success: false,
      message: "Error while fetching admin stats",
      error: error.message,
    });
  }
};

export const getAllUsersController = async (_req, res) => {
  try {
    const users = await userModel
      .find({})
      .select("_id name email phone role createdAt")
      .sort({ createdAt: -1 });

    return res.status(200).send({
      success: true,
      total: users.length,
      users,
    });
  } catch (error) {
    return res.status(500).send({
      success: false,
      message: "Error while fetching users",
      error: error.message,
    });
  }
};

export const updateUserRoleController = async (req, res) => {
  try {
    const { role } = req.body;
    const requestedRole = Number(role);
    if (![0, 1].includes(requestedRole)) {
      return res.status(400).send({
        success: false,
        message: "Role must be 0 (user) or 1 (admin)",
      });
    }

    const user = await userModel.findById(req.params.id);
    if (!user) {
      return res.status(404).send({
        success: false,
        message: "User not found",
      });
    }

    const actorId = req.user._id.toString();
    const targetId = user._id.toString();
    const isSelfTarget = actorId === targetId;

    if (isSelfTarget && requestedRole === 0) {
      return res.status(400).send({
        success: false,
        message: "You cannot remove your own admin role",
      });
    }

    if (user.role === requestedRole) {
      return res.status(200).send({
        success: true,
        message: "User already has this role",
        user: {
          _id: user._id,
          name: user.name,
          email: user.email,
          role: user.role,
        },
      });
    }

    if (user.role === 1 && requestedRole === 0) {
      const totalAdmins = await userModel.countDocuments({ role: 1 });
      if (totalAdmins <= 1) {
        return res.status(400).send({
          success: false,
          message: "System must always have at least one admin",
        });
      }
    }

    const previousRole = user.role;
    user.role = requestedRole;
    await user.save();

    await createAuditLog({
      actor: req.user._id,
      action: "ADMIN_UPDATE_USER_ROLE",
      targetType: "user",
      targetId: user._id,
      targetLabel: user.email,
      metadata: {
        newRole: requestedRole,
        previousRole,
      },
    });

    return res.status(200).send({
      success: true,
      message: "User role updated",
      user: {
        _id: user._id,
        name: user.name,
        email: user.email,
        role: user.role,
      },
    });
  } catch (error) {
    return res.status(500).send({
      success: false,
      message: "Error while updating user role",
      error: error.message,
    });
  }
};

export const getAllFoldersController = async (req, res) => {
  try {
    const { owner, q, includeDeleted = "false", page = 1, limit = 50 } = req.query;
    const parsedPage = Math.max(1, Number(page) || 1);
    const parsedLimit = Math.min(100, Math.max(1, Number(limit) || 50));

    const filter = {};
    if (includeDeleted !== "true") filter.isDeleted = false;
    if (owner) filter.createdBy = owner;
    if (q) filter.path = { $regex: q, $options: "i" };

    const [folders, total] = await Promise.all([
      FolderModel.find(filter)
        .sort({ createdAt: -1 })
        .skip((parsedPage - 1) * parsedLimit)
        .limit(parsedLimit)
        .populate("createdBy", "name email role"),
      FolderModel.countDocuments(filter),
    ]);

    return res.status(200).send({
      success: true,
      total,
      page: parsedPage,
      limit: parsedLimit,
      totalPages: Math.max(1, Math.ceil(total / parsedLimit)),
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

export const getAuditLogsController = async (req, res) => {
  try {
    const { action, targetType, page = 1, limit = 50 } = req.query;
    const parsedPage = Math.max(1, Number(page) || 1);
    const parsedLimit = Math.min(100, Math.max(1, Number(limit) || 50));

    const filter = {};
    if (action) filter.action = action;
    if (targetType) filter.targetType = targetType;

    const [logs, total] = await Promise.all([
      AuditLogModel.find(filter)
        .sort({ createdAt: -1 })
        .skip((parsedPage - 1) * parsedLimit)
        .limit(parsedLimit)
        .populate("actor", "name email role"),
      AuditLogModel.countDocuments(filter),
    ]);

    return res.status(200).send({
      success: true,
      total,
      page: parsedPage,
      limit: parsedLimit,
      totalPages: Math.max(1, Math.ceil(total / parsedLimit)),
      logs,
    });
  } catch (error) {
    return res.status(500).send({
      success: false,
      message: "Error while fetching audit logs",
      error: error.message,
    });
  }
};
