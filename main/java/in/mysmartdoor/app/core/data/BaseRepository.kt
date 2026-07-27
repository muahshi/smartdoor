package `in`.mysmartdoor.app.core.data

import `in`.mysmartdoor.app.core.common.AppError
import `in`.mysmartdoor.app.core.common.Logger
import `in`.mysmartdoor.app.core.common.Result
import io.github.jan.supabase.exceptions.HttpRequestException
import io.github.jan.supabase.exceptions.RestException
import io.ktor.client.plugins.HttpRequestTimeoutException
import kotlinx.coroutines.withContext
import kotlinx.coroutines.CoroutineDispatcher
import kotlinx.coroutines.Dispatchers

/**
 * Base class every future feature repository extends. Provides a single
 * [safeApiCall] wrapper so exception→[AppError] mapping happens in exactly
 * one place instead of being duplicated per repository.
 *
 * No concrete repository exists yet in A1.2 — this is the base interface
 * future phases (visitor feed, calling, commerce) implement against.
 */
abstract class BaseRepository(
    private val ioDispatcher: CoroutineDispatcher = Dispatchers.IO,
) : Repository {

    protected suspend fun <T> safeApiCall(block: suspend () -> T): Result<T> =
        withContext(ioDispatcher) {
            try {
                Result.Success(block())
            } catch (e: HttpRequestTimeoutException) {
                Logger.e(message = "Request timed out", throwable = e)
                Result.Error(AppError.Timeout(cause = e))
            } catch (e: RestException) {
                Logger.e(message = "Server rejected request: ${e.message}", throwable = e)
                Result.Error(AppError.Server(message = e.message ?: "Server error", cause = e))
            } catch (e: HttpRequestException) {
                Logger.e(message = "Network request failed", throwable = e)
                Result.Error(AppError.Network(cause = e))
            } catch (e: Exception) {
                Logger.e(message = "Unexpected error", throwable = e)
                Result.Error(AppError.Unknown(message = e.message ?: "Unexpected error", cause = e))
            }
        }
}
