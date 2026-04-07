import localStorageService from "./localStorageService.js";
import s3StorageService from "./s3StorageService.js";

const STORAGE_DRIVER = (process.env.STORAGE_DRIVER || "local").toLowerCase();

const resolveStorageService = () => {
  if (STORAGE_DRIVER === "local") return localStorageService;
  if (STORAGE_DRIVER === "s3") return s3StorageService;
  throw new Error(`Unsupported STORAGE_DRIVER: ${STORAGE_DRIVER}`);
};

const storageService = resolveStorageService();

export { STORAGE_DRIVER };
export default storageService;
