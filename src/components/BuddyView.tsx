import { useEffect, useState, type ReactNode } from "react";
import {
  CHEER_EMOJI,
  MAX_CHEERS_PER_SESSION,
  acceptInvite,
  fetchBuddyView,
  sendCheer,
  type BuddyView as BuddyViewData
} from "../lib/buddy";

const ACCEPTED_KEY = "todo-adhd.buddyAccepted.";

/** Lightweight screen the friend sees from the invite link. No tasks, points, streaks or history. */
export function BuddyView({ token }: { token: string }) {
  const [view, setView] = useState<BuddyViewData | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [accepted, setAccepted] = useState(() => localStorage.getItem(ACCEPTED_KEY + token) === "1");
  const [declined, setDeclined] = useState(false);
  const [sent, setSent] = useState("");

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      const next = await fetchBuddyView(token);
      if (!cancelled) {
        setView(next);
        setLoaded(true);
      }
    };
    void load();
    const timer = window.setInterval(() => void load(), accepted ? 5000 : 15000);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, [token, accepted]);

  async function accept() {
    const ok = await acceptInvite(token);
    if (ok) {
      localStorage.setItem(ACCEPTED_KEY + token, "1");
      setAccepted(true);
    } else {
      const next = await fetchBuddyView(token);
      setView(next);
    }
  }

  async function cheer(emoji: string) {
    const ok = await sendCheer(token, emoji);
    setSent(ok ? "Sent " + emoji : "That's plenty of cheers for now 💚");
    window.setTimeout(() => setSent(""), 2000);
    setView(await fetchBuddyView(token));
  }

  const name = view?.ownerName ?? "Your friend";
  let body: ReactNode;

  if (!loaded) {
    body = <p className="buddy-line">Loading…</p>;
  } else if (!view) {
    body = <p className="buddy-line">This invite link isn't active anymore.</p>;
  } else if (declined) {
    body = <p className="buddy-line">No problem. Thanks for stopping by. 💚</p>;
  } else if (view.state === "pending" && !accepted) {
    body = (
      <>
        <h1>{name} invited you to be their buddy.</h1>
        <div className="buddy-actions">
          <button className="primary" onClick={() => void accept()}>Accept</button>
          <button className="outline" onClick={() => setDeclined(true)}>No thanks</button>
        </div>
      </>
    );
  } else if (view.state === "pending") {
    body = <p className="buddy-line">Waiting for {name} to get started.</p>;
  } else if (!accepted) {
    body = <p className="buddy-line">This invite has already been used.</p>;
  } else if (view.state === "paused") {
    body = <p className="buddy-line">Sharing is paused.</p>;
  } else {
    const left = Math.max(0, MAX_CHEERS_PER_SESSION - view.cheersUsed);
    const canCheer = view.sessionId !== "" && left > 0 && view.activity !== "idle";
    const statusText = view.activity === "focusing" ? "Focusing" : view.activity === "break" ? "On a break" : view.activity === "done" ? "Done" : "";
    body = (
      <>
        {view.activity === "idle" && <p className="buddy-line">{name} isn't in a session right now.</p>}
        {view.activity === "done" && <h1>{name} finished a task!</h1>}
        {(view.activity === "focusing" || view.activity === "break") && (
          <h1>{name} is working on: {view.taskLabel || "something"}</h1>
        )}
        {statusText && <p className="buddy-status" data-activity={view.activity}>{statusText}</p>}
        {canCheer && (
          <div className="buddy-cheers" aria-label="Send a cheer">
            {CHEER_EMOJI.map((emoji) => (
              <button key={emoji} type="button" onClick={() => void cheer(emoji)} aria-label={"Cheer " + emoji}>{emoji}</button>
            ))}
          </div>
        )}
        {sent && <p className="buddy-line" role="status">{sent}</p>}
      </>
    );
  }

  return (
    <main className="buddy-screen">
      <div className="buddy-card">
        <span className="buddy-brand">todo for ADHD · buddy</span>
        {body}
      </div>
    </main>
  );
}
