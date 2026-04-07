import path from "path";
import multer from "multer";

const allowedMimeExact = new Set([
  "application/pdf",
  "application/zip",
  "application/x-zip-compressed",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/vnd.ms-excel",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "application/vnd.ms-powerpoint",
  "application/vnd.openxmlformats-officedocument.presentationml.presentation",
]);

const allowedExt = new Set([
  ".jpg",
  ".jpeg",
  ".png",
  ".gif",
  ".webp",
  ".heic",
  ".pdf",
  ".txt",
  ".doc",
  ".docx",
  ".xls",
  ".xlsx",
  ".ppt",
  ".pptx",
  ".mp4",
  ".mov",
  ".mkv",
  ".webm",
  ".mp3",
  ".wav",
  ".zip",
]);

const isAllowedFile = (file) => {
  if (
    file.mimetype.startsWith("image/") ||
    file.mimetype.startsWith("video/") ||
    file.mimetype.startsWith("audio/") ||
    file.mimetype.startsWith("text/")
  ) {
    return true;
  }
  if (allowedMimeExact.has(file.mimetype)) {
    return true;
  }
  const ext = path.extname(file.originalname || "").toLowerCase();
  return allowedExt.has(ext);
};

const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 80 * 1024 * 1024, // 80MB
  },
  fileFilter: (_req, file, cb) => {
    if (isAllowedFile(file)) {
      return cb(null, true);
    }
    return cb(
      new Error(
        `File type not allowed: ${file.mimetype || "unknown"} (${file.originalname})`
      )
    );
  },
});

export const uploadFiles = upload.fields([
  { name: "file", maxCount: 1 },
  { name: "files", maxCount: 20 },
]);
