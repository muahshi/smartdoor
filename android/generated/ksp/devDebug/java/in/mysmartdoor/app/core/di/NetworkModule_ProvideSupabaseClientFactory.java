package in.mysmartdoor.app.core.di;

import dagger.internal.DaggerGenerated;
import dagger.internal.Factory;
import dagger.internal.Preconditions;
import dagger.internal.QualifierMetadata;
import dagger.internal.ScopeMetadata;
import in.mysmartdoor.app.core.network.SupabaseClientProvider;
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
public final class NetworkModule_ProvideSupabaseClientFactory implements Factory<SupabaseClient> {
  private final Provider<SupabaseClientProvider> providerProvider;

  public NetworkModule_ProvideSupabaseClientFactory(
      Provider<SupabaseClientProvider> providerProvider) {
    this.providerProvider = providerProvider;
  }

  @Override
  public SupabaseClient get() {
    return provideSupabaseClient(providerProvider.get());
  }

  public static NetworkModule_ProvideSupabaseClientFactory create(
      Provider<SupabaseClientProvider> providerProvider) {
    return new NetworkModule_ProvideSupabaseClientFactory(providerProvider);
  }

  public static SupabaseClient provideSupabaseClient(SupabaseClientProvider provider) {
    return Preconditions.checkNotNullFromProvides(NetworkModule.INSTANCE.provideSupabaseClient(provider));
  }
}
