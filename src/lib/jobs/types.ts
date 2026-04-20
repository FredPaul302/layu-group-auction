export type DomainJobInput = {
  dryRun?: boolean;
};

export type DomainJobResult = {
  jobName: string;
  status: "stub" | "completed";
  dryRun: boolean;
  processedCount: number;
  skippedCount: number;
  timestampUtc: string;
  notes: string[];
};

export type DomainJob = (input?: DomainJobInput) => Promise<DomainJobResult>;
