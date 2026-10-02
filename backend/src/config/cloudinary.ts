import { randomUUID } from "node:crypto";
import { v2 as cloudinary } from "cloudinary";
import multer from "multer";
import type { Request } from "express";
import { AppError } from "../common/errors";
cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
});
// Small adapter for the current SDK, replacing the package pinned to vulnerable SDK v1.
export class CloudinaryImageStorage implements multer.StorageEngine {
  _handleFile(_req: Request, file: Express.Multer.File,
    callback: (error?: unknown, info?: Partial<Express.Multer.File>) => void): void {
    const stream = cloudinary.uploader.upload_stream({
      folder: "an_huu_media", public_id: randomUUID(), resource_type: "image",
      allowed_formats: ["jpg", "jpeg", "png", "webp"],
    }, (error, result) => {
      if (error || !result) return callback(new AppError(502, "MEDIA_UPLOAD_FAILED", "Không thể tải ảnh lên."));
      callback(null, { path: result.secure_url, filename: result.public_id, size: result.bytes });
    });
    file.stream.once("error", error => stream.destroy(error));
    file.stream.pipe(stream);
  }
  _removeFile(_req: Request, file: Express.Multer.File, callback: (error: Error | null) => void): void {
    cloudinary.uploader.destroy(file.filename, { resource_type: "image" })
      .then(() => callback(null)).catch(() => callback(new Error("MEDIA_DELETE_FAILED")));
  }
}
export const uploadMedia = multer({
  storage: new CloudinaryImageStorage(), limits: { fileSize: 5 * 1024 * 1024, files: 1 },
  fileFilter: (_req, file, done) => ["image/jpeg", "image/png", "image/webp"].includes(file.mimetype)
    ? done(null, true) : done(new AppError(400, "INVALID_MEDIA_TYPE", "Chỉ cho phép ảnh JPEG, PNG hoặc WebP.")),
});
export { cloudinary };
