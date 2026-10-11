import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import App from "./App";
import "./index.css";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>
);

// Solo en producción: en desarrollo el service worker sirve código viejo de la caché (H-46)
if (import.meta.env.PROD && "serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register(`/sw.js?v=${encodeURIComponent(import.meta.env.VITE_APP_VERSION)}`)
      .then((reg) => console.info("[SW] Registered successfully:", reg.scope))
      .catch((err) => console.error("[SW] Registration failed:", err));
  });
}
