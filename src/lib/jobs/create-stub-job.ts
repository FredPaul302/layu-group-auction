import type { DomainJob, DomainJobInput, DomainJobResult } from "./types";

export function createStubJob(
  jobName: string,
  notes: string[]
): DomainJob {
  return async (input: DomainJobInput = {}): Promise<DomainJobResult> => {
    const completedAtUtc = new Date().toISOString();

    return {
      jobName,
      status: "stub",
      dryRun: input.dryRun ?? false,
      processedCount: 0,
      skippedCount: 0,
      errorCount: 0,
      startedAtUtc: completedAtUtc,
      completedAtUtc,
      timestampUtc: completedAtUtc,
      metrics: {},
      notes
    };
  };
}
