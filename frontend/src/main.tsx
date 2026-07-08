import React from "react";
import ReactDOM from "react-dom/client";
import { App } from "./App";
import "./styles.css";

async function loadRuntimeConfig() {
  try {
    const response = await fetch(`${import.meta.env.BASE_URL}config.json`, {
      cache: "no-store"
    });

    if (!response.ok) return;

    window.SIGNATURE_APP_CONFIG = {
      ...(window.SIGNATURE_APP_CONFIG || {}),
      ...(await response.json())
    };
  } catch {
    window.SIGNATURE_APP_CONFIG = window.SIGNATURE_APP_CONFIG || {};
  }
}

function render() {
  ReactDOM.createRoot(document.getElementById("root")!).render(
    <React.StrictMode>
      <App />
    </React.StrictMode>
  );
}

void loadRuntimeConfig().finally(render);
