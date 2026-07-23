package `in`.mysmartdoor.app.core.common

/**
 * Common outcome wrapper for repository / use-case calls across the app.
 *
 * Not consumed anywhere yet in A1.2 — [in.mysmartdoor.app.core.data.BaseRepository]
 * is the first (and only) internal caller, and it isn't invoked by any
 * screen until authentication lands.
 */
sealed class Result<out T> {
    data object Loading : Result<Nothing>()
    data class Success<out T>(val data: T) : Result<T>()
    data class Error(val error: AppError) : Result<Nothing>()

    inline fun onSuccess(action: (T) -> Unit): Result<T> {
        if (this is Success) action(data)
        return this
    }

    inline fun onError(action: (AppError) -> Unit): Result<T> {
        if (this is Error) action(error)
        return this
    }

    fun getOrNull(): T? = (this as? Success)?.data
}
