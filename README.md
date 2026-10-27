# Todo for ADHD — ADHD-friendly task assistant

Todo for ADHD helps users begin overwhelming work with one tiny, concrete action at a time. It is designed to feel supportive, not demanding.

## Features in this repository

- Responsive dark interface with muted green accents.
- Four modes: `NEW_TASK`, `NEXT_STEP`, `TOO_HARD`, and `TIME_CHECK`.
- Structured micro-step response with a supportive encouragement and time-estimate prompt.
- Saved task list stored in browser local storage, including completion and time feedback.
- Optional in-page reminder and browser notification support. For reliable alerts, keep the tab open; browser timers are not a guaranteed background alarm system.
- Supabase email/password authentication.
- Optional Supabase cloud task sync protected by Row Level Security (RLS).
- Supabase Edge Function for authenticated AI requests. If no OpenAI key is configured, it returns a safe built-in response.
- SQL migration for the user-owned tasks table and RLS policies.

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

## Build

```bash
npm run build
npm run preview
``

## Known limitations

- The hero uses an animated CSS 3D-style abstract portrait, not a photorealistic David Goggins likeness. A true character animation requires a separately created or licensed model/animation asset.
- Browser notifications require permission, and JavaScript timers may not fire if the browser is closed or suspended. These are gentle reminders, not guaranteed scheduled alarms.
- Cloud task sync requires the SQL migration and a correctly configured Supabase project.
- The AI function requires deployment; real AI generation additionally requires an OpenAI API key stored as a server-side secret.
- The app is an early-stage product and should receive a local build, accessibility, and security review before public launch.

## Security notes

- Frontend Supabase keys are public by design; protect data with RLS.
- Never expose service-role or AI provider keys in frontend code.
- The Edge Function validates the caller with Supabase Auth before accepting a task.
- Tasks may contain personal information. Avoid entering sensitive data and review privacy and retention practices before launch.
