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
  it("allows an omitted SKU column for automatic numbering", () => {
    const parsed = parseBulkListingCsv("title,description,listingType,categorySlug,priceCents\nLamp,Blue lamp,fixed_price,arcade,1000");
    expect(parsed.issues).toHaveLength(0);
    expect(parsed.items[0].sku).toBe("");
  });
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
  it("accepts automatic SKUs and rejects duplicate normalized manual SKUs", () => {
    const automatic = createItem({ sku: "", imageFileIds: [], primaryImageFileId: null });
    expect(validateBulkListingWorkspace({ items: [automatic], media: [], allowIncompleteDraftRows: true }).hasErrors).toBe(false);
    const duplicate = validateBulkListingWorkspace({ items: [{ ...automatic, sku: "1" }, { ...automatic, clientId: "item_2", sku: "000001" }], media: [], allowIncompleteDraftRows: true });
    expect(duplicate.issues).toContainEqual(expect.objectContaining({ code: "sku_duplicate" }));
  });
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
  function savedWorkspace(count: number, size: number) {
    const media = Array.from({ length: count }, (_, index) => createMedia({ id: `photo-${index}`, savedPhotoId: `saved-${index}`, size }));
    const items = media.map((photo, index) => createItem({ clientId: `item-${index}`, sku: "", imageFileIds: [photo.id], imageOrder: [photo.id], primaryImageFileId: photo.id }));
    return { items, media };
  }

  it("accepts a 580 MB saved-photo batch without counting it as a new upload", () => {
    expect(validateBulkListingWorkspace(savedWorkspace(58, 10 * 1024 * 1024)).hasErrors).toBe(false);
  });

  it("enforces the 1 GB workspace cap independently of the 256 MB transfer cap", () => {
    expect(validateBulkListingWorkspace(savedWorkspace(64, 16 * 1024 * 1024)).hasErrors).toBe(false);
    expect(validateBulkListingWorkspace(savedWorkspace(65, 16 * 1024 * 1024)).issues).toContainEqual(expect.objectContaining({ code: "bulk_workspace_too_large" }));
    const workspace = savedWorkspace(58, 10 * 1024 * 1024);
    workspace.media.forEach((photo) => { delete photo.savedPhotoId; });
    expect(validateBulkListingWorkspace(workspace).issues).toContainEqual(expect.objectContaining({ code: "bulk_request_too_large" }));
  });

  it("supports up to 100 listing rows, but still rejects a larger batch", () => {
    expect(validateBulkListingWorkspace(savedWorkspace(100, 1024)).hasErrors).toBe(false);
    expect(validateBulkListingWorkspace(savedWorkspace(101, 1024)).issues).toContainEqual(expect.objectContaining({ code: "bulk_items_too_many" }));
  });

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
