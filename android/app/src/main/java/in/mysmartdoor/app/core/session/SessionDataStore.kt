package `in`.mysmartdoor.app.core.session

import android.content.Context
import androidx.datastore.preferences.preferencesDataStore

/**
 * Single DataStore<Preferences> instance for session data, scoped via the
 * standard `by preferencesDataStore(...)` delegate so there is exactly one
 * file/instance for the process lifetime — matches [in.mysmartdoor.app.core.di.DataStoreModule],
 * which is the only place this extension is referenced.
 */
val Context.sessionDataStore by preferencesDataStore(name = "smartdoor_session")
