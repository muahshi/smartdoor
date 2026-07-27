package in.mysmartdoor.app.core.session;

import androidx.datastore.core.DataStore;
import androidx.datastore.preferences.core.Preferences;
import dagger.internal.DaggerGenerated;
import dagger.internal.Factory;
import dagger.internal.QualifierMetadata;
import dagger.internal.ScopeMetadata;
import javax.annotation.processing.Generated;
import javax.inject.Provider;

@ScopeMetadata("javax.inject.Singleton")
@QualifierMetadata
@DaggerGenerated
@Generated(
    value = "dagger.internal.codegen.ComponentProcessor",
    comments = "https://dagger.dev"
)
@SuppressWarnings({
    "unchecked",
    "rawtypes",
    "KotlinInternal",
    "KotlinInternalInJava",
    "cast",
    "deprecation"
})
public final class SecureSessionManager_Factory implements Factory<SecureSessionManager> {
  private final Provider<DataStore<Preferences>> dataStoreProvider;

  private final Provider<KeystoreCryptoManager> cryptoProvider;

  public SecureSessionManager_Factory(Provider<DataStore<Preferences>> dataStoreProvider,
      Provider<KeystoreCryptoManager> cryptoProvider) {
    this.dataStoreProvider = dataStoreProvider;
    this.cryptoProvider = cryptoProvider;
  }

  @Override
  public SecureSessionManager get() {
    return newInstance(dataStoreProvider.get(), cryptoProvider.get());
  }

  public static SecureSessionManager_Factory create(
      Provider<DataStore<Preferences>> dataStoreProvider,
      Provider<KeystoreCryptoManager> cryptoProvider) {
    return new SecureSessionManager_Factory(dataStoreProvider, cryptoProvider);
  }

  public static SecureSessionManager newInstance(DataStore<Preferences> dataStore,
      KeystoreCryptoManager crypto) {
    return new SecureSessionManager(dataStore, crypto);
  }
}
