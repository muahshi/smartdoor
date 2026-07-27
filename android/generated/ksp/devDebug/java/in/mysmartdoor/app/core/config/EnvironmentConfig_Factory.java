package in.mysmartdoor.app.core.config;

import dagger.internal.DaggerGenerated;
import dagger.internal.Factory;
import dagger.internal.QualifierMetadata;
import dagger.internal.ScopeMetadata;
import javax.annotation.processing.Generated;

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
public final class EnvironmentConfig_Factory implements Factory<EnvironmentConfig> {
  @Override
  public EnvironmentConfig get() {
    return newInstance();
  }

  public static EnvironmentConfig_Factory create() {
    return InstanceHolder.INSTANCE;
  }

  public static EnvironmentConfig newInstance() {
    return new EnvironmentConfig();
  }

  private static final class InstanceHolder {
    private static final EnvironmentConfig_Factory INSTANCE = new EnvironmentConfig_Factory();
  }
}
