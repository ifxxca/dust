package com.retailpickup.mobile.dev;

import android.graphics.Bitmap;
import android.graphics.BitmapFactory;
import android.graphics.Matrix;
import android.media.ExifInterface;
import java.io.ByteArrayInputStream;
import java.io.ByteArrayOutputStream;
import java.io.IOException;

final class MobileImagePreview {
    static final class Result {
        final byte[] bytes;
        final String mime;
        final int width, height, sampledBytes;
        Result(byte[] bytes, String mime, int width, int height, int sampledBytes) {
            this.bytes = bytes; this.mime = mime; this.width = width; this.height = height; this.sampledBytes = sampledBytes;
        }
    }
    static Result create(byte[] original, boolean thumbnail) throws IOException {
        int edge = thumbnail ? 512 : 1600;
        BitmapFactory.Options options = new BitmapFactory.Options();
        options.inJustDecodeBounds = true;
        BitmapFactory.decodeByteArray(original, 0, original.length, options);
        if (options.outWidth <= 0 || options.outHeight <= 0 || !java.util.Arrays.asList("image/jpeg", "image/png", "image/webp").contains(options.outMimeType)) throw new IOException("PREVIEW_IMAGE_INVALID");
        String mime = options.outMimeType;
        int sample = 1;
        while (((long)Math.max(options.outWidth, options.outHeight) + sample - 1) / sample > edge) sample *= 2;
        options.inSampleSize = sample;
        options.inJustDecodeBounds = false;
        options.inPreferredConfig = Bitmap.Config.ARGB_8888;
        Bitmap bitmap = BitmapFactory.decodeByteArray(original, 0, original.length, options);
        if (bitmap == null) throw new IOException("PREVIEW_DECODE_FAILED");
        try {
            int sampledBytes = bitmap.getAllocationByteCount();
            int orientation = ExifInterface.ORIENTATION_NORMAL;
            try { orientation = new ExifInterface(new ByteArrayInputStream(original)).getAttributeInt(ExifInterface.TAG_ORIENTATION, ExifInterface.ORIENTATION_NORMAL); }
            catch (IOException ignored) { }
            Matrix matrix = new Matrix();
            switch (orientation) {
                case ExifInterface.ORIENTATION_FLIP_HORIZONTAL: matrix.setScale(-1, 1); break;
                case ExifInterface.ORIENTATION_ROTATE_180: matrix.setRotate(180); break;
                case ExifInterface.ORIENTATION_FLIP_VERTICAL: matrix.setScale(1, -1); break;
                case ExifInterface.ORIENTATION_TRANSPOSE: matrix.setRotate(90); matrix.postScale(-1, 1); break;
                case ExifInterface.ORIENTATION_ROTATE_90: matrix.setRotate(90); break;
                case ExifInterface.ORIENTATION_TRANSVERSE: matrix.setRotate(270); matrix.postScale(-1, 1); break;
                case ExifInterface.ORIENTATION_ROTATE_270: matrix.setRotate(270); break;
                default: break;
            }
            if (!matrix.isIdentity()) {
                Bitmap rotated = Bitmap.createBitmap(bitmap, 0, 0, bitmap.getWidth(), bitmap.getHeight(), matrix, true);
                if (rotated != bitmap) { bitmap.recycle(); bitmap = rotated; }
            }
            ByteArrayOutputStream output = new ByteArrayOutputStream();
            Bitmap.CompressFormat format = "image/jpeg".equals(mime) ? Bitmap.CompressFormat.JPEG : "image/png".equals(mime) ? Bitmap.CompressFormat.PNG : Bitmap.CompressFormat.WEBP;
            if (!bitmap.compress(format, thumbnail ? 80 : 90, output)) throw new IOException("PREVIEW_ENCODE_FAILED");
            return new Result(output.toByteArray(), mime, bitmap.getWidth(), bitmap.getHeight(), sampledBytes);
        } finally { bitmap.recycle(); }
    }
}
