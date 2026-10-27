import { FormEvent, useEffect, useState } from "react";
import { ArrowRight, Check, Clock3, LogOut, ShieldCheck, Sparkles } from "lucide-react";
import type { Session } from "@supabase/supabase-js";
import { getDemoResponse, type AssistantResponse, type TaskMode } from "./lib/assistant";
import { hasSupabaseConfig, supabase } from "./lib/supabase";

const modes: { id: TaskMode; label: string }[] = [
  { id: "NEW_TASK", label: "New task" },
  { id: "NEXT_STEP", label: "Next step" },
  { id: "TOO_HARD", label: "This feels hard" },
  { id: "TIME_CHECK", label: "Check my time" }
];

export default function App() {
  const [session, setSession] = useState<Session | null>(null);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [authMode, setAuthMode] = useState<"signup" | "signin">("signup");
  const [authMessage, setAuthMessage] = useState("");
  const [task, setTask] = useState("");
  const [mode, setMode] = useState<TaskMode>("NEW_TASK");
  const [response, setResponse] = useState<AssistantResponse | null>(null);
  const [done, setDone] = useState(false);

  useEffect(() => {
    if (!supabase) return;
    supabase.auth.getSession().then(({ data }) => setSession(data.session));
    const { data } = supabase.auth.onAuthStateChange((_event, next) => setSession(next));
    return () => data.subscription.unsubscribe();
  }, []);

  async function handleAuth(e: FormEvent) {
    e.preventDefault();
    setAuthMessage("");
    if (!supabase) {
      setAuthMessage("Add your Supabase URL and publishable/anon key to .env.local first.");
      return;
    }
    const result = authMode === "signup"
      ? await supabase.auth.signUp({ email, password })
      : await supabase.auth.signInWithPassword({ email, password });
    if (result.error) setAuthMessage(result.error.message);
    else if (authMode === "signup" && !result.data.session) setAuthMessage("Check your email for the confirmation link, then sign in.");
    else setAuthMessage("You're all set.");
  }

  async function signOut() {
    if (supabase) await supabase.auth.signOut();
    setSession(null);
  }

  function makeStep(e: FormEvent) {
    e.preventDefault();
    setDone(false);
    setResponse(getDemoResponse(task, mode));
  }

  return <main className="shell">
    <nav className="nav"><a className="brand" href="#"><span className="mark"><Sparkles size={17}/></span>stepwise</a><div className="nav-actions"><span className="status"><i/> gentle mode on</span>{session && <button className="outline" onClick={signOut}><LogOut size={14}/> Sign out</button>}</div></nav>
    <section className="hero">
      <div className="hero-copy"><p className="eyebrow">LESS PRESSURE. MORE MOMENTUM.</p><h1>You don't need<br/>to do it all.<br/><span>Just start here.</span></h1><p className="intro">A calmer way to get moving. Turn the thing you're avoiding into one tiny step you can do right now.</p><a className="cta" href="#workspace">Find my first step <ArrowRight size={16}/></a><div className="trust"><span><ShieldCheck size={15}/> No shame, ever</span><span><Clock3 size={15}/> Under 60 seconds</span></div></div>
      <div className="visual"><div className="halo"/><div className="portrait"><div className="head"/><div className="neck"/><div className="body"/></div><div className="float f1"><b>Small counts.</b><small>Progress without pressure</small></div><div className="float f2"><b>One thing at a time</b><small>That's the whole strategy</small></div><span className="art-note">3D hero animation placeholder</span></div>
    </section>
    <section id="workspace" className="workspace"><div className="section-head"><div><p className="eyebrow">YOUR WORKSPACE</p><h2>Let's make it smaller.</h2></div><p>No giant plans. No guilt spiral.<br/>Just the next doable thing.</p></div>
      <div className="columns"><div className="panel"><div className="panel-title"><span className="icon"><Sparkles size={17}/></span><div><b>What's on your mind?</b><small>Messy thoughts are welcome.</small></div></div><form onSubmit={makeStep}><label htmlFor="task">THE THING YOU NEED TO DO</label><textarea id="task" rows={4} value={task} onChange={e=>setTask(e.target.value)} placeholder="e.g. study for my exam, clean my room, reply to that email..."/><label>WHAT DO YOU NEED RIGHT NOW?</label><div className="modes">{modes.map(m=><button type="button" key={m.id} className={mode===m.id?"selected":""} onClick={()=>setMode(m.id)}>{m.label}</button>)}</div><button className="primary" type="submit">Find my micro-step <ArrowRight size={16}/></button></form><p className="note"><ShieldCheck size={13}/> Demo mode: tasks stay in this browser session.</p></div>
      <div className="panel result">{!response?<div className="empty"><span className="icon large"><Sparkles size={22}/></span><p className="eyebrow">YOUR NEXT STEP</p><h3>We'll figure it out<br/>one breath at a time.</h3><p>Your tiny step will show up here. It should feel almost too easy.</p></div>:<><div className="result-head"><span className="eyebrow">✳ YOUR MICRO-STEP</span><span className="muted"><Clock3 size={13}/> about 30 sec</span></div><h3>{response.optimized_task_title}</h3><div className="step"><span>01</span><p>{response.the_micro_step}</p></div><p className="encouragement">{response.dopamine_hook}</p><div className="time"><b>{response.time_guess_prompt}</b><p>{response.time_feedback}</p></div><button className="primary" onClick={()=>setDone(!done)}>{done?<><Check size={16}/> Step complete — nice work</>:<>I did the tiny step <Check size={16}/></>}</button></>}</div></div>
    </section>
    <section className="auth"><div><p className="eyebrow">SAVE YOUR PROGRESS</p><h2>A little more support,<br/>when you're ready.</h2><p className="muted">Sign in to start building your own gentle routine. Explore the workspace without an account.</p></div><div className="panel auth-panel"><div className="panel-title"><span className="icon"><ShieldCheck size={17}/></span><div><b>{authMode==="signup"?"Create your account":"Welcome back"}</b><small>{hasSupabaseConfig?"Secured by Supabase Auth":"Connect Supabase to enable accounts"}</small></div></div><form onSubmit={handleAuth}><label htmlFor="email">EMAIL</label><input id="email" type="email" autoComplete="email" required value={email} onChange={e=>setEmail(e.target.value)} placeholder="you@example.com"/><label htmlFor="password">PASSWORD</label><input id="password" type="password" minLength={6} autoComplete={authMode==="signup"?"new-password":"current-password"} required value={password} onChange={e=>setPassword(e.target.value)} placeholder="At least 6 characters"/><button className="primary" type="submit">{authMode==="signup"?"Create account":"Sign in"} <ArrowRight size={16}/></button></form><button className="switch" onClick={()=>{setAuthMode(authMode==="signup"?"signin":"signup");setAuthMessage("");}}>{authMode==="signup"?"Already have an account? Sign in":"New here? Create an account"}</button>{authMessage&&<p className="auth-message" role="status">{authMessage}</p>}{session&&<p className="auth-message">Signed in as {session.user.email}</p>}</div></section>
    <footer><a className="brand" href="#"><span className="mark"><Sparkles size={14}/></span>stepwise</a><span>Made for real brains, on real days.</span><span>Progress over pressure <b>✳</b></span></footer>
  </main>;
}
