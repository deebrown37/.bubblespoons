# DTP37 Connect

A custom-coded mobile-friendly dating web application for DTP37. This is a working development MVP, with a Node.js server, SQLite persistence, and a responsive browser interface. It is separate from Bubble and is not yet an iOS/Android store application or a public-launch-ready dating service.

## Start locally

Install Node.js **24.19.0 or later in the Node 24 release line**. There are no npm dependencies to install.

```sh
npm run demo
```

Open **http://127.0.0.1:3000** and choose **Explore the demo**. All five demo accounts are fictional. Demo email: `you@example.test`; password: `DemoOnly!2026`. This account is the local demo moderator. Maya has already liked the demo account: connect with Maya to test a new mutual match. Riley is an existing demo conversation. Demo users cannot generate replies automatically; sign in as another sample account to exercise two-person messaging.

Demo mode is restricted to loopback, has a separate `data/demo.sqlite`, and is forbidden in production. Use it only on your own computer. All sample accounts have the same disclosed demo password. Never deploy or expose a demo database.

For an empty application with real local account creation:

```sh
npm start
```

Optional configuration: copy `.env.example` to `.env`. Set `ADMIN_EMAIL` to an account you control, register that account normally, and restart to enable moderation. No admin role can be assigned through the browser. Your app data stays under `data/`, which is excluded from Git. The experimental SQLite warning in Node 24 is expected; database behavior is exercised by the tests.

## Included

- Signup requires age 21+, name, email, date of birth, Spoon intent (Be a spoon / Buy a spoon), consent, and a 13–128 character password containing a digit and special character. Login remains compatible with existing accounts.
- Async scrypt password hashing with individual salts; random sessions stored as hashes; HttpOnly SameSite cookies; Secure cookies in production.
- Profile editor, intent, interests, city, pause discovery, age/city/intent filters.
- Likes and passes, reciprocal matching, private text messages only between matched members. Chat polls every five seconds while open; this is not WebSocket chat.
- Block prevents discovery and further messaging in both directions and deletes the shared conversation.
- Report submission, moderator report resolution, account suspension and an action audit log.
- Photo upload with a size limit and JPEG/PNG/WebP signature checks. Photos are private until moderator approval; images require authenticated access.
- Typed DELETE and password-confirmed account deletion with cascading removal of account data and anonymization of retained safety reports.
- Development privacy/community/deletion notices, safety guidance, keyboard labels and responsive layouts.
- GitHub Actions tests, Docker packaging, example configuration and deployment notes.

## Verify

```sh
npm run check
npm test
```

Integration tests run a temporary in-memory database and exercise the actual server request handler with streamed request objects, without requiring network sockets. They cover adult eligibility, consent, private profile fields, pause/filter behavior, mutual matches, unauthorized conversation access, blocking, moderation authorization, suspension, deletion, origin checks and invalid photo formats. Tests do not send email or contact external services. Live HTTP/browser testing was blocked by this authoring environment’s loopback network restrictions; it remains a deployment verification task.

## GitHub

This folder is the repository root. Keep all account data, `.env` files, secrets and original business agreements out of Git. Do not place a token in a remote URL. Repository visibility should initially be private. No open-source license has been granted by this scaffold.

Once an empty private repository has been created in the chosen GitHub account:

```sh
git init -b main
git add .
git commit -m "Build DTP37 Connect dating app MVP"
git remote add origin https://github.com/YOUR_ACCOUNT/YOUR_REPOSITORY.git
git push -u origin main
```

Replace the repository URL with the actual destination. GitHub Pages cannot run this backend. Use a Node hosting service with a persistent disk or a container host. See `DEPLOYMENT.md` before public hosting. The source repository is https://github.com/deebrown37/.bubblespoons. A successful Actions check validates source tests; it does not host or publish the app.

## Architecture

`server.mjs` implements HTTP APIs, authorization, prepared SQL, transactional writes, static-file allowlisting and moderation. `public/` contains the interface, local illustrations, web manifest and shared signup validator. The database has users, sessions, reactions, matches, messages, blocks, photos, reports and moderation audit tables. There are no browser-stored passwords or session tokens.

The browser uses only same-origin APIs; there are no external fonts, analytics, maps, stock images, AI calls, or direct browser payment API calls. Configured Stripe and Checkr requests run on the server. No API keys are required to run locally. This intentionally avoids pretending that unconfigured third-party services work.

## Development boundaries

This app still needs verified email and password recovery, production image decoding/re-encoding and metadata removal, stronger abuse defenses, a staffed moderation program, approved legal policies and launch review. Date-of-birth self-declaration is not identity or robust age assurance. Read `DEPLOYMENT.md` for the full handover checklist. Do not invite real dating users before those requirements are addressed.

Node references: [SQLite API](https://nodejs.org/docs/latest-v24.x/api/sqlite.html), [Crypto API](https://nodejs.org/docs/latest-v24.x/api/crypto.html).


## Spoon workflows

The **Spoon account** screen implements the supplied workflow list: a server-validated age screen and persisted eligibility flag, encrypted front/back ID uploads with one completion reward per side, dated risk agreement/withdrawal, disclosure signing, notification permission choices, screening fees and invitations, chat requests, blocking/unblocking, video sharing, two-party private consent, questionnaires, verified purchases, points and store rewards, support, and account deletion.

Buyers can open **Buy hours** on a Be a spoon profile. The server requires the member's manual eligibility and Stripe account readiness, and rechecks roles, age, blocks and Stripe account status before checkout. These bookings are for lawful non-sexual companionship only. Choosing a Spoon role never automatically grants eligibility or proves identity.

The browser cannot set paid status, award purchase points, mark screening complete or grant administrative access. Stripe sessions are fetched and matched to the saved owner, order, currency and amount. Purchase references and rewards are unique; replayed returns/events cannot credit twice. Signed Stripe webhooks also retrieve the event from Stripe. Price and reward amounts are stored with the order.

Existing accounts must reconfirm their saved date of birth to obtain the new age flag. Changing an existing account's birth date requires a support process. An anonymous age check lasts 30 minutes and is consumed by signup. Self-declared birth dates are not verified age assurance.

See [WORKFLOWS.md](WORKFLOWS.md) for setup, workflow routes, provider requirements and remaining launch work. API keys, encrypted files and live member data must never be committed to GitHub.
