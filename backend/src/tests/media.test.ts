import { it, expect, vi } from "vitest";
import { PassThrough } from "node:stream";
import { CloudinaryImageStorage, cloudinary } from "../config/cloudinary";
it("uses a generated public ID instead of the untrusted original filename and maps SDK output", async () => {
  const upload = vi.spyOn(cloudinary.uploader, "upload_stream").mockImplementation(((options: unknown, callback: Function) => {
    const stream = new PassThrough();
    stream.on("finish", () => callback(null, { secure_url: "https://images.example.test/a.png", public_id: "an_huu_media/id", bytes: 12 }));
    stream.resume(); return stream;
  }) as never);
  const input = new PassThrough();
  const result = new Promise<Partial<Express.Multer.File> | undefined>((resolve, reject) =>
    new CloudinaryImageStorage()._handleFile({} as never,
      { stream: input, originalname: "unsafe&overwrite=true.png" } as unknown as Express.Multer.File,
      (error, file) => error ? reject(error) : resolve(file)));
  input.end("fake image");
  expect(await result).toMatchObject({ filename: "an_huu_media/id", size: 12 });
  expect(JSON.stringify(upload.mock.calls[0][0])).not.toContain("unsafe");
  upload.mockRestore();
});
it("returns a safe upload error without provider details", async () => {
  const upload = vi.spyOn(cloudinary.uploader, "upload_stream").mockImplementation(((_options: unknown, callback: Function) => {
    const stream = new PassThrough(); stream.on("finish", () => callback(new Error("provider-secret"))); stream.resume(); return stream;
  }) as never);
  const input = new PassThrough();
  const result = new Promise((resolve, reject) =>
    new CloudinaryImageStorage()._handleFile({} as never, { stream: input } as unknown as Express.Multer.File,
      (error, file) => error ? reject(error) : resolve(file)));
  input.end("fake");
  await expect(result).rejects.toMatchObject({ code: "MEDIA_UPLOAD_FAILED" });
  upload.mockRestore();
});
