# Customer Interview Template

Use this for every interview logged via `recordInterview()` in `services/customerGrowth.js`. Aim for 15–20 minutes. Record verbatim where you can — don't paraphrase too early, the exact words often contain the confusion point.

---

## Before the call

- Pull up the customer's profile (`getCustomerProfile()`) — know their plate ID, onboarding status, and last activity before you call
- Note their segment (beta / early access / paying / vip)
- If they've filed a bug report or feature request, read it first — don't make them repeat it

## Interview fields (map directly to `customer_interviews` table)

**interview_date** — auto-filled, today
**conducted_by** — your name
**channel** — call / whatsapp / in_person / video
**sentiment** — set this honestly after the call, not during: positive / neutral / negative

## Questions to ask

### Onboarding
1. Walk me through what happened from the day your plate arrived to the first time it actually worked for you.
2. Was there any point where you weren't sure what to do next?
3. Did you need to contact support to get set up? What for?

### Daily use
4. How often does a visitor actually use the QR code in a typical week?
5. What do you use most: family routing, status messages, voice notes, calls, or SOS?
6. Is there anything you expected the product to do that it doesn't?

### Trust and risk
7. Have you had a false alarm, a missed visitor, or anything that made you trust it less?
8. If the subscription expired tomorrow, would you renew? Why or why not?
9. Would you recommend this to a neighbor or friend? What would you tell them?

### Open
10. What's the one thing that would make this meaningfully better?

## After the call — fill in these fields

**feedback_notes** — Free text summary. Write what they actually said, not your interpretation.

**problems_found** — JSON array of distinct, specific problems. Bad: `["confusing"]`. Good: `["didn't know family member needed to accept invite link before showing up in routing"]`.

**requested_features** — JSON array of what they explicitly asked for. Don't add things you think they'd want — only what they said.

**follow_up_needed** — true if: unresolved complaint, at-risk renewal, a bug that needs a callback, or a strong referral candidate.

**follow_up_notes** — what needs to happen and by when.

---

## Rules for good interview data

- Don't lead with "are you happy with the product?" — it produces polite agreement, not signal. Ask about specific moments instead.
- One vague "it's good" answer is worth less than one specific complaint. Push for specifics.
- If the customer says something surprising, ask a follow-up before moving on. Don't let it pass.
- Log the interview the same day, while you remember the tone and the exact wording.

