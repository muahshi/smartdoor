# Pages — My Smart Door

> All 14 root-level HTML pages, with purpose taken from each page's
> `<title>` tag and surrounding context, plus the primary JS/services
> each depends on.

| Page | Title | Who uses it | Business flow position |
|---|---|---|---|
| `index.html` | My Smart Door — India's 1st Smart Nameplate System | Prospective customers (public) | Marketing homepage: product overview, pricing, FAQ, founder info. Entry point of the Purchase Flow. Depends on `js/productCatalog.js`, `js/aiProductConsultant.js`. |
| `products.html` | Shop Smart Nameplates — Acrylic, Teakwood & Steel \| My Smart Door | Prospective customers | Product listing/shop page. Depends on `js/productsPage.js`, `js/productCatalog.js`. |
| `product.html` | Smart Nameplate — My Smart Door | Prospective customers | Single-product detail + configurator page. Depends on `js/productDetailPage.js`, `js/productConfigurator.js`, `design-system/`. |
| `visitor.html` | My Smart Door | Visitors (public, reached via QR scan) | The core visitor experience: masked calling, voice notes, messaging, SOS. Entry point of the Visitor Flow. Depends on `js/visitorCallUI.js`, `js/webrtcCallUI.js`, `js/aiCallScreeningUI.js`, `js/aiVoiceReceptionistUI.js`, `js/plateRenderer.js`. |
| `login.html` | My Smart Door — Owner Login | Plate owners | PIN-based owner authentication. Entry point of the Owner Flow. Depends on `services/auth.js`, `js/forgotPin.js`. |
| `app.html` | My Smart Door — PWA | Plate owners (authenticated) | The owner's installed/PWA dashboard: communication center, notifications, subscription, family members. Depends on `js/dashboard.js`, `js/subscriptionManager.js`, `js/notificationCenter.js`, `js/aiOwnerAssistantUI.js`. |
| `onboarding.html` | My Smart Door — Activate Your Plate | New plate owners (post-delivery) | Plate activation wizard — binds a delivered physical plate to an owner account. Depends on `js/activationWizard.js`, `services/activation.js`. |
| `admin-login.html` | My Smart Door — Admin Login | Internal staff | Entry point to the internal Admin Portal. Depends on `admin-login` Edge Function. |
| `admin.html` | My Smart Door — Admin Super Panel | Internal staff | Central internal tooling: provisioning, plate management, manufacturing, support, analytics, RBAC. Depends on `services/admin*.js`, `js/adminAIInsights.js`, `js/adminPhase13.js`, `js/adminErrorCapture.js`. |
| `guard.html` | My Smart Door — Guard Panel | Society/office security guards | On-site gate/security interface for society deployments. Depends on `services/guardPanel.js`. |
| `society-admin.html` | My Smart Door — Guard Panel *(title as-shipped; distinct page from `guard.html`)* | Society administrators | Society/property-level admin surface (residents, towers, floors, units). Depends on `services/societyAdmin.js`, `services/propertyManagement.js`, `services/societyAnalytics.js`. |
| `partner-apply.html` | Become a My Smart Door Partner — Dealer / Franchise / Distributor Application | Prospective dealers/franchisees (public) | Entry point to the Partner Platform onboarding flow. Depends on `services/partnerOnboarding.js`, `partner-application` Edge Function. |
| `partner-portal.html` | My Smart Door — Partner Portal | Approved partners/dealers | Ongoing partner workspace (orders, pricing, commissions). Depends on `partner-data` Edge Function. |
| `partner-review.html` | My Smart Door Admin — Partner Applications | Internal staff | Internal review/approval queue for partner applications. |

## Notes

- `guard.html` and `society-admin.html` currently share the identical
  `<title>` string ("My Smart Door — Guard Panel") despite being
  different pages with different services behind them. This is flagged
  as an observation for engineering, not something this documentation
  effort corrects — no page was modified.
- Legal pages (`legal/*.html` — privacy policy, terms of service,
  shipping policy, refund policy, cookie policy, acceptable use policy)
  are generated from `docs/legal/*.md` via
  `docs/legal/generate_legal_pages.py` and are indexed separately in
  `documents/documents.md`.

## Notes for AI Executives

- Page-to-service mapping above is derived from naming conventions and
  directory structure, not a full static import trace — confirm before
  depending on it for anything business-critical.
- No page was modified while compiling this document.
