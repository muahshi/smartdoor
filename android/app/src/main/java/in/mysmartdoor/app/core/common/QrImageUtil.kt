package `in`.mysmartdoor.app.core.common

import android.content.ContentValues
import android.content.Context
import android.content.Intent
import android.graphics.Bitmap
import android.os.Build
import android.os.Environment
import android.provider.MediaStore
import androidx.compose.ui.graphics.ImageBitmap
import androidx.compose.ui.graphics.asAndroidBitmap
import androidx.core.content.FileProvider
import java.io.File
import java.io.FileOutputStream

/**
 * Phase 12E.8 — PREMIUM SMART PLATE ECOSYSTEM: Share/Download actions for
 * the QR bitmap [QrCodeGenerator] already produces. Purely a delivery
 * mechanism for an existing image — no new QR-encoding logic, no backend
 * call. Two independent actions:
 *
 * - [share] writes the PNG to app cache and hands it to the system share
 *   sheet via [FileProvider] (see `res/xml/file_paths.xml` and the
 *   `<provider>` entry in `AndroidManifest.xml`).
 * - [saveToGallery] inserts the PNG into [MediaStore.Images] so it lands in
 *   the device's Pictures/SmartDoor folder, the same "save for printing"
 *   action a physical nameplate's QR naturally invites.
 *
 * Both return a simple success [Boolean] rather than throwing — callers
 * (QrPreviewScreen) surface failure via a snackbar instead of crashing the
 * screen over a share-sheet/storage edge case.
 */
object QrImageUtil {

    private const val MIME_PNG = "image/png"

    fun share(context: Context, imageBitmap: ImageBitmap, fileLabel: String, linkText: String): Boolean {
        return try {
            val cacheDir = File(context.cacheDir, "shared_qr").apply { mkdirs() }
            val file = File(cacheDir, "$fileLabel.png")
            FileOutputStream(file).use { out ->
                imageBitmap.asAndroidBitmap().compress(Bitmap.CompressFormat.PNG, 100, out)
            }
            val uri = FileProvider.getUriForFile(context, "${context.packageName}.fileprovider", file)
            val intent = Intent(Intent.ACTION_SEND).apply {
                type = MIME_PNG
                putExtra(Intent.EXTRA_STREAM, uri)
                putExtra(Intent.EXTRA_TEXT, linkText)
                addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION)
            }
            context.startActivity(Intent.createChooser(intent, "Share Smart Plate QR"))
            true
        } catch (e: Exception) {
            Logger.e(message = "QR share failed", throwable = e)
            false
        }
    }

    /**
     * Saves into the device gallery (Pictures/SmartDoor). On API 26-28
     * (pre-scoped-storage) this requires WRITE_EXTERNAL_STORAGE to already
     * be granted — [in.mysmartdoor.app.ui.screens.smartplate.QrPreviewScreen]
     * requests it before calling this on those API levels. On API 29+ no
     * permission is needed for a MediaStore insert into the app's own
     * collection.
     */
    fun saveToGallery(context: Context, imageBitmap: ImageBitmap, fileLabel: String): Boolean {
        return try {
            val bitmap = imageBitmap.asAndroidBitmap()
            val resolver = context.contentResolver
            val values = ContentValues().apply {
                put(MediaStore.Images.Media.DISPLAY_NAME, fileLabel)
                put(MediaStore.Images.Media.MIME_TYPE, MIME_PNG)
                if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
                    put(MediaStore.Images.Media.RELATIVE_PATH, "${Environment.DIRECTORY_PICTURES}/SmartDoor")
                    put(MediaStore.Images.Media.IS_PENDING, 1)
                }
            }
            val uri = resolver.insert(MediaStore.Images.Media.EXTERNAL_CONTENT_URI, values) ?: return false
            val written = resolver.openOutputStream(uri)?.use { out ->
                bitmap.compress(Bitmap.CompressFormat.PNG, 100, out)
            } ?: false
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
                resolver.update(uri, ContentValues().apply { put(MediaStore.Images.Media.IS_PENDING, 0) }, null, null)
            }
            written
        } catch (e: Exception) {
            Logger.e(message = "QR save-to-gallery failed", throwable = e)
            false
        }
    }
}
