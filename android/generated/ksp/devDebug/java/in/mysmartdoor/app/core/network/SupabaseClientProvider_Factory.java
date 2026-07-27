package in.mysmartdoor.app.core.network;

import dagger.internal.DaggerGenerated;
import dagger.internal.Factory;
import dagger.internal.QualifierMetadata;
import dagger.internal.ScopeMetadata;
import in.mysmartdoor.app.core.config.EnvironmentConfig;
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
public final class SupabaseClientProvider_Factory implements Factory<SupabaseClientProvider> {
  private final Provider<EnvironmentConfig> environmentConfigProvider;

  public SupabaseClientProvider_Factory(Provider<EnvironmentConfig> environmentConfigProvider) {
    this.environmentConfigProvider = environmentConfigProvider;
  }

  @Override
  public SupabaseClientProvider get() {
    return newInstance(environmentConfigProvider.get());
  }

  public static SupabaseClientProvider_Factory create(
      Provider<EnvironmentConfig> environmentConfigProvider) {
    return new SupabaseClientProvider_Factory(environmentConfigProvider);
  }

  public static SupabaseClientProvider newInstance(EnvironmentConfig environmentConfig) {
    return new SupabaseClientProvider(environmentConfig);
  }
}
