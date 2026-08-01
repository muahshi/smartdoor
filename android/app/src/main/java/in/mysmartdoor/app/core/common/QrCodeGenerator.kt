package `in`.mysmartdoor.app.core.common

import android.graphics.Bitmap
import androidx.compose.ui.graphics.ImageBitmap
import androidx.compose.ui.graphics.asImageBitmap
import com.google.zxing.BarcodeFormat
import com.google.zxing.EncodeHintType
import com.google.zxing.qrcode.QRCodeWriter
import com.google.zxing.qrcode.decoder.ErrorCorrectionLevel

/**
 * Phase 12E.2 — PREMIUM APP IDENTITY, Task 4: encodes a link (the same
 * `PublicWebLinks.visitorPage(plate.qrSlug)` URL the physical nameplate's
 * printed QR already encodes, per
 * [in.mysmartdoor.app.ui.screens.smartplate.QrPreviewScreen]'s doc) as a
 * real scannable QR bitmap for the Premium Splash's Smart Plate card.
 *
 * zxing-core is an encode/decode library with no Android or camera
 * dependency of its own — only the `BitMatrix` → [Bitmap] conversion below
 * is Android-specific. This does not add or enable in-app QR *scanning*;
 * it only draws a code, the same passive role the printed nameplate plays.
 */
object QrCodeGenerator {

    /** @param sizePx the square bitmap's width/height in pixels. */
    fun generate(content: String, sizePx: Int = 512): ImageBitmap? {
        if (content.isBlank() || sizePx <= 0) return null

        return try {
            val hints = mapOf(EncodeHintType.ERROR_CORRECTION to ErrorCorrectionLevel.M)
            val matrix = QRCodeWriter().encode(content, BarcodeFormat.QR_CODE, sizePx, sizePx, hints)
            val bitmap = Bitmap.createBitmap(sizePx, sizePx, Bitmap.Config.ARGB_8888)
            for (x in 0 until sizePx) {
                for (y in 0 until sizePx) {
                    bitmap.setPixel(x, y, if (matrix[x, y]) BLACK else WHITE)
                }
            }
            bitmap.asImageBitmap()
        } catch (e: Exception) {
            Logger.e(message = "QR generation failed", throwable = e)
            null
        }
    }

    private const val BLACK = android.graphics.Color.BLACK
    private const val WHITE = android.graphics.Color.WHITE
}
