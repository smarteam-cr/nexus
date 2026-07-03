/**
 * lib/marketing/poll-run.ts — polling client-safe del status de una corrida
 * (calca lib/clients/poll-agent-run.ts). La ingesta secuencial de varias fuentes
 * puede tardar minutos → timeout 10 min.
 */

export interface PolledMarketingRun {
  status: "RUNNING" | "DONE" | "ERROR" | "TIMEOUT";
  phase?: string | null;
  newPostsCount?: number | null;
  fetchedPostsCount?: number | null;
  sourcesOkCount?: number | null;
  sourcesErrorCount?: number | null;
  contentIdeasCount?: number | null;
  campaignIdeasCount?: number | null;
  pillarSuggestionsCount?: number | null;
  error?: string | null;
  kind?: "INGEST" | "GENERATE" | "CHAIN";
}

export async function pollMarketingRun(
  runId: string,
  opts?: { intervalMs?: number; maxAttempts?: number; onTick?: (run: PolledMarketingRun) => void },
): Promise<PolledMarketingRun> {
  const intervalMs = opts?.intervalMs ?? 3000;
  const maxAttempts = opts?.maxAttempts ?? 200; // ~10 min

  for (let i = 0; i < maxAttempts; i++) {
    await new Promise((r) => setTimeout(r, intervalMs));
    let run: PolledMarketingRun | undefined;
    try {
      const res = await fetch(`/api/marketing/runs/${runId}`);
      if (!res.ok) continue;
      const data = (await res.json()) as { run?: PolledMarketingRun };
      run = data.run;
    } catch {
      continue; // fallo puntual de red → reintentar
    }
    if (!run) continue;
    opts?.onTick?.(run);
    if (run.status === "DONE" || run.status === "ERROR") return run;
  }
  return { status: "TIMEOUT" };
}
