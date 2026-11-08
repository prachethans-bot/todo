import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import { BuddyView } from "./components/BuddyView";
import { inviteTokenFromUrl } from "./lib/buddy";
import "./styles.css";

if (import.meta.env.PROD && "serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    void navigator.serviceWorker.register("/sw.js").catch(() => {
      // The app remains usable if service workers are unavailable.
    });
  });
}

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>{inviteTokenFromUrl() ? <BuddyView token={inviteTokenFromUrl()!} /> : <App />}</React.StrictMode>
);
