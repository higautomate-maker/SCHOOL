"use client";

import { useEffect, useState } from "react";
import { authenticatedFetch } from "../auth-client";
import styles from "./today-panel.module.css";

type TodayItem = { key: string; label: string; count: number; hint: string };
type TodaySummary = { items: TodayItem[]; empty: boolean };

// Read-only role-aware "Today" panel for the School web dashboard. Data comes
// from GET /api/v1/schools/:id/today, which enforces tenant + role + module
// permissions server-side and returns COUNTS ONLY. Never shows raw errors.
export function SchoolTodayPanel({ schoolId }: { schoolId: string }) {
  const [summary, setSummary] = useState<TodaySummary | null>(null);
  const [state, setState] = useState<"loading" | "ready" | "error">("loading");
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    if (!schoolId) return;
    let active = true;
    (async () => {
      try {
        const response = await authenticatedFetch(
          `/api/v1/schools/${encodeURIComponent(schoolId)}/today`,
          { cache: "no-store", headers: { accept: "application/json" } },
        );
        if (!active) return;
        if (!response.ok) { setState("error"); return; }
        const data = (await response.json()) as { today: TodaySummary };
        if (!active) return;
        setSummary(data.today);
        setState("ready");
      } catch {
        if (active) setState("error");
      }
    })();
    return () => { active = false; };
  }, [schoolId, attempt]);

  const retry = () => { setState("loading"); setAttempt((n) => n + 1); };

  if (state === "loading") {
    return (
      <section className={styles.today} aria-busy="true" data-testid="school-today-loading">
        <h2>Today</h2>
        <div className={styles.grid}>{[0, 1, 2, 3].map((i) => <div key={i} className={styles.skeleton} />)}</div>
      </section>
    );
  }
  if (state === "error") {
    return (
      <section className={styles.today} data-testid="school-today-error">
        <h2>Today</h2>
        <div className={styles.empty}>
          <p>We couldn’t load your summary just now.</p>
          <button type="button" onClick={retry} data-testid="school-today-retry">Try again</button>
        </div>
      </section>
    );
  }
  const items = summary?.items ?? [];
  return (
    <section className={styles.today} data-testid="school-today-panel">
      <div className={styles.head}><h2>Today</h2><span>Your priorities at a glance</span></div>
      {items.length === 0 ? (
        <div className={styles.empty} data-testid="school-today-empty">
          <p>You’re all caught up. New tasks and alerts will appear here.</p>
        </div>
      ) : (
        <div className={styles.grid}>
          {items.map((item) => (
            <div key={item.key} className={styles.tile} data-testid={`school-today-${item.key}`}>
              <b>{item.count}</b>
              <span>{item.label}</span>
              <small>{item.hint}</small>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
