# Todo for ADHD — ADHD-friendly task assistant

Todo for ADHD helps users begin overwhelming work with one tiny, concrete action at a time. It is designed to feel supportive, not demanding.

## Features in this repository

- Responsive dark interface with muted green accents.
- Four modes: `NEW_TASK`, `NEXT_STEP`, `TOO_HARD`, and `TIME_CHECK`.
- Structured micro-step response with a supportive encouragement and time-estimate prompt.
- Saved task list stored in browser local storage, including completion and time feedback.
- Optional reminders with a repeating in-app sound, mobile vibration where supported, and browser notifications. Keep the app open for the reminder to fire; web alarms cannot guarantee delivery when the browser/device is asleep or the app is closed.
- Supabase email/password authentication.
- Optional Supabase cloud task sync protected by Row Level Security (RLS).
- Supabase Edge Function for authenticated AI requests. If no OpenAI key is configured, it returns a safe built-in response.
- SQL migration for the user-owned tasks table and RLS policies.

## Deploy to Vercel

1. Import this GitHub repository into Vercel.
2. Keep the framework preset as **Vite** and the build command as `npm run build`.
3. Add `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` as environment variables only if you have configured your own Supabase project.
4. Deploy. Then add your deployed domain to the Supabase Auth redirect URL allowlist.
5. Set `OPENAI_API_KEY` only in Supabase Edge Function secrets, never in Vercel `VITE_*` variables.

A Vercel configuration file supplies SPA fallback and baseline security headers.

## Run locally

1. Install Node.js LTS.
2. Clone the repo and open it in VS Code.
3. Install dependencies with `npm install`.
4. Copy `.env.example` to `.env.local` and add your Supabase project URL and publishable/anon key.
5. Run `npm run dev`.

The local task flow works without Supabase configuration. Guest tasks and each signed-in account have separate local storage. Authentication, cloud sync and the Edge Function need your Supabase project.

## Supabase setup

1. Create a Supabase project.
2. In **SQL Editor**, run `supabase/migrations/001_create_tasks.sql`.
3. Set `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` in local `.env.local`.
4. Deploy the Edge Function named `stepwise-assistant` from `supabase/functions/stepwise-assistant/index.ts`.
5. Set the function secrets:
   - `OPENAI_API_KEY` — optional, for real AI output.
   - `OPENAI_MODEL` — optional; defaults to `gpt-4o-mini`.
6. The function uses `SUPABASE_URL` and `SUPABASE_ANON_KEY` provided by the Supabase Edge Function environment. It validates the caller's session before processing.
7. In Supabase Auth settings, configure the Site URL and allowed redirect URLs for your local and deployed app.

Deploy with the Supabase CLI from the repository root:

```bash
supabase login
supabase link --project-ref YOUR_PROJECT_REF
supabase db push
supabase secrets set OPENAI_API_KEY=YOUR_KEY
supabase functions deploy stepwise-assistant
```

If you do not want AI enabled yet, omit the OpenAI key and the authenticated function returns its built-in response. Never put an OpenAI key, service-role key, or other private secret in a `VITE_*` variable or commit it to GitHub.

## Run on your laptop and phone

### Laptop (local development)

1. Install the current Node.js LTS release from https://nodejs.org and install Git if needed.
2. Open PowerShell or the VS Code terminal and run:

   ```bash
   git clone https://github.com/prachethans-bot/todo.git
   cd todo
   npm install
   npm run dev
   ```

3. Open the local URL Vite prints, usually http://localhost:5173. You can use the app without Supabase; tasks are saved in that browser on that device.

### Test on your phone over the same Wi-Fi

1. Connect your phone and laptop to the same Wi-Fi network.
2. In the project folder on the laptop, run `npm run dev -- --host 0.0.0.0`.
3. Find your laptop's local IPv4 address (Windows PowerShell: `ipconfig`; look for IPv4 Address under the active Wi-Fi adapter).
4. On the phone, open `http://LAPTOP-IP:5173`, replacing `LAPTOP-IP` with that address. If it does not load, allow Node.js/Vite through Windows Firewall on your private network.
5. This is for local testing only. The laptop must stay on and the dev server must keep running. HTTP over a local IP may not support install prompts, service workers, or notifications on every phone/browser.

### Install it like an app on both devices (recommended)

1. Deploy the repo to an HTTPS host such as Vercel: sign in at https://vercel.com, choose **Add New → Project**, import `prachethans-bot/todo`, use the Vite preset and `npm run build`, then deploy.
2. If you have not set up Supabase yet, leave its environment variables unset; local task mode still works. Authentication, cloud sync, and connected AI need a configured Supabase project.
3. Open the deployed HTTPS URL in Chrome on Android and choose **⋮ → Add to Home screen** or **Install app**. On iPhone, open the URL in Safari, tap **Share → Add to Home Screen**.
4. On the laptop, open the same HTTPS URL in Chrome or Edge and use the install icon in the address bar or browser menu → **Install app**.
5. Open the installed app once, allow notifications when prompted after setting a reminder, and test with a reminder one or two minutes ahead.

A deployed HTTPS URL is needed for the most consistent PWA install experience. Installing the PWA does not turn browser timers into guaranteed OS alarms. Test the alarm on each device before relying on it.

## Install and offline basics

The production build registers a small service worker and includes a web app manifest. Once opened online, the app shell and same-origin static assets can be cached for later visits. AI requests and Supabase authentication/cloud sync still require an internet connection. Browser reminder timers are not guaranteed while the browser is closed.

## Accessibility and motion

- Keyboard focus styles and a skip link are included.
- The hero uses a real-time Three.js 3D-rendered, animated motivational athlete character with lighting, facial structure, idle movement, and reduced-motion support.
- The portrait is an abstract illustration, not an official likeness or an imported 3D model.

## Build

```bash
npm run build
npm run preview
``

## Known limitations

- The hero is a procedurally built 3D athlete, not an exact David Goggins likeness or a scanned/rigged human model. A faithful likeness needs a properly licensed, detailed 3D model and animation asset.
- The alarm repeats sound while the app page is running and visible; browser notifications require permission. Browsers can suspend timers, and web apps cannot guarantee alarms when closed or the device is asleep. For guaranteed background alarms, package as a native app with OS-scheduled notifications or add a push-notification backend.
- Cloud task sync requires the SQL migration and a correctly configured Supabase project.
- The AI function requires deployment; real AI generation additionally requires an OpenAI API key stored as a server-side secret.
- The app is an early-stage product and should receive a local build, accessibility, and security review before public launch.

## Security notes

- Frontend Supabase keys are public by design; protect data with RLS.
- Never expose service-role or AI provider keys in frontend code.
- The Edge Function validates the caller with Supabase Auth before accepting a task.
- Tasks may contain personal information. Avoid entering sensitive data and review privacy and retention practices before launch.
