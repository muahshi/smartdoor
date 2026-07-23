package `in`.mysmartdoor.app.core.di

import dagger.Module
import dagger.hilt.InstallIn
import dagger.hilt.components.SingletonComponent

/**
 * Placeholder binder module for repository interface → implementation
 * bindings (@Binds). Intentionally empty in A1.2 — no concrete repository
 * exists yet. Future phases add `@Binds abstract fun bindXRepository(...)`
 * functions here rather than creating a new module file.
 */
@Module
@InstallIn(SingletonComponent::class)
abstract class RepositoryModule
