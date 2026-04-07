import path from "path";
import { randomUUID } from "crypto";
import { DeleteObjectCommand, GetObjectCommand, PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { StorageService } from "./storageService.js";

const getS3Config = () => {
  const region = process.env.AWS_REGION;
  const bucket = process.env.AWS_S3_BUCKET;
  const accessKeyId = process.env.AWS_ACCESS_KEY_ID;
  const secretAccessKey = process.env.AWS_SECRET_ACCESS_KEY;

  if (!region) throw new Error("AWS_REGION is required when STORAGE_DRIVER=s3");
  if (!bucket) throw new Error("AWS_S3_BUCKET is required when STORAGE_DRIVER=s3");

  const credentials =
    accessKeyId && secretAccessKey ? { accessKeyId, secretAccessKey } : undefined;

  return { region, bucket, credentials };
};

class S3StorageService extends StorageService {
  constructor() {
    super();
    this._client = null;
  }

  getDriverName() {
    return "s3";
  }

  getClient() {
    if (this._client) return this._client;
    const config = getS3Config();
    this._client = new S3Client({
      region: config.region,
      credentials: config.credentials,
    });
    return this._client;
  }

  getBucket() {
    return getS3Config().bucket;
  }

  buildStorageKey(file, userId) {
    const ext = path.extname(file.originalname || "");
    const withUserPrefix = String(process.env.S3_USE_USER_PREFIX || "false").toLowerCase() === "true";
    const baseName = `${Date.now()}-${randomUUID()}${ext}`;
    if (!withUserPrefix) return baseName;

    const safeUserId = String(userId || "anonymous");
    return `${safeUserId}/${baseName}`;
  }

  async saveBuffer(file, userId) {
    if (!file?.buffer) {
      throw new Error("Invalid upload buffer");
    }

    const client = this.getClient();
    const bucket = this.getBucket();
    const key = this.buildStorageKey(file, userId);

    await client.send(
      new PutObjectCommand({
        Bucket: bucket,
        Key: key,
        Body: file.buffer,
        ContentType: file.mimetype || "application/octet-stream",
      })
    );

    return {
      storedFilename: path.basename(key),
      storagePath: key,
    };
  }

  async deleteFile(storagePath) {
    if (!storagePath) {
      return { deleted: false, reason: "empty_path" };
    }

    const client = this.getClient();
    const bucket = this.getBucket();

    try {
      await client.send(
        new DeleteObjectCommand({
          Bucket: bucket,
          Key: storagePath,
        })
      );
      return { deleted: true };
    } catch (error) {
      return { deleted: false, reason: error?.name || "delete_failed" };
    }
  }

  async getFileStream(storagePath) {
    if (!storagePath) {
      const error = new Error("Empty S3 storage path");
      error.code = "NOT_FOUND";
      throw error;
    }

    const client = this.getClient();
    const bucket = this.getBucket();
    try {
      const output = await client.send(
        new GetObjectCommand({
          Bucket: bucket,
          Key: storagePath,
        })
      );

      if (!output?.Body) {
        const error = new Error("S3 object body is empty");
        error.code = "NOT_FOUND";
        throw error;
      }

      return {
        stream: output.Body,
        contentLength: output.ContentLength,
        contentType: output.ContentType,
      };
    } catch (error) {
      const code = error?.name || error?.Code || "";
      if (code === "NoSuchKey" || code === "NotFound") {
        error.code = "NOT_FOUND";
      }
      throw error;
    }
  }

  getAbsolutePath(_storagePath) {
    throw new Error("S3 driver does not expose local absolute paths");
  }
}

export default new S3StorageService();
