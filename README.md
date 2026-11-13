# வினை — fresh ADHD-friendly task and focus app

வினை is a low-pressure task, focus, timed-planning, and accountability app. This branch rebuilds the product experience while keeping the repository's `main` branch untouched.

## Implemented

- Phone-first monochrome black, graphite, and silver interface with a Tamil wordmark.
- Today, Timed plan, and My buddy sections.
- Email/password sign-up and sign-in through Supabase Auth.
- Private task CRUD using the existing `public.tasks` table and authenticated-user RLS policies.
- Server-side AI microsteps through `stepwise-assistant`, with a local fallback.
- AI-generated timed plans through the new `timed-plan-assistant` Edge Function, with a local fallback.
- Editable plan steps and durations (15–240 minute total plan length).
- Focus timer with pause/resume, saved progress notes, and a small-step reset.
- Instant checkbox completion, +10 points, a 1-in-5 +25 bonus, undo, a brief reward animation, soft sound, and optional vibration.
- Local activity-day streak and points.
- Private buddy invitation links and focus-status sharing using the existing buddy RPC functions.
- Android local reminders through Capacitor Local Notifications.
- PWA manifest, Tamil icon, and an offline app-shell cache.

## Backend

The existing Supabase project is reused. It already has authenticated task RLS, buddy RPC functions, and the `stepwise-assistant` function. This branch adds the `timed-plan-assistant` function and a `points_awarded` column on tasks.

AI provider credentials remain in Supabase Edge Function secrets. The browser only uses the public Supabase URL and publishable/anon key.

## Run locally

Requirements: Node.js 20 or newer.

```bash
cp .env.example .env
npm ci
npm run dev
```

Set `VITE_PUBLIC_URL` to the deployed web origin when building the Android app so buddy invite links open the web invitation page.

## Production web build

```bash
npm run build
npm run preview
```

GitHub Actions runs a TypeScript/Vite production build on the fresh branch and uploads the `dist` artifact.

## Android

The Today hero uses the character artwork cropped from the latest generated Vinai concept image in the ChatGPT Library.

The Capacitor application ID is `com.vinai.focus`.

```bash
npm run cap:sync
npm run cap:android
```

Build a debug or signed release APK from Android Studio. The `Fresh Vinai Android APK` GitHub Actions workflow also builds a debug APK on pushes and pull requests to this branch and uploads it as the `vinai-debug-apk` artifact. Android local notifications are scheduled with the OS and can fire while the app is closed, subject to notification permission, exact-alarm policy, battery restrictions, and device-vendor behavior.

## Not yet verified / remaining work

- Vercel preview builds are still pending; inspect the build and runtime logs before calling the web release ready.
- Supabase Auth email confirmation, redirect URLs, and password-reset flow need a real account test.
- Physical Android tests are required for notification permission, app-closed delivery, device reboot, and battery optimization.
- Repeating alarms, snooze, exact-alarm permission education, and reboot rescheduling are not yet implemented in this fresh branch.
- Points and streaks are stored locally, not in a server-authoritative per-user ledger.
- Timed-plan edits are currently session state and are not persisted to the cloud.
- Offline cloud-write reconciliation and multi-device conflict handling are not implemented.
- Buddy invitation and status sharing need a two-account end-to-end test.

The task checkbox completes immediately. There is no camera/photo proof flow in this fresh UI.
