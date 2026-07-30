import { z } from "zod";

const repositoryBackendSchema = z.enum(["sqlite", "postgres"]);

export function repositoryBackend(
  environment: Record<string, string | undefined> = process.env,
): "sqlite" | "postgres" {
  return repositoryBackendSchema.parse(environment.HIG_REPOSITORY_BACKEND ?? "sqlite");
}

export function postgresShadowReadsEnabled(
  environment: Record<string, string | undefined> = process.env,
): boolean {
  return environment.HIG_POSTGRES_SHADOW_READS === "true";
}

export type PostgresShadowMetric = {
  comparisons: number;
  mismatches: number;
  failures: number;
};

const shadowMetrics = new Map<string, PostgresShadowMetric>();

export function recordPostgresShadowComparison(
  label: string,
  outcome: "match" | "mismatch" | "failure",
): void {
  const metric = shadowMetrics.get(label) ?? {
    comparisons: 0,
    mismatches: 0,
    failures: 0,
  };
  metric.comparisons += 1;
  if (outcome === "mismatch") metric.mismatches += 1;
  if (outcome === "failure") metric.failures += 1;
  shadowMetrics.set(label, metric);
  if (outcome !== "match") {
    console.warn("PostgreSQL shadow-read comparison", {
      repository: label,
      outcome,
    });
  }
}

export function postgresShadowComparisonMetrics(): Record<string, PostgresShadowMetric> {
  return Object.fromEntries(
    [...shadowMetrics.entries()].map(([label, metric]) => [label, { ...metric }]),
  );
}

export function resetPostgresShadowComparisonMetrics(): void {
  shadowMetrics.clear();
}

export function schedulePostgresShadowRead<Result>(
  label: string,
  sqliteResult: Result,
  postgresRead: () => Promise<Result>,
): void {
  if (!postgresShadowReadsEnabled()) return;
  void postgresRead().then((postgresResult) => {
    if (JSON.stringify(postgresResult) !== JSON.stringify(sqliteResult)) {
      recordPostgresShadowComparison(label, "mismatch");
    } else {
      recordPostgresShadowComparison(label, "match");
    }
  }).catch(() => {
    recordPostgresShadowComparison(label, "failure");
  });
}
