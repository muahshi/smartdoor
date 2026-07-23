package `in`.mysmartdoor.app.core.data

/**
 * Marker interface for all repositories in the app. Lets Hilt/DI code and
 * future generic tooling (e.g. a repository registry, sync coordinator)
 * refer to "a repository" without depending on any concrete feature module.
 *
 * [BaseRepository] is the concrete abstract base most repositories extend;
 * this interface exists separately so a repository that doesn't need
 * [BaseRepository]'s safeApiCall (e.g. a pure local-cache repository) can
 * still implement [Repository].
 */
interface Repository
