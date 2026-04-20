export type DomainJobInput = {
  dryRun?: boolean;
};

export type DomainJobResult = {
  jobName: string;
  status: "stub";
  dryRun: boolean;
  processedCount: number;
  skippedCount: number;
  timestampUtc: string;
  notes: string[];
};

export type DomainJob = (input?: DomainJobInput) => Promise<DomainJobResult>;
