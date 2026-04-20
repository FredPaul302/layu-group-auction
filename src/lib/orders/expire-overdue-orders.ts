import { createStubJob } from "../jobs/create-stub-job";

export const expireOverdueOrders = createStubJob("orders.expireOverdue", [
  "Scaffolded job only.",
  "Future implementation will mark unpaid winners or buyers overdue after the default deadline."
]);
