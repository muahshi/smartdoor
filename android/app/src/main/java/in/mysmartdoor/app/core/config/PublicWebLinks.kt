package `in`.mysmartdoor.app.core.config

/**
 * Existing production website URLs (mysmartdoor.in) reused by the app's
 * Public/prospective-customer entry points — [in.mysmartdoor.app.ui.screens.login.LoginScreen]'s
 * "New to My Smart Door?" section and [in.mysmartdoor.app.ui.screens.publicweb.PublicHomeScreen].
 *
 * Phase 8 — PUBLIC ONBOARDING & MARKETING EXPERIENCE. Per CTO decision:
 * no product catalog, no commerce, and no marketing content are rebuilt
 * natively. These are the exact same URLs the website itself already
 * uses (see `config/environment.js`, `js/brandConfig.js`) — opened via a
 * plain `ACTION_VIEW` Intent (see
 * [in.mysmartdoor.app.core.common.rememberWebLinkLauncher]), never fetched
 * or duplicated. No backend change, no new page, no fake product.
 */
object PublicWebLinks {
    private const val BASE_URL = "https://mysmartdoor.in"

    /** Home page — also used for the generic "Visit Website" action. */
    const val HOME = BASE_URL

    /** Shop / product catalog (`products.html`) — "Buy Smart Door" action. */
    const val PRODUCTS = "$BASE_URL/products.html"

    /** Home page's existing Features section, which covers the AI Receptionist. */
    const val FEATURES = "$BASE_URL/#features"

    /** Home page's existing Pricing section. */
    const val PRICING = "$BASE_URL/#pricing"

    /** Home page's existing FAQ section. */
    const val FAQ = "$BASE_URL/#faq"

    /**
     * Settings & Account phase — About / Help & Support section links.
     * Both pages already exist in production (`legal/terms-of-service.html`,
     * `legal/privacy-policy.html`) — reused as-is, no new page.
     */
    const val TERMS_OF_SERVICE = "$BASE_URL/legal/terms-of-service.html"
    const val PRIVACY_POLICY = "$BASE_URL/legal/privacy-policy.html"

    /** Production support inbox (`js/aiConsultantKnowledge.js#supportEmail`) — opened via a `mailto:` intent. */
    const val SUPPORT_EMAIL = "support@mysmartdoor.in"
}
