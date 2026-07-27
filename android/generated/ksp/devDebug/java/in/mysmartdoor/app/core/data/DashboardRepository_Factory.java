package in.mysmartdoor.app.core.data;

import dagger.internal.DaggerGenerated;
import dagger.internal.Factory;
import dagger.internal.QualifierMetadata;
import dagger.internal.ScopeMetadata;
import in.mysmartdoor.app.core.session.SecureSessionManager;
import io.github.jan.supabase.SupabaseClient;
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
public final class DashboardRepository_Factory implements Factory<DashboardRepository> {
  private final Provider<SupabaseClient> clientProvider;

  private final Provider<SecureSessionManager> sessionManagerProvider;

  public DashboardRepository_Factory(Provider<SupabaseClient> clientProvider,
      Provider<SecureSessionManager> sessionManagerProvider) {
    this.clientProvider = clientProvider;
    this.sessionManagerProvider = sessionManagerProvider;
  }

  @Override
  public DashboardRepository get() {
    return newInstance(clientProvider.get(), sessionManagerProvider.get());
  }

  public static DashboardRepository_Factory create(Provider<SupabaseClient> clientProvider,
      Provider<SecureSessionManager> sessionManagerProvider) {
    return new DashboardRepository_Factory(clientProvider, sessionManagerProvider);
  }

  public static DashboardRepository newInstance(SupabaseClient client,
      SecureSessionManager sessionManager) {
    return new DashboardRepository(client, sessionManager);
  }
}
