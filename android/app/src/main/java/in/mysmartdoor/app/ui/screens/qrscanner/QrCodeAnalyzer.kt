package `in`.mysmartdoor.app.ui.screens.qrscanner

import `in`.mysmartdoor.app.core.common.Logger
import androidx.camera.core.ImageAnalysis
import androidx.camera.core.ImageProxy
import com.google.zxing.BarcodeFormat
import com.google.zxing.BinaryBitmap
import com.google.zxing.DecodeHintType
import com.google.zxing.MultiFormatReader
import com.google.zxing.NotFoundException
import com.google.zxing.PlanarYUVLuminanceSource
import com.google.zxing.common.HybridBinarizer
import java.util.concurrent.atomic.AtomicBoolean

/**
 * Phase 12E.10 — NATIVE QR SCANNER.
 *
 * CameraX [ImageAnalysis.Analyzer] that decodes each analyzed frame for a
 * QR code using zxing-core's [MultiFormatReader] — the exact same
 * encode/decode library [in.mysmartdoor.app.core.common.QrCodeGenerator]
 * already uses to *draw* QR codes (Phase 12E.2), reused here for the
 * inverse operation instead of adding ML Kit's separate barcode-scanning
 * dependency for the same job.
 *
 * [setPaused] gates decoding: [QrScannerScreen] flips this to `true` the
 * moment a code is found (while it shows Loading/Success/Invalid), so the
 * same frame result isn't re-triggered on every subsequent camera frame;
 * flipping it back to `false` (the "Scan Again" action) resumes decoding.
 *
 * Every analyzed [ImageProxy] is closed in a `finally` block regardless of
 * outcome — CameraX stalls the analysis pipeline if a frame is never
 * closed, which would freeze the live preview.
 */
class QrCodeAnalyzer(
    private val onQrDetected: (String) -> Unit,
) : ImageAnalysis.Analyzer {

    private val reader = MultiFormatReader().apply {
        setHints(mapOf(DecodeHintType.POSSIBLE_FORMATS to listOf(BarcodeFormat.QR_CODE)))
    }
    private val paused = AtomicBoolean(false)

    fun setPaused(value: Boolean) {
        paused.set(value)
    }

    override fun analyze(imageProxy: ImageProxy) {
        if (paused.get()) {
            imageProxy.close()
            return
        }

        try {
            val plane = imageProxy.planes[0]
            val buffer = plane.buffer
            val data = ByteArray(buffer.remaining())
            buffer.get(data)

            // rowStride can exceed the logical width (sensor padding) on
            // some devices — passed as PlanarYUVLuminanceSource's
            // dataWidth so the decoder samples the correct byte offsets
            // instead of a diagonally-skewed image.
            val rowStride = plane.rowStride
            val dataWidth = if (rowStride > 0) rowStride else imageProxy.width

            val source = PlanarYUVLuminanceSource(
                data,
                dataWidth,
                imageProxy.height,
                0,
                0,
                imageProxy.width,
                imageProxy.height,
                false,
            )
            val bitmap = BinaryBitmap(HybridBinarizer(source))
            val result = reader.decode(bitmap)
            onQrDetected(result.text)
        } catch (_: NotFoundException) {
            // Expected on almost every frame — no QR code visible yet.
        } catch (e: Exception) {
            Logger.w(message = "QR frame decode failed", throwable = e)
        } finally {
            reader.reset()
            imageProxy.close()
        }
    }
}
