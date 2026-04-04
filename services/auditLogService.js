import AuditLogModel from "../models/auditLogModel.js";

export const createAuditLog = async ({
  actor,
  action,
  targetType,
  targetId = null,
  targetLabel = "",
  metadata = {},
}) => {
  try {
    await AuditLogModel.create({
      actor,
      action,
      targetType,
      targetId,
      targetLabel,
      metadata,
    });
  } catch (error) {
    console.warn(`[AUDIT] Failed to write log: ${error.message}`);
  }
};
