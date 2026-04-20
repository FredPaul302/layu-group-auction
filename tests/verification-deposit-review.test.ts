import { describe, expect, it } from "vitest";

import {
  canApplyDepositReviewDecision,
  mapDepositReviewDecisionToStatus
} from "../src/lib/verification/index.js";

describe("deposit review decisions", () => {
  it("maps admin approval and rejection decisions to deposit statuses", () => {
    expect(mapDepositReviewDecisionToStatus("approve")).toBe("approved");
    expect(mapDepositReviewDecisionToStatus("reject")).toBe("rejected");
    expect(mapDepositReviewDecisionToStatus("refund")).toBe("refunded");
    expect(mapDepositReviewDecisionToStatus("forfeit")).toBe("forfeited");
  });

  it("allows only the intended manual review transitions", () => {
    expect(canApplyDepositReviewDecision("pending_review", "approve")).toBe(true);
    expect(canApplyDepositReviewDecision("pending_review", "reject")).toBe(true);
    expect(canApplyDepositReviewDecision("pending_review", "refund")).toBe(false);
    expect(canApplyDepositReviewDecision("approved", "refund")).toBe(true);
    expect(canApplyDepositReviewDecision("approved", "forfeit")).toBe(true);
    expect(canApplyDepositReviewDecision("approved", "reject")).toBe(false);
  });
});
