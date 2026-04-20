import type { DomainJob, DomainJobInput, DomainJobResult } from "./types";

export function createStubJob(
  jobName: string,
  notes: string[]
): DomainJob {
  return async (input: DomainJobInput = {}): Promise<DomainJobResult> => ({
    jobName,
    status: "stub",
    dryRun: input.dryRun ?? false,
    processedCount: 0,
    skippedCount: 0,
    timestampUtc: new Date().toISOString(),
    notes
  });
}
