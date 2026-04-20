import type { AuctionStatus } from "@prisma/client";
import { Prisma } from "@prisma/client";

import { prisma } from "@/lib/prisma";
import { getStorageAdapter } from "@/lib/storage";

import {
  type EditableListingState,
  parseEditableListingState,
  parseIntegerInput,
  parseOptionalDateTime,
  parseOptionalText,
  parseRequiredText,
  validateCategoryInput,
  validateListingInput,
  validatePickupEventInput
} from "./index";

const publicListingInclude = {
  category: true,
  pickupEvent: true,
  auction: true,
  images: {
    orderBy: {
      sortOrder: "asc"
    }
  }
} satisfies Prisma.ListingInclude;

const adminListingInclude = {
  ...publicListingInclude
} satisfies Prisma.ListingInclude;

export type PublicListingRecord = Prisma.ListingGetPayload<{
  include: typeof publicListingInclude;
}>;

export type AdminListingRecord = Prisma.ListingGetPayload<{
  include: typeof adminListingInclude;
}>;

async function buildUniqueListingSlug(baseSlug: string, listingId?: string) {
  const normalizedBaseSlug = baseSlug || "listing";

  for (let suffix = 0; suffix < 1000; suffix += 1) {
    const candidate = suffix === 0 ? normalizedBaseSlug : `${normalizedBaseSlug}-${suffix + 1}`;
    const existingListing = await prisma.listing.findFirst({
      where: {
        slug: candidate,
        ...(listingId
          ? {
              NOT: {
                id: listingId
              }
            }
          : {})
      },
      select: {
        id: true
      }
    });

    if (!existingListing) {
      return candidate;
    }
  }

  throw new Error("Unable to generate a unique listing slug.");
}

async function assertPickupEventCompatibility(
  pickupEventId: string | null,
  fulfillmentMode: "pickup_only" | "shipping_only" | "pickup_or_shipping"
) {
  if (!pickupEventId) {
    return null;
  }

  if (fulfillmentMode === "shipping_only") {
    return null;
  }

  return prisma.pickupEvent.findUniqueOrThrow({
    where: {
      id: pickupEventId
    },
    select: {
      id: true
    }
  });
}

async function saveListingImages(input: {
  listingId: string;
  title: string;
  files: File[];
}) {
  const uploadedFiles = input.files.filter((file) => file.size > 0);

  if (uploadedFiles.length === 0) {
    return;
  }

  const storageAdapter = getStorageAdapter();
  const currentImageCount = await prisma.listingImage.count({
    where: {
      listingId: input.listingId
    }
  });

  const imageData = await Promise.all(
    uploadedFiles.map(async (file, index) => {
      const storedAsset = await storageAdapter.save({
        fileName: file.name,
        contentType: file.type || "application/octet-stream",
        body: Buffer.from(await file.arrayBuffer())
      });

      return {
        listingId: input.listingId,
        storageKey: storedAsset.key,
        publicUrl: storedAsset.publicUrl,
        altText: input.title,
        sortOrder: currentImageCount + index,
        isPrimary: currentImageCount === 0 && index === 0
      };
    })
  );

  await prisma.listingImage.createMany({
    data: imageData
  });
}

function parseListingFormData(formData: FormData): {
  title: string;
  description: string | null;
  categoryId: string;
  listingType: "auction" | "fixed_price";
  conditionNote: string | null;
  fulfillmentMode: "pickup_only" | "shipping_only" | "pickup_or_shipping";
  shippingFeeCents: number;
  shippingNotes: string | null;
  pickupEventId: string | null;
  fixedPriceCents: number | null;
  startingBidCents: number | null;
  endAtUtc: Date | null;
  saveAs: EditableListingState;
  imageFiles: File[];
} {
  return {
    title: parseRequiredText(String(formData.get("title") ?? ""), "title"),
    description: parseOptionalText(String(formData.get("description") ?? "")),
    categoryId: parseRequiredText(String(formData.get("categoryId") ?? ""), "category_id"),
    listingType:
      String(formData.get("listingType") ?? "") === "fixed_price" ? "fixed_price" : "auction",
    conditionNote: parseOptionalText(String(formData.get("conditionNote") ?? "")),
    fulfillmentMode:
      String(formData.get("fulfillmentMode") ?? "") === "shipping_only"
        ? "shipping_only"
        : String(formData.get("fulfillmentMode") ?? "") === "pickup_or_shipping"
          ? "pickup_or_shipping"
          : "pickup_only",
    shippingFeeCents: parseIntegerInput(
      String(formData.get("shippingFeeCents") ?? ""),
      "shipping_fee_cents",
      {
        minimum: 0
      }
    ) ?? 0,
    shippingNotes: parseOptionalText(String(formData.get("shippingNotes") ?? "")),
    pickupEventId: parseOptionalText(String(formData.get("pickupEventId") ?? "")),
    fixedPriceCents: parseIntegerInput(
      String(formData.get("fixedPriceCents") ?? ""),
      "fixed_price_cents",
      {
        minimum: 1,
        required: false
      }
    ),
    startingBidCents: parseIntegerInput(
      String(formData.get("startingBidCents") ?? ""),
      "starting_bid_cents",
      {
        minimum: 0,
        required: false
      }
    ),
    endAtUtc: parseOptionalDateTime(String(formData.get("endAtUtc") ?? ""), "end_at_utc"),
    saveAs: parseEditableListingState(String(formData.get("saveAs") ?? "draft")),
    imageFiles: formData
      .getAll("images")
      .filter((value): value is File => value instanceof File)
      .filter((file) => file.size > 0)
  };
}

export async function listAdminCategories() {
  return prisma.category.findMany({
    orderBy: {
      name: "asc"
    }
  });
}

export async function createCategoryFromFormData(formData: FormData) {
  const category = validateCategoryInput({
    name: String(formData.get("name") ?? ""),
    slug: String(formData.get("slug") ?? ""),
    description: String(formData.get("description") ?? ""),
    minimumStartBidCents:
      parseIntegerInput(String(formData.get("minimumStartBidCents") ?? ""), "minimum_start_bid_cents", {
        minimum: 0
      }) ?? 0,
    minimumBidIncrementCents:
      parseIntegerInput(
        String(formData.get("minimumBidIncrementCents") ?? ""),
        "minimum_bid_increment_cents",
        {
          minimum: 1
        }
      ) ?? 1,
    requiredBidTier: String(formData.get("requiredBidTier") ?? "")
  });

  return prisma.category.create({
    data: category
  });
}

export async function updateCategoryFromFormData(categoryId: string, formData: FormData) {
  const category = validateCategoryInput({
    name: String(formData.get("name") ?? ""),
    slug: String(formData.get("slug") ?? ""),
    description: String(formData.get("description") ?? ""),
    minimumStartBidCents:
      parseIntegerInput(String(formData.get("minimumStartBidCents") ?? ""), "minimum_start_bid_cents", {
        minimum: 0
      }) ?? 0,
    minimumBidIncrementCents:
      parseIntegerInput(
        String(formData.get("minimumBidIncrementCents") ?? ""),
        "minimum_bid_increment_cents",
        {
          minimum: 1
        }
      ) ?? 1,
    requiredBidTier: String(formData.get("requiredBidTier") ?? "")
  });

  return prisma.category.update({
    where: {
      id: categoryId
    },
    data: category
  });
}

export async function listPickupEventsForAdmin() {
  return prisma.pickupEvent.findMany({
    orderBy: {
      startAtUtc: "asc"
    }
  });
}

export async function listPickupEventOptions() {
  return prisma.pickupEvent.findMany({
    where: {
      isActive: true
    },
    orderBy: {
      startAtUtc: "asc"
    },
    select: {
      id: true,
      name: true,
      startAtUtc: true,
      endAtUtc: true
    }
  });
}

export async function createPickupEventFromFormData(formData: FormData) {
  const startAtUtc = parseOptionalDateTime(String(formData.get("startAtUtc") ?? ""), "start_at_utc");
  const endAtUtc = parseOptionalDateTime(String(formData.get("endAtUtc") ?? ""), "end_at_utc");

  if (!startAtUtc || !endAtUtc) {
    throw new Error("Pickup events require both start and end times.");
  }

  const pickupEvent = validatePickupEventInput({
    name: String(formData.get("name") ?? ""),
    slug: String(formData.get("slug") ?? ""),
    locationName: String(formData.get("locationName") ?? ""),
    address: String(formData.get("address") ?? ""),
    instructions: String(formData.get("instructions") ?? ""),
    startAtUtc,
    endAtUtc
  });

  return prisma.pickupEvent.create({
    data: pickupEvent
  });
}

export async function updatePickupEventFromFormData(pickupEventId: string, formData: FormData) {
  const startAtUtc = parseOptionalDateTime(String(formData.get("startAtUtc") ?? ""), "start_at_utc");
  const endAtUtc = parseOptionalDateTime(String(formData.get("endAtUtc") ?? ""), "end_at_utc");

  if (!startAtUtc || !endAtUtc) {
    throw new Error("Pickup events require both start and end times.");
  }

  const pickupEvent = validatePickupEventInput({
    name: String(formData.get("name") ?? ""),
    slug: String(formData.get("slug") ?? ""),
    locationName: String(formData.get("locationName") ?? ""),
    address: String(formData.get("address") ?? ""),
    instructions: String(formData.get("instructions") ?? ""),
    startAtUtc,
    endAtUtc
  });

  return prisma.pickupEvent.update({
    where: {
      id: pickupEventId
    },
    data: pickupEvent
  });
}

export async function listAdminListings() {
  return prisma.listing.findMany({
    include: adminListingInclude,
    orderBy: [
      {
        status: "asc"
      },
      {
        updatedAtUtc: "desc"
      }
    ]
  });
}

export async function getListingEditorData(listingId: string) {
  return prisma.listing.findUniqueOrThrow({
    where: {
      id: listingId
    },
    include: adminListingInclude
  });
}

export async function getListingEditorOptions() {
  const [categories, pickupEvents] = await Promise.all([
    prisma.category.findMany({
      where: {
        isEnabled: true
      },
      orderBy: {
        name: "asc"
      }
    }),
    listPickupEventOptions()
  ]);

  return {
    categories,
    pickupEvents
  };
}

async function createOrUpdateAuctionRow(input: {
  listingId: string;
  existingAuctionId?: string;
  existingAuctionStatus?: AuctionStatus;
  startAtUtc: Date;
  endAtUtc: Date;
  startingBidCents: number;
  minimumIncrementCents: number;
}) {
  if (input.existingAuctionId) {
    return prisma.auction.update({
      where: {
        id: input.existingAuctionId
      },
      data: {
        status: input.existingAuctionStatus ?? "live",
        startAtUtc: input.startAtUtc,
        endAtUtc: input.endAtUtc,
        startingBidCents: input.startingBidCents,
        minimumIncrementCents: input.minimumIncrementCents
      }
    });
  }

  return prisma.auction.create({
    data: {
      listingId: input.listingId,
      status: "live",
      startAtUtc: input.startAtUtc,
      endAtUtc: input.endAtUtc,
      startingBidCents: input.startingBidCents,
      minimumIncrementCents: input.minimumIncrementCents
    }
  });
}

export async function createListingFromFormData(input: {
  formData: FormData;
  sellerUserId: string;
}) {
  const parsedForm = parseListingFormData(input.formData);
  const category = await prisma.category.findUniqueOrThrow({
    where: {
      id: parsedForm.categoryId
    },
    select: {
      id: true,
      minimumStartBidCents: true,
      minimumBidIncrementCents: true
    }
  });

  await assertPickupEventCompatibility(parsedForm.pickupEventId, parsedForm.fulfillmentMode);

  const validatedListing = validateListingInput({
    ...parsedForm,
    categoryMinimumStartBidCents: category.minimumStartBidCents,
    categoryMinimumBidIncrementCents: category.minimumBidIncrementCents
  });

  const now = new Date();
  const listingSlug = await buildUniqueListingSlug(validatedListing.slug);

  const listing = await prisma.listing.create({
    data: {
      sellerUserId: input.sellerUserId,
      categoryId: validatedListing.categoryId,
      pickupEventId: validatedListing.pickupEventId,
      listingType: validatedListing.listingType,
      status: validatedListing.saveAs === "published" ? "published" : "draft",
      slug: listingSlug,
      title: validatedListing.title,
      description: validatedListing.description,
      conditionNote: validatedListing.conditionNote,
      fixedPriceCents: validatedListing.fixedPriceCents,
      fulfillmentMode: validatedListing.fulfillmentMode,
      shippingFeeCents: validatedListing.shippingFeeCents,
      shippingNotes: validatedListing.shippingNotes,
      publishedAtUtc: validatedListing.saveAs === "published" ? now : null
    }
  });

  if (
    validatedListing.listingType === "auction" &&
    validatedListing.startingBidCents != null &&
    validatedListing.endAtUtc
  ) {
    await createOrUpdateAuctionRow({
      listingId: listing.id,
      startAtUtc: validatedListing.saveAs === "published" ? now : now,
      endAtUtc: validatedListing.endAtUtc,
      startingBidCents: validatedListing.startingBidCents,
      minimumIncrementCents: validatedListing.categoryMinimumBidIncrementCents
    });
  }

  await saveListingImages({
    listingId: listing.id,
    title: listing.title,
    files: parsedForm.imageFiles
  });

  return listing;
}

export async function updateListingFromFormData(input: {
  listingId: string;
  formData: FormData;
}) {
  const existingListing = await prisma.listing.findUniqueOrThrow({
    where: {
      id: input.listingId
    },
    include: {
      auction: true
    }
  });

  const parsedForm = parseListingFormData(input.formData);
  const category = await prisma.category.findUniqueOrThrow({
    where: {
      id: parsedForm.categoryId
    },
    select: {
      id: true,
      minimumStartBidCents: true,
      minimumBidIncrementCents: true
    }
  });

  await assertPickupEventCompatibility(parsedForm.pickupEventId, parsedForm.fulfillmentMode);

  const validatedListing = validateListingInput({
    ...parsedForm,
    categoryMinimumStartBidCents: category.minimumStartBidCents,
    categoryMinimumBidIncrementCents: category.minimumBidIncrementCents
  });

  const listingSlug = await buildUniqueListingSlug(validatedListing.slug, input.listingId);
  const now = new Date();
  const isPublishingNow =
    validatedListing.saveAs === "published" && existingListing.status !== "published";

  const updatedListing = await prisma.listing.update({
    where: {
      id: input.listingId
    },
    data: {
      categoryId: validatedListing.categoryId,
      pickupEventId: validatedListing.pickupEventId,
      listingType: validatedListing.listingType,
      status: validatedListing.saveAs === "published" ? "published" : "draft",
      slug: listingSlug,
      title: validatedListing.title,
      description: validatedListing.description,
      conditionNote: validatedListing.conditionNote,
      fixedPriceCents: validatedListing.fixedPriceCents,
      fulfillmentMode: validatedListing.fulfillmentMode,
      shippingFeeCents: validatedListing.shippingFeeCents,
      shippingNotes: validatedListing.shippingNotes,
      publishedAtUtc:
        validatedListing.saveAs === "published"
          ? existingListing.publishedAtUtc ?? now
          : null,
      archivedAtUtc: null
    }
  });

  if (validatedListing.listingType === "auction") {
    if (validatedListing.startingBidCents == null || !validatedListing.endAtUtc) {
      throw new Error("Auction listings require auction data.");
    }

    await createOrUpdateAuctionRow({
      listingId: updatedListing.id,
      existingAuctionId: existingListing.auction?.id,
      existingAuctionStatus: existingListing.auction?.status,
      startAtUtc:
        validatedListing.saveAs === "published"
          ? isPublishingNow
            ? now
            : existingListing.auction?.startAtUtc ?? now
          : existingListing.auction?.startAtUtc ?? now,
      endAtUtc: validatedListing.endAtUtc,
      startingBidCents: validatedListing.startingBidCents,
      minimumIncrementCents: validatedListing.categoryMinimumBidIncrementCents
    });
  } else if (existingListing.auction) {
    await prisma.auction.delete({
      where: {
        id: existingListing.auction.id
      }
    });
  }

  await saveListingImages({
    listingId: updatedListing.id,
    title: updatedListing.title,
    files: parsedForm.imageFiles
  });

  return updatedListing;
}

export async function archiveListing(listingId: string) {
  const archivedAtUtc = new Date();

  return prisma.$transaction(async (transaction) => {
    const listing = await transaction.listing.update({
      where: {
        id: listingId
      },
      data: {
        status: "archived",
        archivedAtUtc
      },
      include: {
        auction: true
      }
    });

    if (listing.auction) {
      await transaction.auction.update({
        where: {
          id: listing.auction.id
        },
        data: {
          status: "archived",
          closedAtUtc: archivedAtUtc
        }
      });
    }

    return listing;
  });
}

export async function getPublicHomeData() {
  const [categories, latestListings] = await Promise.all([
    prisma.category.findMany({
      where: {
        isEnabled: true
      },
      orderBy: {
        name: "asc"
      }
    }),
    prisma.listing.findMany({
      where: {
        status: "published"
      },
      include: publicListingInclude,
      orderBy: {
        publishedAtUtc: "desc"
      },
      take: 6
    })
  ]);

  return {
    categories,
    latestListings
  };
}

export async function listPublicListings(filters?: {
  listingType?: "auction" | "fixed_price";
  categorySlug?: string;
}) {
  return prisma.listing.findMany({
    where: {
      status: "published",
      category: {
        isEnabled: true,
        ...(filters?.categorySlug
          ? {
              slug: filters.categorySlug
            }
          : {})
      },
      ...(filters?.listingType
        ? {
            listingType: filters.listingType
          }
        : {}),
    },
    include: publicListingInclude,
    orderBy: [
      {
        publishedAtUtc: "desc"
      },
      {
        title: "asc"
      }
    ]
  });
}

export async function getPublicCategoryBySlug(slug: string) {
  return prisma.category.findFirstOrThrow({
    where: {
      slug,
      isEnabled: true
    }
  });
}

export async function getPublicListingById(listingId: string) {
  return prisma.listing.findFirstOrThrow({
    where: {
      id: listingId,
      status: {
        notIn: ["draft", "archived"]
      },
      category: {
        isEnabled: true
      }
    },
    include: publicListingInclude
  });
}

export function readStatusQueryParam(
  value: string | string[] | undefined,
  fallback?: string
) {
  if (Array.isArray(value)) {
    return value[0] ?? fallback ?? null;
  }

  return value ?? fallback ?? null;
}

export function listingSaveStateLabel(saveAs: EditableListingState) {
  return saveAs === "published" ? "Published" : "Draft";
}
