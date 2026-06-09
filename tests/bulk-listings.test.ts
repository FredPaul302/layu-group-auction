import { describe, expect, it } from "vitest";

import {
  matchBulkListingMedia,
  parseBulkListingCsv,
  validateBulkListingWorkspace,
  type BulkListingItemInput,
  type BulkListingMediaInput
} from "../src/lib/catalog/bulk-listings.js";

function createItem(overrides: Partial<BulkListingItemInput> = {}): BulkListingItemInput {
  return {
    bidIncrementCents: "",
    categorySlug: "arcade",
    clientId: "item_1",
    condition: "",
    description: "A cabinet-ready accessory.",
    endAtUtc: "",
    imageFileIds: ["file_image"],
    imageOrder: ["file_image"],
    listingType: "fixed_price",
    mediaPrefix: "",
    priceCents: "4500",
    primaryImageFileId: "file_image",
    quantity: "",
    sku: "GARAGE-001",
    startingBidCents: "",
    status: "draft",
    title: "Garage lot",
    videoFileIds: [],
    ...overrides
  };
}

function createMedia(overrides: Partial<BulkListingMediaInput> = {}): BulkListingMediaInput {
  return {
    id: "file_image",
    name: "GARAGE-001-1.jpg",
    size: 1024,
    type: "image/jpeg",
    ...overrides
  };
}

describe("bulk listing CSV parsing", () => {
  it("parses quoted CSV rows into workspace items", () => {
    const parsed = parseBulkListingCsv(
      [
        "sku,title,description,listingType,categorySlug,priceCents,mediaPrefix,status",
        "GARAGE-001,\"Arcade, lot\",Ready to sell,fixed_price,arcade,4500,GARAGE-001,published"
      ].join("\n")
    );

    expect(parsed.issues).toHaveLength(0);
    expect(parsed.items).toEqual([
      expect.objectContaining({
        categorySlug: "arcade",
        description: "Ready to sell",
        listingType: "fixed_price",
        mediaPrefix: "GARAGE-001",
        priceCents: "4500",
        sku: "GARAGE-001",
        status: "published",
        title: "Arcade, lot"
      })
    ]);
  });

  it("reports missing required CSV columns", () => {
    const parsed = parseBulkListingCsv("sku,title\nABC,Missing fields");

    expect(parsed.items).toHaveLength(0);
    expect(parsed.issues).toContainEqual(
      expect.objectContaining({
        code: "csv_column_missing",
        severity: "error"
      })
    );
  });
});

describe("bulk listing media matching", () => {
  it("matches photos and videos by SKU prefix", () => {
    const item = createItem({
      imageFileIds: [],
      primaryImageFileId: null
    });
    const media = [
      createMedia({
        id: "image_1",
        name: "GARAGE-001-1.jpg"
      }),
      createMedia({
        id: "video_1",
        name: "GARAGE-001-demo.mp4",
        type: "video/mp4"
      })
    ];

    const matched = matchBulkListingMedia([item], media);
    const assignment = matched.assignments.get(item.clientId);

    expect(assignment?.imageFileIds).toEqual(["image_1"]);
    expect(assignment?.primaryImageFileId).toBe("image_1");
    expect(assignment?.videoFileIds).toEqual(["video_1"]);
    expect(matched.unassignedFileIds).toEqual([]);
  });

  it("uses mediaPrefix ahead of SKU when provided", () => {
    const item = createItem({
      imageFileIds: [],
      mediaPrefix: "ALT-777",
      primaryImageFileId: null,
      sku: "GARAGE-001"
    });
    const matched = matchBulkListingMedia(
      [item],
      [
        createMedia({
          id: "image_1",
          name: "ALT-777-front.webp",
          type: "image/webp"
        })
      ]
    );

    expect(matched.assignments.get(item.clientId)?.imageFileIds).toEqual(["image_1"]);
  });
});

describe("bulk listing validation", () => {
  it("treats missing photos as hard errors by default", () => {
    const result = validateBulkListingWorkspace({
      items: [
        createItem({
          imageFileIds: [],
          imageOrder: [],
          primaryImageFileId: null
        })
      ],
      media: []
    });

    expect(result.hasErrors).toBe(true);
    expect(result.issues).toContainEqual(
      expect.objectContaining({
        code: "bulk_images_required",
        severity: "error"
      })
    );
  });

  it("rejects too many videos on one listing", () => {
    const result = validateBulkListingWorkspace({
      items: [
        createItem({
          videoFileIds: ["video_1", "video_2"]
        })
      ],
      media: [
        createMedia(),
        createMedia({
          id: "video_1",
          name: "GARAGE-001-demo.mp4",
          type: "video/mp4"
        }),
        createMedia({
          id: "video_2",
          name: "GARAGE-001-spin.webm",
          type: "video/webm"
        })
      ]
    });

    expect(result.hasErrors).toBe(true);
    expect(result.issues).toContainEqual(
      expect.objectContaining({
        code: "bulk_videos_too_many",
        severity: "error"
      })
    );
  });
});

