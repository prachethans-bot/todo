# வினை — fresh application foundation

A calm, monochrome ADHD-friendly task and focus workspace. This branch is a clean rebuild of the visible product experience while keeping the existing repository's main branch untouched.

## Current implementation

- Responsive phone-first interface with a desktop device frame.
- Tamil wordmark, graphite/silver liquid-glass styling, and monochrome hero poster.
- Today, Timed plan, and My buddy sections.
- Local task creation, completion, undo, and deletion.
- Physical micro-step suggestions, including a smaller response for "Too hard".
- Focus countdown with pause/resume/stop and a progress note field.
- Editable timed-plan steps and durations, with a 15–240 minute total-time selector.
- Local points and timezone-local activity-day streak.
- Task reminders through Capacitor Local Notifications on Android.
- Foreground browser reminder checks while the web app is open.
- Local persistence so tasks remain available after refresh.

## Not yet connected

These are intentionally not represented as finished:

- Supabase sign-in, cloud task synchronization, and cross-device recovery.
- Server-side AI generation through the `stepwise-assistant` Edge Function.
- Server-authoritative points ledger and streak transaction.
- Real buddy invites, relationship permissions, and Supabase Realtime.
- Full alarm reconciliation, repeat rules, exact-alarm handling, and device-reboot recovery.
- Two-user RLS verification and real-device notification QA.

The buddy form currently saves a local note only. The task assistant currently uses a deterministic local fallback, not a hosted AI model. Local points and streaks are not tamper-resistant or synced.

## Run locally

Requirements: Node.js 20 or newer.

```bash
npm ci
npm run dev
```

Create a local `.env` from `.env.example` when Supabase is configured. Do not add service-role keys or provider secrets to Vite environment variables.

## Build the web app

```bash
npm run build
npm run preview
```

A GitHub Actions workflow on this branch runs the production TypeScript/Vite build and uploads the `dist` folder as an artifact.

## Android

The repository includes Capacitor and the Android project. Build the web app first, then:

```bash
npm run cap:sync
```

Open the Android project in Android Studio to inspect and build it. Android local notifications depend on OS permission, exact-alarm policy, battery settings, and device-vendor behavior. A local notification is not guaranteed to behave like a dedicated alarm clock.

## Reminder limitations

- Browser timers and notifications are best-effort and only checked while the app is open. Browsers can suspend background tabs.
- Android local notifications are scheduled through the OS, but exact delivery and audible alarm behavior depend on Android version, permission state, and battery optimization.
- This branch has not yet been validated on a physical Android device.

## Security and configuration

The `.env.example` contains only public client configuration placeholders. Keep all privileged Supabase keys and AI provider keys in Supabase Edge Function secrets. Do not commit real credentials.

## Verification status

The source has been committed to the `fresh-vinai-foundation` branch. The automated production build is the next verification gate; no claim is made here that Supabase RLS, Edge Functions, offline cloud reconciliation, or physical-device notifications have passed tests.
