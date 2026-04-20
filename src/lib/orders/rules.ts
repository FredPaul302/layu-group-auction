import type {
  BidTier,
  FulfillmentMode,
  ListingStatus,
  ListingType,
  OrderStatus,
  PaymentReviewStatus
} from "@prisma/client";

import {
  hasVerifiedEmail,
  isAuthenticated,
  type PermissionSubject
} from "@/lib/permissions";
import { hasTierAccess } from "@/lib/verification";

export type FixedPriceClaimGateReason =
  | "authentication_required"
  | "email_verification_required"
  | "secondary_verification_required"
  | "bidder_blocked"
  | "tier_access_required"
  | "listing_unavailable";

export type FixedPriceClaimSnapshot = {
  listingType: ListingType;
  listingStatus: ListingStatus;
  fixedPriceCents: number | null;
  requiredBidTier: BidTier;
  fulfillmentMode: FulfillmentMode;
  shippingFeeCents: number;
};

export type FixedPriceClaimGate = {
  canClaim: boolean;
  reason: FixedPriceClaimGateReason | null;
};

export type PaymentReviewDecision = "approve" | "reject";
export type AdminOrderStatusAction =
  | "mark_paid"
  | "mark_ready_for_fulfillment"
  | "mark_fulfilled"
  | "mark_completed"
  | "mark_cancelled";

export type ShippingAddressInput = {
  recipientName: string;
  addressLine1: string;
  addressLine2?: string | null;
  city: string;
  stateOrProvince: string;
  postalCode: string;
  countryCode: string;
  phoneNumber?: string | null;
};

export type ShippingAddressRecord = {
  recipientName: string;
  addressLine1: string;
  addressLine2: string | null;
  city: string;
  stateOrProvince: string;
  postalCode: string;
  countryCode: string;
  phoneNumber: string | null;
};

export class OrderActionError extends Error {
  constructor(
    public readonly code:
      | FixedPriceClaimGateReason
      | "order_not_found"
      | "order_not_payable"
      | "payment_submission_invalid"
      | "payment_review_invalid"
      | "fulfillment_selection_required"
      | "fulfillment_selection_invalid"
      | "pickup_event_required"
      | "shipping_address_required"
      | "order_status_invalid",
    public readonly statusCode: number,
    message: string
  ) {
    super(message);
    this.name = "OrderActionError";
  }
}

export function getOrderFinancials(input: {
  subtotalCents: number;
  fulfillmentMode: FulfillmentMode;
  shippingFeeCents: number;
}) {
  const shippingFeeCents =
    input.fulfillmentMode === "shipping_only" ? input.shippingFeeCents : 0;

  return {
    subtotalCents: input.subtotalCents,
    shippingFeeCents,
    totalCents: input.subtotalCents + shippingFeeCents,
    selectedFulfillmentMode:
      input.fulfillmentMode === "pickup_or_shipping" ? null : input.fulfillmentMode
  };
}

export function getOrderNumberLabel(orderId: string) {
  return `ORD-${orderId.slice(-8).toUpperCase()}`;
}

function normalizeRequiredAddressField(value: string | null | undefined, label: string) {
  const normalizedValue = value?.trim() ?? "";

  if (!normalizedValue) {
    throw new OrderActionError(
      "shipping_address_required",
      400,
      `${label} is required for shipping orders.`
    );
  }

  return normalizedValue;
}

export function normalizeShippingAddressInput(
  input: ShippingAddressInput
): ShippingAddressRecord {
  return {
    recipientName: normalizeRequiredAddressField(input.recipientName, "Recipient name"),
    addressLine1: normalizeRequiredAddressField(input.addressLine1, "Address line 1"),
    addressLine2: input.addressLine2?.trim() || null,
    city: normalizeRequiredAddressField(input.city, "City"),
    stateOrProvince: normalizeRequiredAddressField(input.stateOrProvince, "State or province"),
    postalCode: normalizeRequiredAddressField(input.postalCode, "Postal code"),
    countryCode: normalizeRequiredAddressField(input.countryCode, "Country code").toUpperCase(),
    phoneNumber: input.phoneNumber?.trim() || null
  };
}

export function serializeShippingAddress(input: ShippingAddressInput) {
  return JSON.stringify(normalizeShippingAddressInput(input));
}

export function deserializeShippingAddress(value: string | null | undefined) {
  if (!value?.trim()) {
    return null;
  }

  try {
    const parsed = JSON.parse(value) as Partial<ShippingAddressRecord>;

    return normalizeShippingAddressInput({
      recipientName: parsed.recipientName ?? "",
      addressLine1: parsed.addressLine1 ?? "",
      addressLine2: parsed.addressLine2 ?? null,
      city: parsed.city ?? "",
      stateOrProvince: parsed.stateOrProvince ?? "",
      postalCode: parsed.postalCode ?? "",
      countryCode: parsed.countryCode ?? "",
      phoneNumber: parsed.phoneNumber ?? null
    });
  } catch {
    return null;
  }
}

export function formatShippingAddress(value: string | ShippingAddressRecord | null | undefined) {
  const address =
    typeof value === "string" || value == null ? deserializeShippingAddress(value) : value;

  if (!address) {
    return null;
  }

  return [
    address.recipientName,
    address.addressLine1,
    address.addressLine2,
    `${address.city}, ${address.stateOrProvince} ${address.postalCode}`,
    address.countryCode,
    address.phoneNumber ? `Phone: ${address.phoneNumber}` : null
  ]
    .filter(Boolean)
    .join("\n");
}

export function canEditFulfillmentSelection(status: OrderStatus) {
  return (
    status === "awaiting_payment" ||
    status === "payment_rejected" ||
    status === "payment_overdue"
  );
}

export function isFulfillmentSelectionComplete(input: {
  selectedFulfillmentMode: FulfillmentMode | null;
  pickupEventId: string | null;
  shippingAddressText: string | null;
}) {
  if (input.selectedFulfillmentMode === "pickup_only") {
    return Boolean(input.pickupEventId);
  }

  if (input.selectedFulfillmentMode === "shipping_only") {
    return Boolean(deserializeShippingAddress(input.shippingAddressText));
  }

  return false;
}

export function resolveFulfillmentSelection(input: {
  orderStatus: OrderStatus;
  listingFulfillmentMode: FulfillmentMode;
  desiredFulfillmentMode: "pickup_only" | "shipping_only";
  subtotalCents: number;
  listingShippingFeeCents: number;
  pickupEventId: string | null;
  shippingAddress?: ShippingAddressInput | null;
}) {
  if (!canEditFulfillmentSelection(input.orderStatus)) {
    throw new OrderActionError(
      "order_status_invalid",
      409,
      "Fulfillment details can no longer be changed for this order."
    );
  }

  if (
    input.listingFulfillmentMode === "pickup_only" &&
    input.desiredFulfillmentMode !== "pickup_only"
  ) {
    throw new OrderActionError(
      "fulfillment_selection_invalid",
      400,
      "This listing is pickup only."
    );
  }

  if (
    input.listingFulfillmentMode === "shipping_only" &&
    input.desiredFulfillmentMode !== "shipping_only"
  ) {
    throw new OrderActionError(
      "fulfillment_selection_invalid",
      400,
      "This listing is shipping only."
    );
  }

  if (input.desiredFulfillmentMode === "pickup_only") {
    if (!input.pickupEventId) {
      throw new OrderActionError(
        "pickup_event_required",
        409,
        "A pickup event is required before pickup can be confirmed."
      );
    }

    return {
      selectedFulfillmentMode: "pickup_only" as FulfillmentMode,
      pickupEventId: input.pickupEventId,
      shippingAddressText: null,
      shippingFeeCents: 0,
      totalCents: input.subtotalCents
    };
  }

  if (!input.shippingAddress) {
    throw new OrderActionError(
      "shipping_address_required",
      400,
      "A shipping address is required before shipping can be confirmed."
    );
  }

  const shippingAddressText = serializeShippingAddress(input.shippingAddress);

  return {
    selectedFulfillmentMode: "shipping_only" as FulfillmentMode,
    pickupEventId: null,
    shippingAddressText,
    shippingFeeCents: input.listingShippingFeeCents,
    totalCents: input.subtotalCents + input.listingShippingFeeCents
  };
}

export function getFixedPriceClaimGate(input: {
  subject: PermissionSubject;
  snapshot: FixedPriceClaimSnapshot;
}): FixedPriceClaimGate {
  if (
    input.snapshot.listingType !== "fixed_price" ||
    input.snapshot.listingStatus !== "published" ||
    input.snapshot.fixedPriceCents == null
  ) {
    return {
      canClaim: false,
      reason: "listing_unavailable"
    };
  }

  if (!isAuthenticated(input.subject)) {
    return {
      canClaim: false,
      reason: "authentication_required"
    };
  }

  if (!hasVerifiedEmail(input.subject)) {
    return {
      canClaim: false,
      reason: "email_verification_required"
    };
  }

  if (!input.subject.bidderProfile || input.subject.bidderProfile.maxBidTier === "tier_0") {
    return {
      canClaim: false,
      reason: "secondary_verification_required"
    };
  }

  if (
    input.subject.bidderProfile.isBlocked ||
    (input.subject.bidderProfile.nonPaymentStrikeCount ?? 0) > 0
  ) {
    return {
      canClaim: false,
      reason: "bidder_blocked"
    };
  }

  if (!hasTierAccess(input.subject.bidderProfile.maxBidTier, input.snapshot.requiredBidTier)) {
    return {
      canClaim: false,
      reason: "tier_access_required"
    };
  }

  return {
    canClaim: true,
    reason: null
  };
}

export function assertFixedPriceClaimGate(gate: FixedPriceClaimGate) {
  if (gate.canClaim) {
    return;
  }

  const errorMessages: Record<FixedPriceClaimGateReason, { statusCode: number; message: string }> =
    {
      authentication_required: {
        statusCode: 401,
        message: "You must sign in before claiming a fixed-price listing."
      },
      email_verification_required: {
        statusCode: 403,
        message: "Email verification is required before claiming an item."
      },
      secondary_verification_required: {
        statusCode: 403,
        message: "Secondary verification is required before claiming an item."
      },
      bidder_blocked: {
        statusCode: 403,
        message: "This bidder account is restricted from claiming items."
      },
      tier_access_required: {
        statusCode: 403,
        message: "Your current approved tier does not allow claims in this category."
      },
      listing_unavailable: {
        statusCode: 409,
        message: "This listing is no longer available to claim."
      }
    };

  if (!gate.reason) {
    return;
  }

  const errorDetails = errorMessages[gate.reason];

  throw new OrderActionError(gate.reason, errorDetails.statusCode, errorDetails.message);
}

export function canSubmitPaymentForOrderStatus(status: OrderStatus) {
  return (
    status === "awaiting_payment" ||
    status === "payment_submitted" ||
    status === "payment_rejected"
  );
}

export function resolvePaymentSubmissionStatus(input: {
  orderStatus: OrderStatus;
  paymentDeadlineAtUtc: Date;
  now: Date;
  fulfillmentSelectionComplete?: boolean;
}) {
  if (!canSubmitPaymentForOrderStatus(input.orderStatus)) {
    throw new OrderActionError(
      "order_not_payable",
      409,
      "This order is not currently accepting payment submissions."
    );
  }

  if (input.fulfillmentSelectionComplete === false) {
    throw new OrderActionError(
      "fulfillment_selection_required",
      409,
      "Complete pickup or shipping details before submitting payment."
    );
  }

  if (input.paymentDeadlineAtUtc.getTime() < input.now.getTime()) {
    throw new OrderActionError(
      "order_not_payable",
      409,
      "This order is past its payment deadline."
    );
  }

  return {
    orderStatus: "payment_submitted" as OrderStatus
  };
}

export function resolvePaymentReviewTransition(input: {
  orderStatus: OrderStatus;
  paymentStatus: PaymentReviewStatus;
  decision: PaymentReviewDecision;
  now: Date;
}) {
  if (input.paymentStatus !== "pending_review") {
    throw new OrderActionError(
      "payment_review_invalid",
      409,
      "Only pending payment submissions can be reviewed."
    );
  }

  if (input.decision === "approve") {
    return {
      paymentStatus: "approved" as PaymentReviewStatus,
      orderStatus: "paid" as OrderStatus,
      listingStatus: "paid" as const,
      paidAtUtc: input.now,
      reviewedAtUtc: input.now
    };
  }

  if (
    input.orderStatus !== "awaiting_payment" &&
    input.orderStatus !== "payment_submitted" &&
    input.orderStatus !== "payment_rejected"
  ) {
    throw new OrderActionError(
      "payment_review_invalid",
      409,
      "Rejected payment submissions can only be applied to unpaid orders."
    );
  }

  return {
    paymentStatus: "rejected" as PaymentReviewStatus,
    orderStatus: "payment_rejected" as OrderStatus,
    listingStatus: null,
    paidAtUtc: null,
    reviewedAtUtc: input.now
  };
}

export function resolveAdminOrderStatusAction(input: {
  action: AdminOrderStatusAction;
  orderStatus: OrderStatus;
  now: Date;
  fulfillmentSelectionComplete?: boolean;
}) {
  switch (input.action) {
    case "mark_paid":
      if (
        input.orderStatus === "awaiting_payment" ||
        input.orderStatus === "payment_submitted" ||
        input.orderStatus === "payment_rejected" ||
        input.orderStatus === "payment_overdue"
      ) {
        return {
          orderStatus: "paid" as OrderStatus,
          listingStatus: "paid" as const,
          paidAtUtc: input.now,
          fulfilledAtUtc: null,
          cancelledAtUtc: null
        };
      }
      break;
    case "mark_ready_for_fulfillment":
      if (input.orderStatus === "paid") {
        if (!input.fulfillmentSelectionComplete) {
          throw new OrderActionError(
            "fulfillment_selection_required",
            409,
            "Pickup or shipping details must be complete before an order is ready for fulfillment."
          );
        }

        return {
          orderStatus: "ready_for_fulfillment" as OrderStatus,
          listingStatus: "ready_for_fulfillment" as const,
          paidAtUtc: null,
          fulfilledAtUtc: null,
          cancelledAtUtc: null
        };
      }
      break;
    case "mark_fulfilled":
      if (input.orderStatus === "ready_for_fulfillment") {
        return {
          orderStatus: "fulfilled" as OrderStatus,
          listingStatus: "fulfilled" as const,
          paidAtUtc: null,
          fulfilledAtUtc: input.now,
          cancelledAtUtc: null
        };
      }
      break;
    case "mark_completed":
      if (input.orderStatus === "fulfilled") {
        return {
          orderStatus: "completed" as OrderStatus,
          listingStatus: null,
          paidAtUtc: null,
          fulfilledAtUtc: null,
          cancelledAtUtc: null
        };
      }
      break;
    case "mark_cancelled":
      if (
        input.orderStatus === "awaiting_payment" ||
        input.orderStatus === "payment_submitted" ||
        input.orderStatus === "payment_rejected" ||
        input.orderStatus === "payment_overdue" ||
        input.orderStatus === "paid" ||
        input.orderStatus === "ready_for_fulfillment"
      ) {
        return {
          orderStatus: "cancelled" as OrderStatus,
          listingStatus: null,
          paidAtUtc: null,
          fulfilledAtUtc: null,
          cancelledAtUtc: input.now
        };
      }
      break;
  }

  throw new OrderActionError(
    "order_status_invalid",
    409,
    "That admin order action is not valid for the current order status."
  );
}

export function resolveOverdueOrder(input: {
  orderStatus: OrderStatus;
  paymentDeadlineAtUtc: Date;
  now: Date;
}) {
  if (
    input.orderStatus !== "awaiting_payment" &&
    input.orderStatus !== "payment_submitted" &&
    input.orderStatus !== "payment_rejected"
  ) {
    return {
      shouldExpire: false,
      reason: "status_not_expirable" as const
    };
  }

  if (input.paymentDeadlineAtUtc.getTime() > input.now.getTime()) {
    return {
      shouldExpire: false,
      reason: "deadline_not_reached" as const
    };
  }

  return {
    shouldExpire: true,
    nextStatus: "payment_overdue" as OrderStatus
  };
}
