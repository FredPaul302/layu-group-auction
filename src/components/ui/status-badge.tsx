type StatusTone = "accent" | "success" | "warning" | "danger" | "info" | "muted";

type StatusBadgeProps = {
  status: string;
  label?: string;
  tone?: StatusTone;
  className?: string;
};

const STATUS_LABELS: Record<string, string> = {
  live: "Live",
  ended: "Ended",
  sold: "Sold",
  awaiting_payment: "Awaiting payment",
  payment_submitted: "Payment submitted",
  payment_rejected: "Payment rejected",
  paid: "Paid",
  payment_overdue: "Payment overdue",
  ready_for_fulfillment: "Ready for fulfillment",
  fulfilled: "Fulfilled",
  completed: "Completed",
  cancelled: "Cancelled",
  blocked: "Blocked",
  published: "Published",
  draft: "Draft",
  archived: "Archived",
  unsold: "Unsold",
  sold_pending_payment: "Sold pending payment",
  ended_no_bids: "Ended no bids",
  approved: "Approved",
  rejected: "Rejected",
  pending_review: "Pending review",
  pending: "Pending",
  refunded: "Refunded",
  released: "Released",
  forfeited: "Forfeited",
  expired: "Expired",
  declined: "Declined",
  accepted: "Accepted",
  persona_verified: "Identity verified",
  deposit_verified: "Deposit verified",
  tier_0: "Tier 0",
  tier_1: "First deposit tier",
  tier_10: "First deposit tier",
  tier_20: "Second deposit tier",
  full: "Full tier",
  auction: "Auction",
  fixed_price: "Fixed price",
  auction_win: "Auction win",
  fixed_price_claim: "Buy it now",
  fixed_price_pay_first: "Pay-first checkout",
  runner_up_offer: "Runner-up offer"
};

const STATUS_TONES: Record<string, StatusTone> = {
  live: "accent",
  published: "accent",
  auction: "accent",
  fixed_price: "info",
  auction_win: "accent",
  fixed_price_claim: "accent",
  fixed_price_pay_first: "info",
  runner_up_offer: "warning",
  sold: "success",
  approved: "success",
  accepted: "success",
  paid: "success",
  fulfilled: "success",
  completed: "success",
  persona_verified: "success",
  deposit_verified: "info",
  pending_review: "warning",
  pending: "warning",
  awaiting_payment: "warning",
  payment_submitted: "info",
  payment_rejected: "danger",
  payment_overdue: "danger",
  rejected: "danger",
  blocked: "danger",
  forfeited: "danger",
  expired: "danger",
  cancelled: "muted",
  archived: "muted",
  draft: "muted",
  ended: "muted",
  ended_no_bids: "muted",
  unsold: "muted",
  sold_pending_payment: "warning",
  released: "info",
  refunded: "info",
  declined: "muted",
  ready_for_fulfillment: "info",
  tier_0: "muted",
  tier_1: "info",
  tier_10: "accent",
  tier_20: "success",
  full: "success"
};

function normalizeStatus(value: string) {
  return value.trim().toLowerCase().replaceAll(" ", "_");
}

function humanizeStatus(value: string) {
  return value
    .split("_")
    .filter(Boolean)
    .map((segment) => segment.charAt(0).toUpperCase() + segment.slice(1))
    .join(" ");
}

export function StatusBadge({
  status,
  label,
  tone,
  className
}: StatusBadgeProps) {
  const normalizedStatus = normalizeStatus(status);
  const resolvedTone = tone ?? STATUS_TONES[normalizedStatus] ?? "muted";
  const resolvedLabel =
    label ?? STATUS_LABELS[normalizedStatus] ?? humanizeStatus(normalizedStatus);

  return (
    <span
      data-status={normalizedStatus}
      data-tone={resolvedTone}
      className={["status-badge", `status-${resolvedTone}`, className]
        .filter(Boolean)
        .join(" ")}
    >
      {resolvedLabel}
    </span>
  );
}
