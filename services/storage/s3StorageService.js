import { StorageService } from "./storageService.js";

class S3StorageService extends StorageService {
  getDriverName() {
    return "s3";
  }

  async saveBuffer(_file, _userId) {
    throw new Error("S3 driver is configured but not implemented yet");
  }

  async deleteFile(_storagePath) {
    throw new Error("S3 driver is configured but not implemented yet");
  }

  getAbsolutePath(_storagePath) {
    throw new Error("S3 driver does not expose local absolute paths");
  }
}

export default new S3StorageService();
