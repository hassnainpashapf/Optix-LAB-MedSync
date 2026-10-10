package com.optix.labmedsync.offlinecache;

import android.security.keystore.KeyGenParameterSpec;
import android.security.keystore.KeyProperties;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

import java.io.File;
import java.io.FileInputStream;
import java.io.FileOutputStream;
import java.nio.charset.StandardCharsets;
import java.security.KeyStore;
import java.util.Arrays;

import javax.crypto.Cipher;
import javax.crypto.KeyGenerator;
import javax.crypto.SecretKey;
import javax.crypto.spec.GCMParameterSpec;

@CapacitorPlugin(name = "OfflineCache")
public class OfflineCachePlugin extends Plugin {
    private static final String KEY_ALIAS = "optix_patient_portal_cache";
    private static final String CACHE_FILE = "patient-portal-cache.enc";
    private static final int MAX_BYTES = 2 * 1024 * 1024;
    private static final int IV_BYTES = 12;
    private static final int TAG_BITS = 128;

    @PluginMethod
    public void save(PluginCall call) {
        String cacheKey = call.getString("key", "");
        String value = call.getString("value", "");
        if (cacheKey.isEmpty() || value.isEmpty()) {
            call.reject("Cache key and value are required.");
            return;
        }
        byte[] plain = (cacheKey + "\n" + value).getBytes(StandardCharsets.UTF_8);
        if (plain.length > MAX_BYTES) {
            call.reject("The patient portal cache is too large.");
            return;
        }
        try {
            Cipher cipher = Cipher.getInstance("AES/GCM/NoPadding");
            cipher.init(Cipher.ENCRYPT_MODE, getOrCreateKey());
            byte[] iv = cipher.getIV();
            byte[] encrypted = cipher.doFinal(plain);
            byte[] stored = new byte[iv.length + encrypted.length];
            System.arraycopy(iv, 0, stored, 0, iv.length);
            System.arraycopy(encrypted, 0, stored, iv.length, encrypted.length);
            File file = new File(getContext().getNoBackupFilesDir(), CACHE_FILE);
            File temp = new File(file.getParentFile(), CACHE_FILE + ".tmp");
            try (FileOutputStream output = new FileOutputStream(temp)) {
                output.write(stored);
                output.getFD().sync();
            }
            if (file.exists() && !file.delete()) throw new Exception("Could not replace the offline cache.");
            if (!temp.renameTo(file)) throw new Exception("Could not save the encrypted offline cache.");
            Arrays.fill(stored, (byte) 0);
            call.resolve();
        } catch (Exception e) {
            call.reject("Could not encrypt the offline portal cache.", e);
        } finally {
            Arrays.fill(plain, (byte) 0);
        }
    }

    @PluginMethod
    public void load(PluginCall call) {
        String cacheKey = call.getString("key", "");
        File file = new File(getContext().getNoBackupFilesDir(), CACHE_FILE);
        if (cacheKey.isEmpty() || !file.isFile()) {
            call.resolve(new JSObject());
            return;
        }
        byte[] stored = null;
        byte[] plain = null;
        try {
            if (file.length() > MAX_BYTES + IV_BYTES + 16) {
                clearFile(file);
                call.resolve(new JSObject());
                return;
            }
            stored = new byte[(int) file.length()];
            try (FileInputStream input = new FileInputStream(file)) {
                int offset = 0;
                while (offset < stored.length) {
                    int count = input.read(stored, offset, stored.length - offset);
                    if (count < 0) throw new Exception("The offline cache could not be read completely.");
                    offset += count;
                }
            }
            if (stored.length <= IV_BYTES + 16 || stored.length > MAX_BYTES + IV_BYTES + 16) {
                clearFile(file);
                call.resolve(new JSObject());
                return;
            }
            byte[] iv = Arrays.copyOfRange(stored, 0, IV_BYTES);
            byte[] encrypted = Arrays.copyOfRange(stored, IV_BYTES, stored.length);
            Cipher cipher = Cipher.getInstance("AES/GCM/NoPadding");
            cipher.init(Cipher.DECRYPT_MODE, getOrCreateKey(), new GCMParameterSpec(TAG_BITS, iv));
            plain = cipher.doFinal(encrypted);
            String decoded = new String(plain, StandardCharsets.UTF_8);
            String prefix = cacheKey + "\n";
            JSObject result = new JSObject();
            if (decoded.startsWith(prefix)) result.put("value", decoded.substring(prefix.length()));
            call.resolve(result);
        } catch (Exception e) {
            call.reject("Could not decrypt the offline portal cache.", e);
        } finally {
            if (stored != null) Arrays.fill(stored, (byte) 0);
            if (plain != null) Arrays.fill(plain, (byte) 0);
        }
    }

    @PluginMethod
    public void clear(PluginCall call) {
        try {
            clearFile(new File(getContext().getNoBackupFilesDir(), CACHE_FILE));
            KeyStore keyStore = KeyStore.getInstance("AndroidKeyStore");
            keyStore.load(null);
            if (keyStore.containsAlias(KEY_ALIAS)) keyStore.deleteEntry(KEY_ALIAS);
            call.resolve();
        } catch (Exception e) {
            call.reject("Could not clear the offline portal cache.", e);
        }
    }

    private SecretKey getOrCreateKey() throws Exception {
        KeyStore keyStore = KeyStore.getInstance("AndroidKeyStore");
        keyStore.load(null);
        if (keyStore.containsAlias(KEY_ALIAS)) {
            return ((KeyStore.SecretKeyEntry) keyStore.getEntry(KEY_ALIAS, null)).getSecretKey();
        }
        KeyGenerator generator = KeyGenerator.getInstance(KeyProperties.KEY_ALGORITHM_AES, "AndroidKeyStore");
        generator.init(new KeyGenParameterSpec.Builder(KEY_ALIAS,
                KeyProperties.PURPOSE_ENCRYPT | KeyProperties.PURPOSE_DECRYPT)
                .setBlockModes(KeyProperties.BLOCK_MODE_GCM)
                .setEncryptionPaddings(KeyProperties.ENCRYPTION_PADDING_NONE)
                .setRandomizedEncryptionRequired(true)
                .build());
        return generator.generateKey();
    }

    private void clearFile(File file) throws Exception {
        if (file.exists() && !file.delete()) throw new Exception("Could not remove the encrypted cache file.");
    }
}
