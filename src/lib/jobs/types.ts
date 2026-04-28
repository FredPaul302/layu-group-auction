export type DomainJobInput = {
  dryRun?: boolean;
};

export type DomainJobResult = {
  jobName: string;
  status: "stub" | "completed";
  dryRun: boolean;
  processedCount: number;
  skippedCount: number;
  errorCount: number;
  startedAtUtc: string;
  completedAtUtc: string;
  timestampUtc: string;
  metrics: Record<string, number>;
  notes: string[];
};

export type DomainJob = (input?: DomainJobInput) => Promise<DomainJobResult>;
