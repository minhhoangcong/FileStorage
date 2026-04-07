import fs from "fs";
import path from "path";
import { randomUUID } from "crypto";
import { StorageService } from "./storageService.js";

const uploadsDir = path.resolve("uploads");

if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir, { recursive: true });
}

class LocalStorageService extends StorageService {
  getDriverName() {
    return "local";
  }

  isLocal() {
    return true;
  }

  async saveBuffer(file, userId) {
    const ext = path.extname(file.originalname || "");
    const storedFilename = `${Date.now()}-${userId}-${randomUUID()}${ext}`;
    const absolutePath = path.join(uploadsDir, storedFilename);

    await fs.promises.writeFile(absolutePath, file.buffer);

    return {
      storedFilename,
      storagePath: storedFilename,
    };
  }

  async deleteFile(storagePath) {
    const absolutePath = this.getAbsolutePath(storagePath);
    if (!fs.existsSync(absolutePath)) {
      return { deleted: false, reason: "not_found" };
    }

    const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
    for (let i = 0; i < 3; i += 1) {
      try {
        await fs.promises.unlink(absolutePath);
        return { deleted: true };
      } catch (error) {
        const code = error?.code || "";
        const isLockError = code === "EPERM" || code === "EBUSY";
        if (isLockError && i < 2) {
          await sleep(120);
          continue;
        }
        if (isLockError) {
          return { deleted: false, reason: code };
        }
        throw error;
      }
    }

    return { deleted: false, reason: "unknown" };
  }

  async getFileStream(storagePath) {
    const absolutePath = this.getAbsolutePath(storagePath);
    if (!fs.existsSync(absolutePath)) {
      const error = new Error("File not found on local storage");
      error.code = "NOT_FOUND";
      throw error;
    }

    const stat = await fs.promises.stat(absolutePath);
    return {
      stream: fs.createReadStream(absolutePath),
      contentLength: stat.size,
    };
  }

  getAbsolutePath(storagePath) {
    return path.join(uploadsDir, storagePath);
  }
}

export default new LocalStorageService();
