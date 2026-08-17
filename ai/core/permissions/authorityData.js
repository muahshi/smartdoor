/**
 * SDOS — Authority Data (Phase 15)
 * ai/core/permissions/authorityData.js
 *
 * A static, in-repo transcription of the authority rules already
 * documented in `core/standards/AUTHORITY_STANDARD.md` and each
 * `ai/executives/<role>/AUTHORITY_MATRIX.md`. This file invents
 * NOTHING — every row below is copied (condensed, not reworded in
 * meaning) from an existing document, and every row carries a
 * `source` string pointing at the exact file/section it came from,
 * per PERMISSION_MODEL.md Rule 4 ("a check's rule_cited must be
 * traceable to an actual file and row/line").
 *
 * `permissionEngine.js` is the only consumer of this file in
 * production. Tests may pass a synthetic, clearly-labeled override
 * via `checkPermission()`'s second argument instead of importing
 * this file directly — see scripts/sdos-permission-engine-test.js's
 * DENIED-mechanism test for why.
 *
 * IMPORTANT — no `deniedRows` entry exists for any executive below.
 * A full read of all six ai/executives/<role>/AUTHORITY_MATRIX.md files
 * (Phase 15 audit) found no row structurally distinct from "Founder
 * Approval Rules" or "May Decide Unilaterally" — i.e. no matrix
 * currently contains an explicit DENIED/prohibited row. This is
 * documented as a known gap in ADR-0014, not silently resolved here.
 * `deniedRows: []` is left present on every role as the seam a future,
 * founder-approved matrix update would populate — it is not itself
 * a rule.
 */

export const SOURCE_DOCS = Object.freeze({
  authorityStandard: 'core/standards/AUTHORITY_STANDARD.md',
  decisionStandard: 'core/standards/DECISION_STANDARD.md',
  permissionModel: 'ai/core/permissions/PERMISSION_MODEL.md',
});

// ── Universal Founder-Approval Rows ───────────────────────────────
// Transcribed verbatim-in-meaning from AUTHORITY_STANDARD.md's
// "Universal Founder-Approval Rows" table (ten rows). Every executive
// inherits this list in full.
export const UNIVERSAL_APPROVAL_ROWS = Object.freeze([
  {
    category: 'schema_change',
    action: 'Any Supabase schema change (new table, column, index, constraint)',
    why: 'Irreversible-in-practice, affects every downstream service.',
  },
  {
    category: 'rls_policy_change',
    action: 'Any RLS policy change',
    why: 'Security-critical; SmartDoor has a documented history of RLS-fix migrations correcting prior mistakes.',
  },
  {
    category: 'pricing_billing_change',
    action: 'Any change to customer-facing pricing, billing, or subscription logic',
    why: 'Direct revenue/legal impact.',
  },
  {
    category: 'pin_auth_change',
    action: 'Any change to PIN/auth/session handling',
    why: 'Core to the owner-privacy promise.',
  },
  {
    category: 'production_deployment',
    action: 'Any production deployment',
    why: 'Founder is the only human operator today.',
  },
  {
    category: 'razorpay_webhook_change',
    action: 'Any change to Razorpay payment or webhook handling',
    why: 'Financial correctness and fraud-surface risk.',
  },
  {
    category: 'data_deletion',
    action: 'Any deletion of data, tables, or files',
    why: 'Irreversible.',
  },
  {
    category: 'ai_integrations_scope_change',
    action: 'Any change to ai/integrations/ scope (what SDOS is allowed to read/write)',
    why: "Governs SDOS's own blast radius.",
  },
  {
    category: 'new_vendor_dependency',
    action: 'Adopting a new external dependency, service, or vendor',
    why: 'Ongoing cost/risk commitment.',
  },
  {
    category: 'customer_communication_change',
    action: 'Any customer communication change (SMS/call/notification/billing/GST copy or triggers)',
    why: 'Brand, legal, and compliance risk.',
  },
].map(row => Object.freeze({
  ...row,
  source: `${SOURCE_DOCS.authorityStandard} — Universal Founder-Approval Rows`,
})));

function role(label, sourcePath, approvalRows, unilateralRows) {
  const source = `ai/executives/${sourcePath}/AUTHORITY_MATRIX.md`;
  return Object.freeze({
    label,
    source,
    approvalRows: Object.freeze(approvalRows.map(r => Object.freeze({
      ...r,
      source: `${source} — Founder Approval Rules`,
    }))),
    unilateralRows: Object.freeze(unilateralRows.map(r => Object.freeze({
      ...r,
      source: `${source} — May Decide Unilaterally (Future Phase, Once Execution Authority Exists)`,
    }))),
    // No executive matrix currently contains an explicit DENIED row.
    // See the file-level note above and ADR-0014's "DENIED ambiguity"
    // section. Left empty intentionally — not populated by inference.
    deniedRows: Object.freeze([]),
  });
}

export const EXECUTIVES = Object.freeze({
  ceo: role('CEO', 'ceo', [
    {
      category: 'ceo_override_domain_executive',
      action: "Any decision that overrides a domain executive's own recommendation within its AUTHORITY_MATRIX.md",
      why: 'The CEO has no override authority over CTO, COO, CFO, CMO, or CPO — see CEO_PROFILE.md.',
    },
    {
      category: 'ceo_final_cross_domain_priority',
      action: 'Any cross-domain prioritization that gets treated as final rather than a recommendation',
      why: "Priority ranking across domains is input to the founder's decision, never a decision itself — see PRIORITY_MANAGEMENT.md.",
    },
    {
      category: 'ceo_invented_health_score',
      action: "Declaring a company-wide 'state of the business' figure not traceable to a cited sibling executive's own KPI/metrics file",
      why: 'Prevents an invented blended health score, per COMPANY_HEALTH_MODEL.md.',
    },
    {
      category: 'ceo_resolve_inter_executive_disagreement',
      action: "Resolving a disagreement between two sibling executives on the CEO's own initiative",
      why: 'Per every sibling AUTHORITY_MATRIX.md: "the founder is always the tie-breaker" — the CEO surfaces disagreement, it does not settle it.',
    },
    {
      category: 'ceo_edit_sibling_docs',
      action: "Any change to a sibling executive's own documentation (cto/, coo/, cfo/, cmo/, cpo/)",
      why: "Out of scope for this phase — additive-only within ai/executives/ceo/, per that phase's own build brief.",
    },
  ], [
    { category: 'ceo_assemble_cross_domain_briefing', action: 'Assembling a cross-domain briefing per EXECUTIVE_BRIEFING_GUIDE.md', condition: 'Assembly and citation only, not a decision.' },
    { category: 'ceo_flag_cross_domain_conflict', action: "Flagging that a cross-domain conflict exists between two sibling executives' documented positions", condition: 'Flagging, not resolving.' },
    { category: 'ceo_recommend_priority_order', action: 'Recommending (not setting) a founder-attention order across domains per PRIORITY_MANAGEMENT.md', condition: 'Recommendation is advisory.' },
    { category: 'ceo_update_own_docs', action: "Updating its own ai/executives/ceo/ documentation to reflect a founder decision", condition: 'Documentation, not production.' },
    { category: 'readonly_analysis_via_integrations', action: 'Running read-only analysis via ai/integrations/ once that layer exists', condition: 'Read-only, no side effects.' },
  ]),

  cfo: role('CFO', 'cfo', [
    { category: 'cfo_pricing_change', action: "Any change to hardware or subscription pricing (pricing.ts, js/productCatalog.js, plan_catalog)", why: "Direct revenue and customer-trust impact." },
    { category: 'cfo_refund_outside_policy', action: 'Any refund outside documented docs/legal/refund-policy.md eligibility', why: 'Discretionary refunds escalate to the founder, never a unilateral override.' },
    { category: 'cfo_gst_settings_change', action: 'Any change to gst_settings (GSTIN, rates, HSN/SAC codes, registration status)', why: "Compliance-critical." },
    { category: 'cfo_pricing_rule_change', action: 'Any coupon, bulk-pricing-tier, or partner-pricing rule creation/change', why: 'Direct margin impact.' },
    { category: 'cfo_commission_settlement', action: 'Any commission rule or settlement batch approval', why: 'Financial commitment to partners.' },
    { category: 'customer_communication_change', action: 'Any customer communication about a billing, payment, refund, or GST issue', why: 'Brand, legal, and trust risk.' },
    { category: 'cfo_pause_checkout', action: 'Any decision to disable/pause checkout or a billing-related flow', why: 'Direct revenue impact.' },
    { category: 'cfo_financial_position_statement', action: "Any statement to a third party characterizing SmartDoor's financial position", why: 'Legal and reputational risk.' },
    { category: 'cfo_legal_financial_doc_change', action: 'Any change to a legal/financial production document itself', why: 'These are production/legal documents, not ai/ documentation.' },
  ], [
    { category: 'cfo_compute_gst_breakup', action: 'Computing a GST breakup for a given amount using the existing compute_gst_breakup() logic', condition: 'Read/compute only, no write.' },
    { category: 'cfo_flag_reconciliation_mismatch', action: 'Flagging a reconciliation mismatch for review', condition: 'Flagging, not correcting.' },
    { category: 'cfo_draft_investor_update', action: 'Drafting (not sending) an investor-update summary from existing invoices/orders/subscriptions data', condition: 'Draft only; a human reviews and sends.' },
    { category: 'cfo_recommend_pricing_change', action: 'Recommending (not applying) a coupon or pricing-tier change', condition: 'Recommendation is advisory.' },
    { category: 'cfo_update_own_docs', action: 'Updating its own ai/executives/cfo/ documentation to reflect a founder decision', condition: 'Documentation, not production.' },
    { category: 'readonly_analysis_via_integrations', action: 'Running read-only analysis via ai/integrations/ once that layer exists', condition: 'Read-only, no side effects.' },
  ]),

  cmo: role('CMO', 'cmo', [
    { category: 'cmo_seo_meta_change', action: "Any change to index.html's SEO meta tags, JSON-LD, robots.txt, or sitemap.xml", why: "Production/customer-facing files; changing them is the CTO's implementation, founder-directed." },
    { category: 'cmo_pricing_rule_change', action: 'Creating, editing, or activating a campaigns or pricing_rules row, or setting a coupon discount value', why: 'Direct revenue/margin impact.' },
    { category: 'cmo_brand_identity_change', action: 'Any brand identity change (logo, tagline, JSON-LD Organization/Product copy, OG image, color/type system)', why: 'Brand consistency and legal/trademark risk.' },
    { category: 'cmo_privacy_security_claim', action: 'Any claim about the product privacy or security properties in marketing copy', why: "Must exactly match ai/knowledge/business/business_rules.md — misstatement is a trust and legal risk." },
    { category: 'cmo_new_social_account', action: 'Creating or posting to any social media account', why: 'No account currently exists; establishing one is a founder decision.' },
    { category: 'cmo_ad_spend', action: 'Spending any advertising budget, on any platform', why: 'Direct financial commitment.' },
    { category: 'cmo_external_publish', action: 'Publishing any content externally (blog post, press release, partner-facing collateral)', why: 'Brand and legal risk.' },
    { category: 'cmo_testimonial_use', action: 'Using a customer_reviews.testimonial publicly, even where public_consent = TRUE', why: 'Consent on file is necessary but not sufficient — the founder approves the specific use.' },
    { category: 'cmo_growth_claim', action: "Any statement characterizing SmartDoor's growth, market position, or competitive standing to a third party", why: 'Marketing claims carry the same external-facing risk as financial statements.' },
  ], [
    { category: 'cmo_draft_content', action: 'Drafting (not publishing) content, ad copy, or campaign briefs from existing product/testimonial data', condition: 'Draft only; a human reviews and approves.' },
    { category: 'cmo_recommend_campaign', action: 'Recommending (not creating) a campaigns or pricing_rules entry, fully specified', condition: 'Recommendation is advisory.' },
    { category: 'cmo_read_metrics_views', action: 'Reading and summarizing pmf_metrics_view, churn_analysis_view, or the referral leaderboard for a founder-facing update', condition: 'Read/compute only, no write.' },
    { category: 'cmo_flag_seo_gap', action: 'Flagging a keyword, structured-data, or sitemap gap against the live index.html/sitemap.xml for CTO review', condition: 'Flagging, not editing.' },
    { category: 'cmo_update_own_docs', action: 'Updating its own ai/executives/cmo/ documentation to reflect a founder decision', condition: 'Documentation, not production.' },
    { category: 'readonly_analysis_via_integrations', action: 'Running read-only analysis via ai/integrations/ once that layer exists', condition: 'Read-only, no side effects.' },
  ]),

  coo: role('COO', 'coo', [
    { category: 'coo_refund_outside_policy', action: 'Any refund outside documented docs/legal/refund-policy.md eligibility', why: 'Discretionary calls escalate to Ops Manager, never a unilateral override.' },
    { category: 'coo_pause_customer_flow', action: 'Any decision to disable/pause checkout, an integration, or a customer-facing flow', why: 'Direct revenue and customer-trust impact.' },
    { category: 'customer_communication_change', action: 'Any customer communication about a payment, security, or SOS issue', why: 'Brand, legal, and trust risk.' },
    { category: 'coo_force_expiry_or_pin_reset', action: 'Any force-expiry of customer sessions or PIN-reset action', why: 'Security-critical.' },
    { category: 'coo_inventory_adjustment', action: 'Any inventory adjustment, batch write-off, or manufacturing QC override', why: 'Financial and traceability impact.' },
    { category: 'coo_logistics_vendor_change', action: 'Any change to shipment routing, courier vendor, or logistics provider', why: 'Ongoing cost/risk commitment.' },
    { category: 'coo_partner_kyc_approval', action: 'Any partner/dealer application approval or KYC decision', why: 'Legal and commercial commitment.' },
    { category: 'coo_incident_declaration', action: 'Declaring or closing a P0/P1 incident', why: 'Per SUPPORT_RUNBOOK.md §2, P0/P1 routes to Super Admin/Founder immediately.' },
    { category: 'coo_runbook_change', action: 'Any change to a support/operations runbook itself', why: 'These are production operating documents, not ai/ documentation.' },
  ], [
    { category: 'coo_classify_ticket_severity', action: 'Classifying a support ticket severity per SUPPORT_RUNBOOK.md §2', condition: 'Classification only, not the resolution.' },
    { category: 'coo_draft_customer_response', action: 'Drafting a customer response using the tone/templates in SUPPORT_RUNBOOK.md §4', condition: 'Draft only; a human sends it.' },
    { category: 'coo_flag_stalled_order', action: 'Flagging a stalled order, manufacturing batch, or shipment for review', condition: 'Flagging, not intervention.' },
    { category: 'coo_recommend_escalation', action: 'Recommending (not making) an escalation per ESCALATION_MATRIX.md', condition: 'Recommendation is advisory.' },
    { category: 'coo_update_own_docs', action: 'Updating its own ai/executives/coo/ documentation to reflect a founder decision', condition: 'Documentation, not production.' },
    { category: 'readonly_analysis_via_integrations', action: 'Running read-only analysis via ai/integrations/ once that layer exists', condition: 'Read-only, no side effects.' },
  ]),

  cpo: role('CPO', 'cpo', [
    { category: 'cpo_feature_status_change', action: "Changing a feature_requests row's status (e.g. planned/shipped/declined)", why: 'Directly signals a product commitment; a status change is externally visible.' },
    { category: 'cpo_feature_priority_change', action: "Changing a feature_requests row's priority via setFeaturePriority()", why: "Sets internal build order — the change is founder-approved." },
    { category: 'cpo_bug_assign_resolve', action: 'Assigning (assignBug()) or resolving (resolveBug()) a bug_reports row', why: "Technical resolution is the CTO's call once product priority is recommended." },
    { category: 'cpo_product_catalog_change', action: 'Adding a new entry to SD_PRODUCTS/js/productCatalog.js, including activating any Future Product Line category', why: 'Catalog/schema-adjacent change with direct pricing and manufacturing impact.' },
    { category: 'cpo_plan_catalog_change', action: 'Any change to plan_catalog tiers or the features they gate', why: 'Direct revenue/feature-access impact.' },
    { category: 'cpo_roadmap_commitment', action: "Committing to any customer-facing roadmap date, feature availability promise, or 'coming soon' claim", why: 'Brand and expectation risk.' },
    { category: 'cpo_new_experimentation_tool', action: 'Building or connecting any A/B-testing, experimentation, or dedicated roadmap-tool integration', why: 'New system/vendor adoption.' },
    { category: 'cpo_customer_research_contact', action: 'Conducting or scheduling a customer_interviews session, or contacting a customer for research', why: 'Direct customer communication; founder or designated staff only.' },
    { category: 'cpo_interview_data_in_report', action: 'Using customer_interviews or feature_requests content in any founder-facing or external report', why: 'Consent/framing risk.' },
  ], [
    { category: 'cpo_draft_feature_priority', action: 'Drafting (not setting) a recommended priority or status for a feature_requests row, fully specified with reasoning', condition: 'Draft only; a human applies it.' },
    { category: 'cpo_recommend_bug_priority', action: 'Recommending (not assigning) a bug_reports triage priority from a product-value lens', condition: 'Recommendation is advisory.' },
    { category: 'cpo_read_metrics_views', action: 'Reading and summarizing pmf_metrics_view, churn_analysis_view, feature_usage_summary_view, or customer_segment_breakdown_view for a founder-facing update', condition: 'Read/compute only, no write.' },
    { category: 'cpo_flag_high_upvote_no_priority', action: 'Flagging a feature_requests row with high upvotes and no priority set for founder review', condition: 'Flagging, not editing.' },
    { category: 'cpo_update_own_docs', action: 'Updating its own ai/executives/cpo/ documentation to reflect a founder decision', condition: 'Documentation, not production.' },
    { category: 'readonly_analysis_via_integrations', action: 'Running read-only analysis via ai/integrations/ once that layer exists', condition: 'Read-only, no side effects.' },
  ]),

  cto: role('CTO', 'cto', [
    // CTO's approval-required list is exactly the universal set — no
    // role-specific rows beyond it (AUTHORITY_MATRIX.md is explicit
    // about this).
  ], [
    { category: 'cto_flag_bug_severity', action: 'Flagging a bug severity per BUG_TRIAGE_GUIDE.md', condition: 'Classification only, not the fix.' },
    { category: 'cto_recommend_architecture', action: 'Recommending (not making) an architecture approach for a new feature', condition: 'Recommendation is advisory.' },
    { category: 'cto_draft_code_review', action: 'Drafting a code review comment on a proposed change', condition: 'No merge/deploy authority.' },
    { category: 'cto_update_own_docs', action: 'Updating its own ai/executives/cto/ documentation to reflect a founder decision', condition: 'Documentation, not production.' },
    { category: 'readonly_analysis_via_integrations', action: 'Running read-only analysis via ai/integrations/ once that layer exists', condition: 'Read-only, no side effects.' },
  ]),
});
