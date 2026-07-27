package in.mysmartdoor.app.core.data;

import dagger.internal.DaggerGenerated;
import dagger.internal.Factory;
import dagger.internal.QualifierMetadata;
import dagger.internal.ScopeMetadata;
import in.mysmartdoor.app.core.config.EnvironmentConfig;
import in.mysmartdoor.app.core.session.SecureSessionManager;
import io.github.jan.supabase.SupabaseClient;
import javax.annotation.processing.Generated;
import javax.inject.Provider;
import kotlinx.serialization.json.Json;

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
public final class AuthRepository_Factory implements Factory<AuthRepository> {
  private final Provider<SupabaseClient> clientProvider;

  private final Provider<Json> jsonProvider;

  private final Provider<SecureSessionManager> sessionManagerProvider;

  private final Provider<EnvironmentConfig> environmentConfigProvider;

  public AuthRepository_Factory(Provider<SupabaseClient> clientProvider,
      Provider<Json> jsonProvider, Provider<SecureSessionManager> sessionManagerProvider,
      Provider<EnvironmentConfig> environmentConfigProvider) {
    this.clientProvider = clientProvider;
    this.jsonProvider = jsonProvider;
    this.sessionManagerProvider = sessionManagerProvider;
    this.environmentConfigProvider = environmentConfigProvider;
  }

  @Override
  public AuthRepository get() {
    return newInstance(clientProvider.get(), jsonProvider.get(), sessionManagerProvider.get(), environmentConfigProvider.get());
  }

  public static AuthRepository_Factory create(Provider<SupabaseClient> clientProvider,
      Provider<Json> jsonProvider, Provider<SecureSessionManager> sessionManagerProvider,
      Provider<EnvironmentConfig> environmentConfigProvider) {
    return new AuthRepository_Factory(clientProvider, jsonProvider, sessionManagerProvider, environmentConfigProvider);
  }

  public static AuthRepository newInstance(SupabaseClient client, Json json,
      SecureSessionManager sessionManager, EnvironmentConfig environmentConfig) {
    return new AuthRepository(client, json, sessionManager, environmentConfig);
  }
}
