# வினை (Vinai) — ADHD-friendly task and focus app

வினை turns overwhelming tasks into small, clear next actions. The UI uses the monochrome silver-on-black design exported from the supplied Figma Make archive. The original app's task engine, storage, notifications, focus sessions, rewards, buddy flow, Supabase integration, and Capacitor Android shell are preserved.

## Included features

- Four AI helper modes: new task, next step, too hard, and time check, with a local fallback when connected AI is unavailable.
- Saved tasks with estimates, actual-time feedback, local persistence, and optional authenticated Supabase sync.
- Native Android scheduled reminders with repeat notifications, snooze, a round clock picker, and a browser-only fallback while the tab is active.
- A written AI task confirmation screen. It checks the user's update against the saved task and micro-step, rejects unrelated updates, and removes verified tasks from the active list. Camera/photo proof is not included.
- Focus sessions, adjustable timers, editable next-action and progress notes, check-ins, pause/resume, and focus-completion points.
- Points, occasional bonus points, streaks, sound, haptics, visual rewards, and undo.
- Optional accountability-buddy invitations, controlled status sharing, pause/disconnect, and cheers.
- Timed multi-step planner with editable work/break durations and reminder support.

## Local development

```bash
npm install
npm run dev
npm run build
```

## Environment

Set `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` for authentication, cloud sync, AI verification, and buddy invites. Provider keys must stay in Supabase Edge Function secrets. The existing functions are `stepwise-assistant` and `verify-task-start`; the latter uses `GEMINI_API_KEY` server-side.

## Android APK

The repository contains the Capacitor Android project and GitHub Actions APK workflow. A push to `main` that changes app source or public assets triggers a build, publishes the debug APK artifact, and refreshes the `latest` release asset. Native reminders use Android local notifications and are subject to device notification, exact-alarm, and battery settings.

## Important behavior

- Completing a task opens a separate written-confirmation screen, never a camera.
- A relevant written update is verified server-side, saved as a progress note, and the task slides away from the active list.
- Unrelated or generic updates are rejected with guidance, leaving the task active.
- Local task storage is available without signing in. AI verification and cloud buddy features require a configured, signed-in Supabase account.
