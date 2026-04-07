import mongoose from "mongoose";

const fileSchema = new mongoose.Schema(
  {
    originalFilename: {
      type: String,
      required: true,
      trim: true,
    },
    storedFilename: {
      type: String,
      required: true,
      unique: true,
      trim: true,
    },
    storagePath: {
      type: String,
      required: true,
      trim: true,
    },
    size: {
      type: Number,
      required: true,
    },
    mimeType: {
      type: String,
      required: true,
      trim: true,
    },
    uploadedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "users",
      required: true,
      index: true,
    },
    folder: {
      type: String,
      default: "root",
      trim: true,
      index: true,
    },
    tags: {
      type: [String],
      default: [],
    },
    isStarred: {
      type: Boolean,
      default: false,
    },
    visibility: {
      type: String,
      enum: ["private", "public"],
      default: "private",
    },
    isDeleted: {
      type: Boolean,
      default: false,
      index: true,
    },
    deletedAt: {
      type: Date,
      default: null,
    },
    deletedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "users",
      default: null,
    },
  },
  { timestamps: true }
);

export default mongoose.model("files", fileSchema);
