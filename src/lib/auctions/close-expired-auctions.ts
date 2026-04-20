import { createStubJob } from "../jobs/create-stub-job";

export const closeExpiredAuctions = createStubJob("auctions.closeExpired", [
  "Scaffolded job only.",
  "Future implementation will select ended auction listings and resolve the highest valid bidder."
]);
