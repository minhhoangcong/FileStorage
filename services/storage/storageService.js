export class StorageService {
  getDriverName() {
    return "unknown";
  }

  isLocal() {
    return false;
  }

  async saveBuffer(_file, _userId) {
    throw new Error("saveBuffer() must be implemented");
  }

  async deleteFile(_storagePath) {
    throw new Error("deleteFile() must be implemented");
  }

  getAbsolutePath(_storagePath) {
    throw new Error("getAbsolutePath() must be implemented");
  }
}
