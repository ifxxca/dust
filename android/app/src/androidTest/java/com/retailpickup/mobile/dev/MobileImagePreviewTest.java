package com.retailpickup.mobile.dev;

import android.graphics.Bitmap;
import android.graphics.BitmapFactory;
import android.graphics.Color;
import android.media.ExifInterface;
import androidx.test.ext.junit.runners.AndroidJUnit4;
import androidx.test.platform.app.InstrumentationRegistry;
import org.junit.Test;
import org.junit.runner.RunWith;
import java.io.*;
import java.nio.ByteBuffer;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.util.zip.CRC32;
import java.util.zip.Deflater;
import java.util.zip.DeflaterOutputStream;
import static org.junit.Assert.*;

@RunWith(AndroidJUnit4.class)
public class MobileImagePreviewTest {
    private static void chunk(DataOutputStream output, String type, byte[] data) throws IOException {
        byte[] name = type.getBytes(StandardCharsets.US_ASCII);
        CRC32 crc = new CRC32(); crc.update(name); crc.update(data);
        output.writeInt(data.length); output.write(name); output.write(data); output.writeInt((int)crc.getValue());
    }
    private static byte[] largePhoto() throws IOException {
        ByteArrayOutputStream compressed = new ByteArrayOutputStream();
        byte[] row = new byte[12000 * 3 + 1];
        try (DeflaterOutputStream image = new DeflaterOutputStream(compressed, new Deflater(1))) {
            for (int y = 0; y < 8000; y++) image.write(row);
        }
        ByteArrayOutputStream bytes = new ByteArrayOutputStream();
        DataOutputStream png = new DataOutputStream(bytes);
        png.write(new byte[]{(byte)137,80,78,71,13,10,26,10});
        chunk(png,"IHDR",ByteBuffer.allocate(13).putInt(12000).putInt(8000).put(new byte[]{8,2,0,0,0}).array());
        chunk(png,"IDAT",compressed.toByteArray());chunk(png,"IEND",new byte[0]);
        return bytes.toByteArray();
    }
    @Test public void hugePhotoUsesSampledDecodeAndLeavesEncryptedOriginalUnchanged() throws Exception {
        byte[] photo = largePhoto();
        assertTrue(photo.length < 5 * 1024 * 1024);
        byte[] hash = MessageDigest.getInstance("SHA-256").digest(photo);
        MobileLocalStore store = new MobileLocalStore(InstrumentationRegistry.getInstrumentation().getTargetContext());
        String scope = "preview-performance-test", name = "evidence-large-preview-test";
        store.write(scope,name,photo);
        try {
            long started=android.os.SystemClock.elapsedRealtime();
            MobileImagePreview.Result thumbnail=MobileImagePreview.create(store.read(scope,name),true);
            assertEquals(375,thumbnail.width);assertEquals(250,thumbnail.height);
            assertTrue(thumbnail.sampledBytes <= 512 * 512 * 4);
            long thumbnailMs=android.os.SystemClock.elapsedRealtime()-started;
            MobileImagePreview.Result fullscreen=MobileImagePreview.create(store.read(scope,name),false);
            assertEquals(1500,fullscreen.width);assertEquals(1000,fullscreen.height);
            assertTrue(fullscreen.sampledBytes <= 1600 * 1600 * 4);
            assertArrayEquals(hash,MessageDigest.getInstance("SHA-256").digest(store.read(scope,name)));
            android.util.Log.i("RetailPreviewTest","96MP photo: thumbnailMs="+thumbnailMs+", thumbnailDecodedBytes="+thumbnail.sampledBytes+", fullscreenDecodedBytes="+fullscreen.sampledBytes+", originalBytes="+photo.length);
        } finally { store.remove(scope,name); }
    }
    @Test public void previewRespectsExifRotationWithoutRewritingEvidence() throws Exception {
        File photo=File.createTempFile("preview-rotation-",".jpg",InstrumentationRegistry.getInstrumentation().getTargetContext().getCacheDir());
        Bitmap image=Bitmap.createBitmap(640,320,Bitmap.Config.ARGB_8888);image.eraseColor(Color.BLUE);
        try {
            try(FileOutputStream output=new FileOutputStream(photo)){image.compress(Bitmap.CompressFormat.JPEG,90,output);}image.recycle();
            ExifInterface exif=new ExifInterface(photo.getAbsolutePath());exif.setAttribute(ExifInterface.TAG_ORIENTATION,"6");exif.saveAttributes();
            byte[] original=java.nio.file.Files.readAllBytes(photo.toPath());
            MobileImagePreview.Result preview=MobileImagePreview.create(original,true);
            assertEquals(160,preview.width);assertEquals(320,preview.height);
            assertArrayEquals(original,java.nio.file.Files.readAllBytes(photo.toPath()));
        }finally{photo.delete();}
    }
    @Test public void pngPreviewRetainsTransparencyAndAspectRatio() throws Exception {
        Bitmap image=Bitmap.createBitmap(300,200,Bitmap.Config.ARGB_8888);image.eraseColor(Color.TRANSPARENT);image.setPixel(150,100,Color.BLACK);
        ByteArrayOutputStream bytes=new ByteArrayOutputStream();image.compress(Bitmap.CompressFormat.PNG,100,bytes);image.recycle();
        MobileImagePreview.Result result=MobileImagePreview.create(bytes.toByteArray(),true);
        assertEquals("image/png",result.mime);assertEquals(300,result.width);assertEquals(200,result.height);
        Bitmap decoded=BitmapFactory.decodeByteArray(result.bytes,0,result.bytes.length);
        try{assertEquals(0,Color.alpha(decoded.getPixel(0,0)));assertEquals(Color.BLACK,decoded.getPixel(150,100));}finally{decoded.recycle();}
    }
    @Test public void corruptImageFailsWithoutFabricatingAThumbnail() throws Exception {
        try{MobileImagePreview.create(new byte[]{1,2,3},true);fail("Corrupt photo must be rejected");}catch(IOException expected){assertEquals("PREVIEW_IMAGE_INVALID",expected.getMessage());}
    }
}
