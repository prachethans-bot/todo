# Todo AI Android APK build

This branch adds a GitHub Actions workflow to build a debug APK from the existing Vite/React + Capacitor project.

## Required GitHub repository secrets

In GitHub, open Settings -> Secrets and variables -> Actions -> New repository secret. Add:

- `VITE_SUPABASE_URL`: your Supabase project URL (not a secret by itself, but needed at build time)
- `VITE_SUPABASE_ANON_KEY`: your Supabase publishable/anon key (never use the service-role key here)

These values must match the environment variables configured for the Vercel frontend. Do not add your Gemini API key to the frontend or GitHub workflow. Keep Gemini in Supabase Edge Function secrets.

## Run the build from Android phone

1. Open the repository and switch to branch `android-apk-build`.
2. Open the Actions tab.
3. Select **Build Todo AI Android APK**.
4. Tap **Run workflow** and choose branch `android-apk-build`.
5. Wait for the workflow to finish successfully.
6. Open the successful run and download the `todo-ai-debug-apk` artifact ZIP.
7. Extract it on your phone and install `app-debug.apk`.

A debug APK is for testing and is not a signed release for publishing to Google Play. Test sign-in, photo capture, AI verification, and reminders on the phone before relying on it.

## Important limitations

- This workflow builds the Android app; it does not itself fix any broken camera flow. The app's camera UI and Supabase Edge Function invocation must already be correctly implemented.
- The current repository's package configuration includes Capacitor Android and local notifications. This workflow uses the existing Android project and runs `npx cap sync android`.
- The workflow intentionally does not use the Gemini secret. AI requests should go through the existing Supabase Edge Function.
