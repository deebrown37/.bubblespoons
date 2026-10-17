# Hosting and launch handover

## Current delivery

Working local web MVP. No public service, native store package, real-email delivery, billing, push notifications, identity check or background moderation is configured. The manifest enables a standalone browser shortcut where supported; it does not mean App Store or Play Store approval, native push, or offline operation. No service worker caches personal data.

## Private staging

Use Node 24.19+ in the 24.x line. One Node process and a persistent volume are required. Set:

```env
NODE_ENV=production
HOST=0.0.0.0
PORT=3000
APP_ORIGIN=https://your-staging-domain.example
DB_PATH=/app/data/app.sqlite
ADMIN_EMAIL=your-controlled-moderator-email@example.com
```

Terminate HTTPS at the reverse proxy. APP_ORIGIN must be the exact browser origin, without a trailing slash. Secure cookies prevent login over plain HTTP in production. Restrict staging at the hosting/network layer. Do not use the demo command, credentials or database. Configure host request-size limits and IP rate limits. The in-process limiter keys off socket address; behind a proxy it is deliberately conservative and does not trust spoofable forwarded headers. Configure upstream limits correctly before serving public traffic.

Build a container using the included Dockerfile and mount a persistent disk at `/app/data`. The container refuses to start in production without an HTTPS origin. Use one replica: SQLite files are not suitable for ephemeral/serverless disks or unsynchronized multi-replica deployments. Move to a managed database and shared abuse/session controls before horizontally scaling.

Set up encrypted volume backups with SQLite-aware backup tooling, test recovery, document access and retention, and honor deletion requirements in restored backups. Registration databases and photos must never be checked into source control or included in a source ZIP.

## Before real user onboarding

- Verify email and implement rate-limited, single-use, expiring password reset tokens through a transactional email provider. This needs a provider API credential stored only on the server and domain sender verification. Do not ask people to share secrets in chat.
- Decode and re-encode uploads, remove EXIF/GPS data, reject malformed/decompression-bomb images, add suitable scanning, and test private object-storage authorization if photos move out of SQLite. Current checks are format signatures, not complete image validation or content moderation.
- Establish adult eligibility/age-assurance appropriate to launch locations. Date-of-birth checks and email verification do not prove adult identity. Select an identity/age provider only if required by the chosen policy and jurisdiction, with explicit consent and data-minimization review.
- Appoint a safety owner and child-safety contact. Define report response times, escalation, preservation, lawful reporting and user appeals. The current queue is a tool, not a staffed safety program. Add a controlled unsuspension and appeal procedure before relying on permanent moderation decisions.
- Replace development policies with approved company identity, privacy notice, terms, community standards and child-safety policy. Define retention for reports, IP rate-limit data, moderation evidence and backups. Define the permitted launch jurisdictions and review applicable data rules with counsel.
- Add an external, monitored account-deletion request channel and ownership verification for people who cannot log in. The current public deletion dialog provides instructions but is not a complete external request workflow for store submission.
- Test accessibility, actual iPhone Safari and Android Chrome behavior, secure session expiry, loss of access, recovery, load, upload safety, backup restore and security. Record screenshots and evidence, and obtain an independent security review before public onboarding.
- Add application monitoring that avoids logging private messages, tokens, passwords or photos; shared abuse/spam controls; security patch ownership; pagination for large datasets; and operational incident response. Discovery currently bounds candidate evaluation at 500, returns up to 100 profiles, and message history returns the most recent 200 messages. Plan pagination rather than silently using these limits at scale.
- Review discovery preferences and inclusion requirements with DTP37. The baseline filters age, city and relationship intent; gender/orientation preferences, geolocation/distance, profile verification and algorithmic scoring are not implemented.

## iPhone and Android later

This custom Node/browser project is not a Bubble project. Bubble publishing credentials do not automatically package it. Choose a separate native client or evaluate a Capacitor-based package, then test native functionality and plugin compatibility before committing to store submission.

Apple publishing generally needs the developer membership, an app record with Bundle ID/Team ID, signing and App Store Connect access. Native push additionally needs APNs setup. Google publishing needs a Play developer account, stable package identity and app signing; an automated upload pipeline may use a service account. Native push additionally needs Firebase/FCM setup. Credentials stay in CI secrets or provider-approved server settings, never client code or the repository.

If selling digital premium access, implement and verify store-compliant billing for the chosen regions; web Stripe checkout is not a universal native billing solution. Configure secure verified billing callbacks, restore, cancellation, refunds and entitlement reconciliation. No premium feature is represented as active in this app.

Before submission, recheck live official requirements for differentiation of dating apps, user-generated content moderation, child safety, restricted minor access, account deletion, privacy disclosures, target SDK, rating questionnaires and personal-account testing. The October 11 planning spreadsheet is background planning, not a guarantee of current approval requirements.

Official starting points: [Apple review rules](https://developer.apple.com/app-store/review/guidelines/), [Google child safety](https://support.google.com/googleplay/android-developer/answer/14747720), [Google testing](https://support.google.com/googleplay/android-developer/answer/14151465), [Android target requirements](https://developer.android.com/google/play/requirements/target-sdk).
