package `in`.mysmartdoor.app.ui.screens.qrscanner

import `in`.mysmartdoor.app.core.config.PublicWebLinks
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.MutableSharedFlow
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.SharedFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asSharedFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch
import javax.inject.Inject

/**
 * Phase 12E.10 — NATIVE QR SCANNER. State machine for a single scan
 * attempt on [QrScannerScreen].
 */
sealed interface QrScanResult {
    /** Camera live, no code decoded yet — [QrCodeAnalyzer] keeps analyzing frames. */
    data object Scanning : QrScanResult

    /** A code was decoded; briefly shown while it's validated. */
    data class Loading(val rawValue: String) : QrScanResult

    /** [rawValue] matched a My Smart Door visitor-page URL. */
    data class Success(val visitorUrl: String) : QrScanResult

    /** [rawValue] decoded fine but isn't a My Smart Door QR code. */
    data class Invalid(val rawValue: String) : QrScanResult
}

/**
 * Phase 12E.10 — NATIVE QR SCANNER.
 *
 * Owns the scan result state only — the camera lifecycle, permission, and
 * hardware-availability handling all live in [QrScannerScreen] itself
 * since those are Compose/Android-framework concerns, not app data. No new
 * repository: validating a scanned code is pure string matching against
 * [PublicWebLinks.matchVisitorSlug] (the same URL shape
 * [PublicWebLinks.visitorPage] already produces for QrPreview/SmartPlate),
 * and opening the result reuses the existing
 * [in.mysmartdoor.app.core.common.rememberWebLinkLauncher] ACTION_VIEW
 * flow — no new visitor-detail screen, no backend call.
 */
@HiltViewModel
class QrScannerViewModel @Inject constructor() : ViewModel() {

    private val _scanResult = MutableStateFlow<QrScanResult>(QrScanResult.Scanning)
    val scanResult: StateFlow<QrScanResult> = _scanResult.asStateFlow()

    /** One-shot: emitted once per successful scan, after the Success state has had a moment to show. */
    private val _openVisitorLink = MutableSharedFlow<String>(extraBufferCapacity = 1)
    val openVisitorLink: SharedFlow<String> = _openVisitorLink.asSharedFlow()

    /** A short, deliberate pause so "Checking code…" is perceptible — not a network wait. */
    private val validationDelayMs = 450L

    /** How long the success checkmark animates before the browser opens. */
    private val successDwellMs = 650L

    fun onQrDetected(rawValue: String) {
        if (_scanResult.value !is QrScanResult.Scanning) return // already handling a result

        _scanResult.value = QrScanResult.Loading(rawValue)

        viewModelScope.launch {
            delay(validationDelayMs)
            val slug = PublicWebLinks.matchVisitorSlug(rawValue)
            if (slug == null) {
                _scanResult.value = QrScanResult.Invalid(rawValue)
                return@launch
            }

            val visitorUrl = PublicWebLinks.visitorPage(slug)
            _scanResult.value = QrScanResult.Success(visitorUrl)
            delay(successDwellMs)
            _openVisitorLink.emit(visitorUrl)
        }
    }

    /** "Scan Again" action from the Invalid state — resumes live decoding. */
    fun reset() {
        _scanResult.value = QrScanResult.Scanning
    }
}
