# Smart Door — Domain & DNS Setup
## Phase 10: Production Launch

Reference for configuring `mysmartdoor.in` and its subdomains on Vercel.

---

## 1. DOMAINS

| Domain | Purpose | Points To |
|---|---|---|
| `mysmartdoor.in` | Primary marketing site | `index.html` (Vercel production) |
| `www.mysmartdoor.in` | Redirect to apex | Vercel auto-redirect |
| `app.mysmartdoor.in` | Owner/visitor PWA (optional dedicated subdomain) | `app.html` content, or redirect to `mysmartdoor.in/app` |
| `admin.mysmartdoor.in` | Admin panel (optional dedicated subdomain) | `admin.html` content, or redirect to `mysmartdoor.in/admin` |

**Note:** Since this is a single static-site Vercel project (not multiple
projects), the simplest and most reliable setup is:
- All 4 domains attached to the **same Vercel project**
- `mysmartdoor.in` / `www.mysmartdoor.in` serve the project root as normal
- `app.mysmartdoor.in` and `admin.mysmartdoor.in` can either (a) also point at
  the same project root and rely on `vercel.json` rewrites
  (`/app` → `/app.html`, `/admin` → `/admin.html`) with the subdomain
  effectively cosmetic, or (b) use a Vercel "Redirect" domain config to
  send `app.mysmartdoor.in` → `mysmartdoor.in/app.html` and
  `admin.mysmartdoor.in` → `mysmartdoor.in/admin.html`.
  Option (b) is simpler to reason about and is recommended unless there's
  a specific reason to serve different content per-subdomain.

---

## 2. ADDING DOMAINS IN VERCEL

1. Vercel Dashboard → Project → Settings → Domains
2. Add each domain one at a time: `mysmartdoor.in`, `www.mysmartdoor.in`,
   `app.mysmartdoor.in`, `admin.mysmartdoor.in`
3. Vercel will display the exact DNS records needed for each — **always
   use the records Vercel shows you at the time**, not generic examples,
   since Vercel's recommended apex-domain record type can change.

Typical pattern (confirm exact values in your Vercel dashboard):

| Domain | Type | Name | Value |
|---|---|---|---|
| `mysmartdoor.in` | A | `@` | (Vercel-provided IP, e.g. `76.76.21.21`) |
| `www.mysmartdoor.in` | CNAME | `www` | `cname.vercel-dns.com` |
| `app.mysmartdoor.in` | CNAME | `app` | `cname.vercel-dns.com` |
| `admin.mysmartdoor.in` | CNAME | `admin` | `cname.vercel-dns.com` |

4. Set `mysmartdoor.in` as the **Primary Domain** in Vercel; configure
   `www.mysmartdoor.in` to redirect to it (or the reverse — pick one and
   keep it consistent for SEO canonical purposes, matching the
   `<link rel="canonical">` tags already set in the HTML).

---

## 3. SSL

Vercel auto-provisions and renews SSL certificates (Let's Encrypt) for
all verified domains. No manual action needed once DNS resolves
correctly. Provisioning typically completes within minutes of DNS
propagating.

---

## 4. VERIFICATION

After DNS changes propagate:

```bash
dig mysmartdoor.in
dig www.mysmartdoor.in
dig app.mysmartdoor.in
dig admin.mysmartdoor.in
curl -I https://mysmartdoor.in
```

Confirm each resolves and returns a valid SSL cert with no warnings.

---

## 5. EMAIL DNS (separate from web DNS)

Email sending (Resend) requires its own SPF/DKIM/DMARC records, layered
on top of the same `mysmartdoor.in` DNS zone. See `docs/EMAIL_DNS_SETUP.md`
— these do not conflict with the Vercel web records above as long as you
don't already have a conflicting SPF record from another sender.
