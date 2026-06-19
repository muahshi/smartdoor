# Smart Door — Email DNS Setup (Resend)
## Phase 10: Production Launch

Reference for verifying `smartdoor.in` in Resend and configuring
SPF/DKIM/DMARC for production email deliverability.

---

## 1. ADD & VERIFY DOMAIN IN RESEND

1. Resend Dashboard → Domains → Add Domain → `smartdoor.in`
2. Resend will display the exact DNS records to add — **use the values
   shown in your Resend dashboard**, not the placeholders below, since
   DKIM keys are unique per account.

---

## 2. DNS RECORDS (typical pattern — confirm exact values in Resend dashboard)

### SPF
If you have no existing SPF record:
```
Type: TXT
Name: @ (or smartdoor.in)
Value: v=spf1 include:_spf.resend.com ~all
```

If you already send email from another service (e.g. Google Workspace
for `hello@smartdoor.in`), **merge** into one SPF record — multiple SPF
TXT records on the same name will break validation:
```
v=spf1 include:_spf.resend.com include:_spf.google.com ~all
```

### DKIM
Resend provides 3 CNAME records, typically formatted like:
```
Type: CNAME
Name: resend._domainkey
Value: (provided by Resend)
```
Add exactly as shown in your dashboard.

### DMARC
```
Type: TXT
Name: _dmarc
Value: v=DMARC1; p=quarantine; rua=mailto:dmarc@smartdoor.in; pct=100
```
Start with `p=quarantine` rather than `p=reject` for the first few weeks
to monitor reports before fully enforcing — this avoids legitimate email
being silently dropped if something's misconfigured.

---

## 3. VERIFICATION

1. Resend Dashboard → Domains → confirm status shows **Verified** for
   SPF and DKIM (can take up to 48h to propagate, though usually faster)
2. Send a real test email and check headers:
   - Gmail: open the email → ⋮ → "Show original" → confirm
     `SPF: PASS`, `DKIM: PASS`, `DMARC: PASS`
3. Run a deliverability score check at mail-tester.com — aim for 9+/10
4. Send test emails to Gmail, Outlook, and Yahoo if possible — spam
   filtering behavior differs across providers

---

## 4. TRANSACTIONAL EMAIL TYPES TO TEST

- [ ] Order confirmation
- [ ] Payment receipt
- [ ] Subscription renewal reminder
- [ ] Renewal payment failed notice
- [ ] PIN reset / OTP email
- [ ] Support ticket update notification

---

## 5. ONGOING MONITORING

- Check Resend Dashboard → Logs regularly for bounce/complaint rates
- A rising bounce rate usually means stale/invalid email addresses in
  the database — clean these periodically
- A rising spam-complaint rate is more serious — review email content
  and frequency (especially renewal reminders — don't over-send)
