import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

import { getCurrentUserFromCookieSource } from "@/lib/auth";
import { AuctionActionError, placeBidOnListing } from "@/lib/auctions";

import { requireSameOriginRequest } from "@/app/api/_utils/origin";

type BidsRouteContext = {
  params: Promise<{
    listingId: string;
  }>;
};

function redirectToListing(
  request: NextRequest,
  listingId: string,
  params?: Record<string, string>
) {
  const url = new URL(`/listings/${listingId}`, request.url);

  for (const [key, value] of Object.entries(params ?? {})) {
    url.searchParams.set(key, value);
  }

  return NextResponse.redirect(url, {
    status: 303
  });
}

function requestExpectsJson(request: NextRequest) {
  const acceptHeader = request.headers.get("accept") ?? "";
  const contentType = request.headers.get("content-type") ?? "";

  return acceptHeader.includes("application/json") || contentType.includes("application/json");
}

async function readAmountCents(request: NextRequest) {
  const contentType = request.headers.get("content-type") ?? "";

  if (contentType.includes("application/json")) {
    try {
      const body = (await request.json()) as {
        amountCents?: unknown;
      };

      return Number(body.amountCents);
    } catch {
      return Number.NaN;
    }
  }

  const formData = await request.formData();

  return Number(formData.get("amountCents") ?? Number.NaN);
}

export async function POST(request: NextRequest, context: BidsRouteContext) {
  const originResponse = requireSameOriginRequest(request);

  if (originResponse) {
    return originResponse;
  }

  const { listingId } = await context.params;
  const user = await getCurrentUserFromCookieSource(request.cookies);
  const expectsJson = requestExpectsJson(request);

  if (!user) {
    if (expectsJson) {
      return NextResponse.json(
        {
          status: "authentication_required"
        },
        {
          status: 401
        }
      );
    }

    return NextResponse.redirect(new URL("/auth/login", request.url), {
      status: 303
    });
  }

  try {
    const amountCents = await readAmountCents(request);
    const bidResult = await placeBidOnListing({
      listingId,
      bidderUserId: user.id,
      amountCents
    });

    if (expectsJson) {
      return NextResponse.json({
        status: "bid_placed",
        bidId: bidResult.bid.id,
        currentPriceCents: bidResult.currentPriceCents,
        nextMinimumBidCents: bidResult.nextMinimumBidCents
      });
    }

    return redirectToListing(request, listingId, {
      bidStatus: "placed"
    });
  } catch (error) {
    if (error instanceof AuctionActionError) {
      if (expectsJson) {
        return NextResponse.json(
          {
            status: error.code
          },
          {
            status: error.statusCode
          }
        );
      }

      return redirectToListing(request, listingId, {
        bidError: error.code
      });
    }

    throw error;
  }
}
