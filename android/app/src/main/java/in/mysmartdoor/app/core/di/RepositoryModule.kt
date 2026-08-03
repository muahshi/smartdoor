package `in`.mysmartdoor.app.core.di

import `in`.mysmartdoor.app.core.call.NoOpRtcMediaEngine
import `in`.mysmartdoor.app.core.call.RtcMediaEngine
import dagger.Binds
import dagger.Module
import dagger.hilt.InstallIn
import dagger.hilt.components.SingletonComponent
import javax.inject.Singleton

/**
 * Placeholder binder module for repository interface → implementation
 * bindings (@Binds). Empty until Phase 12E.11 — no concrete repository
 * needed one (every repository so far, e.g. DashboardRepository, is a
 * concrete class with an @Inject constructor, which Hilt can provide
 * without a @Binds entry).
 *
 * Phase 12E.11 — NATIVE CALLING EXPERIENCE: [RtcMediaEngine] is the first
 * interface in this app that needs a real @Binds mapping, since
 * [CallViewModel][in.mysmartdoor.app.ui.screens.call.CallViewModel]
 * injects the interface, not a concrete type — that's the seam a future
 * phase uses to swap in a real WebRTC-backed engine (see
 * [RtcMediaEngine]'s class doc) by changing only this one binding.
 */
@Module
@InstallIn(SingletonComponent::class)
abstract class RepositoryModule {

    @Binds
    @Singleton
    abstract fun bindRtcMediaEngine(impl: NoOpRtcMediaEngine): RtcMediaEngine
}
