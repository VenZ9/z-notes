"use client";

import { useEffect, useState } from "react";
import { applyTheme } from "@/lib/theme";
import {
  DEFAULT_PREFERENCES,
  type Preferences,
  type ProviderStatus,
} from "@/lib/types";

export default function SettingsPage() {
  const [prefs, setPrefs] = useState<Preferences>(DEFAULT_PREFERENCES);
  const [statuses, setStatuses] = useState<ProviderStatus[]>([]);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  async function load() {
    const [prefsRes, statusRes] = await Promise.all([
      fetch("/api/preferences"),
      fetch("/api/providers/status"),
    ]);

    if (prefsRes.ok) setPrefs(await prefsRes.json());
    if (statusRes.ok) setStatuses(await statusRes.json());
  }

  useEffect(() => {
    load();
  }, []);

  async function save() {
    setBusy(true);
    setMessage(null);

    const res = await fetch("/api/preferences", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(prefs),
    });

    if (res.ok) {
      const data = await res.json();
      setPrefs(data);
      applyTheme(data.theme);
      setMessage("Settings saved.");
    } else {
      setMessage("Failed to save settings.");
    }

    setBusy(false);
  }

  async function refreshProviders() {
    setBusy(true);
    const res = await fetch("/api/providers/status?force=1");
    if (res.ok) setStatuses(await res.json());
    setBusy(false);
  }

  return (
    <div className="space-y-4 max-w-4xl">
      <div className="card p-4">
        <h1 className="text-xl font-semibold mb-1">Settings</h1>
        <p className="muted small">
          Persistent preferences and provider diagnostics. API keys remain
          server-side and are never exposed to the browser.
        </p>
      </div>

      {message ? <div className="banner">{message}</div> : null}

      <div className="card p-4 space-y-4">
        <h2 className="font-semibold">Appearance</h2>

        <label className="block">
          <div className="font-medium mb-1">Theme</div>
          <select
            className="select"
            value={prefs.theme}
            onChange={(e) => {
              const theme = e.target.value as Preferences["theme"];
              setPrefs((prev) => ({ ...prev, theme }));
              applyTheme(theme);
            }}
          >
            <option value="system">System</option>
            <option value="light">Light</option>
            <option value="dark">Dark</option>
          </select>
        </label>
      </div>

      <div className="card p-4 space-y-4">
        <h2 className="font-semibold">Generation defaults</h2>

        <div className="grid gap-3 md:grid-cols-2">
          <label>
            <div className="font-medium mb-1">Depth</div>
            <select
              className="select"
              value={prefs.settings.depth || "standard"}
              onChange={(e) =>
                setPrefs((prev) => ({
                  ...prev,
                  settings: {
                    ...prev.settings,
                    depth: e.target.value as any,
                  },
                }))
              }
            >
              <option value="brief">Brief</option>
              <option value="standard">Standard</option>
              <option value="thorough">Thorough</option>
            </select>
          </label>

          <label>
            <div className="font-medium mb-1">Max sources</div>
            <input
              className="input"
              type="number"
              min={1}
              max={8}
              value={prefs.settings.maxSources || 5}
              onChange={(e) =>
                setPrefs((prev) => ({
                  ...prev,
                  settings: {
                    ...prev.settings,
                    maxSources: Number(e.target.value),
                  },
                }))
              }
            />
          </label>

          <label>
            <div className="font-medium mb-1">Temperature</div>
            <input
              className="input"
              type="number"
              step="0.1"
              min="0"
              max="1"
              value={prefs.settings.temperature ?? 0.2}
              onChange={(e) =>
                setPrefs((prev) => ({
                  ...prev,
                  settings: {
                    ...prev.settings,
                    temperature: Number(e.target.value),
                  },
                }))
              }
            />
          </label>

          <label>
            <div className="font-medium mb-1">Max tokens</div>
            <input
              className="input"
              type="number"
              min="256"
              max="8192"
              value={prefs.settings.maxTokens ?? 1800}
              onChange={(e) =>
                setPrefs((prev) => ({
                  ...prev,
                  settings: {
                    ...prev.settings,
                    maxTokens: Number(e.target.value),
                  },
                }))
              }
            />
          </label>
        </div>

        <button className="btn btn-primary" onClick={save} disabled={busy}>
          Save settings
        </button>
      </div>

      <div className="card p-4 space-y-3">
        <div className="flex items-center justify-between gap-3">
          <h2 className="font-semibold">Provider status</h2>
          <button className="btn" onClick={refreshProviders} disabled={busy}>
            Refresh live checks
          </button>
        </div>

        <p className="muted small">
          Gemini is configured to use exactly <code>gemini-3.8-flash</code>. If
          unavailable, the app reports it and fails over without substitution.
          Kilo compatibility is probed at runtime against the configured
          endpoint.
        </p>

        <div className="overflow-auto">
          <table className="w-full text-sm">
            <thead>
              <tr
                className="text-left border-b"
                style={{ borderColor: "var(--border)" }}
              >
                <th className="py-2 pr-3">Provider</th>
                <th className="py-2 pr-3">Enabled</th>
                <th className="py-2 pr-3">Model</th>
                <th className="py-2 pr-3">Status</th>
                <th className="py-2">Message</th>
              </tr>
            </thead>
            <tbody>
              {statuses.map((status) => (
                <tr
                  key={status.name}
                  className="border-b align-top"
                  style={{ borderColor: "var(--border)" }}
                >
                  <td className="py-2 pr-3 font-medium">{status.label}</td>
                  <td className="py-2 pr-3">{status.enabled ? "yes" : "no"}</td>
                  <td className="py-2 pr-3 break-all">{status.model || "—"}</td>
                  <td className="py-2 pr-3">
                    <span
                      className={`badge ${
                        status.modelAvailable === "available"
                          ? "badge-ok"
                          : status.modelAvailable === "unavailable" ||
                              status.modelAvailable === "error"
                            ? "badge-danger"
                            : "badge-warn"
                      }`}
                    >
                      {status.modelAvailable}
                    </span>
                  </td>
                  <td className="py-2 muted small break-all">
                    {status.message || "—"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <div className="card p-4 space-y-2">
        <h2 className="font-semibold">Required environment variables</h2>
        <ul className="small ml-4 list-disc space-y-1">
          <li>
            Database: <code>POSTGRES_URL</code>
          </li>
          <li>
            Groq: <code>GROQ_API_KEY</code>, optional <code>GROQ_MODEL</code>
          </li>
          <li>
            Gemini: <code>GEMINI_API_KEY</code>
          </li>
          <li>
            Kilo: <code>KILO_API_KEY</code>, <code>KILO_MODEL</code>
          </li>
          <li>
            Research: <code>TAVILY_API_KEY</code>
          </li>
        </ul>
      </div>
    </div>
  );
}
