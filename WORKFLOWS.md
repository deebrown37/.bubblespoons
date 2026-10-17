# Spoon workflow setup and handover

This is custom Node.js code for `.bubblespoons`, implementing the supplied Bubble-style rules. It is not a Bubble plugin or an app-store deployment. The source is a development build; live provider certification, device/browser QA and launch operations remain outstanding.

## Where the keys go

Set these **server environment variables** in the hosting service's secret settings, or `.env` for local use. Never paste them into browser code, GitHub files, member settings or a mobile wrapper.

| Variable | Source | Used for |
|---|---|---|
| `STRIPE_SECRET_KEY` | Stripe Dashboard, Developers/API keys | Hosted Checkout, session/event retrieval, connected-account readiness |
| `STRIPE_WEBHOOK_SECRET` | Stripe endpoint's signing secret | Signature verification of raw webhook requests |
| `CHECKR_SECRET_KEY` | Approved Checkr account API settings | Candidate, invitation, candidate reconciliation, report retrieval |
| `PRIVATE_DATA_KEY` | Generate 32 random bytes, encode as 64 hex characters | AES-256-GCM encryption of private IDs and videos |
| `ADMIN_EMAIL` | DTP37-controlled registered account | Server-controlled administrator authorization |
| `APP_ORIGIN` | Exact public HTTPS app URL | Same-origin request validation and payment return URLs |

Use Stripe **test mode** and Checkr test credentials first. This code does not provision accounts or prove that either provider has approved DTP37's business/use case. Obtain approval before enabling live services. Keep the encryption key backed up separately from the database; losing it makes private files unreadable. Key rotation requires re-encrypting existing files.

## Configure the business rules

Register the account named by `ADMIN_EMAIL`, sign in, and open **Spoon account → Spoon administration**. Settings are saved server-side and restricted to administrators:

- `risk_text`, `risk_version`, `disclosure_text`, `disclosure_version`: company-approved wording and version identifiers. No legal text is invented by this implementation. Updated versions require new agreement before a screening payment/start.
- `package`, `country`, `state`, optional `node`: actual Checkr package slug, two-letter country/state and hierarchy node. The configured location applies to all screening applicants; launch must restrict enrollment to that service area or add verified per-applicant work-location selection. Do not use Florida defaults for applicants working elsewhere.
- `background_fee_cents`, `hour_rate_cents`: USD integer cents. Zero disables the offer. There are no assumed prices.
- `id_reward_points`, `purchase_reward_points`: points awarded for each ID side once and each verified fee/hours purchase once. Default zero. These are promotional bookkeeping points, with no assumed cash value.
- `spoon_pack_cents`, `spoon_pack_points`: optional fixed points purchase. Default zero disables purchase.
- `privacy_url`: the company's published HTTPS privacy-policy page. Support email is `Dtp37@dtp37llc.com`.

Administrators can explicitly set a Be a spoon member's eligibility, attach an existing `acct_…` Stripe Connect account and verify its details/charges/payouts flags, reconcile a Checkr report belonging to that applicant, and add store rewards. Connecting/creating Stripe accounts and provider onboarding are external operator steps; this build does not supply a Connect onboarding link. Do not set eligibility solely because a user uploaded an ID or has an apparently clear screening status.

Configure Stripe to POST `checkout.session.completed` and `checkout.session.async_payment_succeeded` to:

```text
https://YOUR_APP_DOMAIN/api/spoon/stripe-event
```

Set that endpoint's signing secret on the server. The handler verifies the raw signature and retrieves the event and Checkout Session using the secret key. A browser `status: paid` or `status: verified` is never trusted. Provider reference, order ownership, amount and currency must match. A return URL can reconcile status but cannot declare a payment successful.

## Implemented workflow map

| Requested behavior | Screen / API | Enforcement |
|---|---|---|
| Age Continue | Age dialog; `POST /api/age-check` | Valid calendar date, at least 21, persisted server flag; anonymous proof expires in 30 minutes and is consumed at signup |
| Common guard | All member APIs except session, deletion and age reconfirmation | Signed-in, unsuspended account, DOB valid and 21+, persisted `age_21_eligible` |
| Front/back ID | Spoon account; `/api/spoon/id-photo` | Encrypted private storage, size/type-signature checks, one reward/mark per side; owner/admin reads only |
| Risk notice | `/api/spoon/risk` | Current configured version, agreement date, explicit withdrawal and audit |
| Disclosure | `/api/spoon/disclosure` | Current configured version and recorded signature date |
| Notifications | Allow / Not now; `/api/spoon/notifications` | Browser permission requested only on Allow; no push-delivery service is included |
| Checkr screening | `/api/spoon/screening/start` | Be a spoon, age, email, current agreements, verified fee and ready config; candidate reused, optional node passed; invitation errors saved |
| Report reconciliation | `/api/spoon/admin/reconcile-report` | Admin-only; report candidate must match saved applicant candidate |
| Candidate recovery | `/api/spoon/admin/reconcile-candidate` | Admin-only; retrieves report and candidate, confirms provider email matches applicant. Operator API for recovery, not a member control |
| Screening fee | `/api/spoon/checkout`, `/fee-return` | Saved Stripe session, owner checks, server verification; cancellation message without overwriting a paid fee |
| Open invitation | `/api/spoon/screening/invitation` | Be a spoon, age, paid fee, provider-returned invitation URL |
| Buy hours | Discovery → Buy hours; `/api/spoon/booking`, `/checkout` | Buyer/member roles, different users, both age-qualified, eligibility, no symmetric block, Stripe readiness; rechecked before payment; 1–24 whole hours |
| Chat request / accept / send | Discovery, Spoon account, Connections | Request recipient alone accepts; accepted request or mutual likes establish conversation; members only, both age-qualified, no block |
| Block / unblock | Safety dialog, Spoon account | Normalized block table queried in both directions; blocking removes conversations/requests and declines existing sharing pairs; unblock removes only the caller's block |
| Video upload | Spoon account; `/api/spoon/video` | File exists, MP4 signature and size, SHA-256 content deduplication, encryption |
| Private sharing | `/api/spoon/sharing`, `/sharing/consent` | Confirmed hours purchase for exact pair, each user records only their own consent; both age-qualified, neither declined/blocked; Not now changes nothing |
| Answers | `/api/spoon/answers` POST / PUT | POST creates; PUT requires existing owner answers; age guard |
| Purchase verification | Internal `reconcile`; signed Stripe event | Provider-confirmed paid/complete session; unique reference and order; one reward ledger entry; no public verification override |
| Store | Spoon account; `/api/spoon/store/redeem` | Age guard, sufficient points, atomic deduction, stable request key deduplicates retries |
| Admin payments / eligibility / store | `/api/spoon/admin/*` | Server-side admin check, input validation, audit |
| Help / privacy | Spoon account | Mail link and configured HTTPS privacy URL |
| Delete account | My profile | Session owner only; case-insensitive typed DELETE plus password; cascading member data removal and logout |

“Verify Spoon purchase” is implemented as a private reconciliation function, rather than a callable endpoint that could accept a forged `verified` value. Blocks use one normalized table instead of error-prone copied lists. Consent and payment status remain authoritative server data.

## Operational limits before launch

- Birth date and ID upload do not provide robust age/identity verification. Add an approved verification process.
- Media checks currently validate file signatures and sizes, not full decoding, malware, embedded metadata or content. Videos have no moderation queue in this build. Add decoding/re-encoding, scanning, review/report/removal and retention controls before accepting real uploads.
- Risk/disclosure timestamps are workflow records, not a complete electronic-signature or background-check compliance system. Obtain reviewed notices, screening purpose/permission, geographic handling and retention procedures before real screenings.
- Candidate creation with an uncertain response is held for admin recovery to avoid duplicate applicants. Invitation failures preserve the candidate and can be retried. Provider-side invitation idempotency/recovery after a timeout still needs operator review.
- Single Node process with SQLite is the supported deployment. In-process action locks do not coordinate multiple server instances. Add distributed locks/queues before scaling horizontally.
- Cancelled checkouts are reused until provider expiration to avoid creating another charge opportunity. If price/destination changes while a checkout is pending, checkout stops for reconciliation. Failed/expired sessions, refunds, disputes, cancellations, payouts, tax, booking fulfillment and reward fulfillment need staffed operations and further automation. Refunds/disputes are not yet reflected automatically in balances or access.
- Store redemption records a request and point deduction; it does not ship or automatically fulfill an item. Points purchases and compensated features need a business/provider/store-policy review before release.
- Account deletion removes local member-owned rows including encrypted IDs/videos, answers, transactions/ledger, redemptions, messages/conversations, requests, blocks and sharing pairs. Provider records (Stripe/Checkr), legal retention, anonymized safety reports and backups have separate retention/deletion obligations. Local deletion does not call external deletion APIs or refund payments.
- Real HTTPS browser/device testing, provider sandbox end-to-end testing, webhook delivery/retry testing, password recovery, verified email, moderation staffing and reviewed production policies remain required. This is not an App Store or Google Play submission.

Provider references: [Checkr API](https://docs.checkr.com/), [Stripe Checkout session retrieval](https://docs.stripe.com/api/checkout/sessions/retrieve), [Stripe webhook signatures](https://docs.stripe.com/webhooks/signature).
