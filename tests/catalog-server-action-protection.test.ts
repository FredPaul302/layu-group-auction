import { beforeEach, describe, expect, it, vi } from "vitest";

const headersMocks = vi.hoisted(() => ({
  headers: vi.fn()
}));

const navigationMocks = vi.hoisted(() => ({
  redirect: vi.fn((path: string) => {
    throw new Error(`NEXT_REDIRECT:${path}`);
  })
}));

const authMocks = vi.hoisted(() => ({
  requireAdminUser: vi.fn()
}));

const appEnvMocks = vi.hoisted(() => ({
  getAppEnv: vi.fn()
}));

const catalogServiceMocks = vi.hoisted(() => ({
  archiveListing: vi.fn(),
  closeListingNow: vi.fn(),
  createCategoryFromFormData: vi.fn(),
  createListingsFromFormData: vi.fn(),
  createPickupEventFromFormData: vi.fn(),
  publishListing: vi.fn(),
  removeListingImage: vi.fn(),
  unpublishListing: vi.fn(),
  updateCategoryFromFormData: vi.fn(),
  updateListingImagesFromFormData: vi.fn(),
  updateListingFromFormData: vi.fn(),
  updatePickupEventFromFormData: vi.fn()
}));

vi.mock("next/headers", () => headersMocks);
vi.mock("next/navigation", () => navigationMocks);
vi.mock("@/lib/auth", () => authMocks);
vi.mock("@/lib/config/app-env", () => appEnvMocks);
vi.mock("@/lib/catalog/service", () => catalogServiceMocks);

import {
  archiveListingAction,
  closeListingNowAction,
  createCategoryAction,
  createListingAction,
  createPickupEventAction,
  publishListingAction,
  removeListingImageAction,
  unpublishListingAction,
  updateCategoryAction,
  updateListingAction,
  updateListingImagesAction,
  updatePickupEventAction
} from "../src/lib/catalog/actions.js";
import {
  isSameOriginServerActionOrigin,
  ServerActionOriginError
} from "../src/lib/auth/server-action.js";

function mockAppEnv({
  appUrl = "https://auction.example.com/",
  isProduction = false
}: {
  appUrl?: string;
  isProduction?: boolean;
} = {}) {
  appEnvMocks.getAppEnv.mockReturnValue({
    app: {
      url: appUrl
    },
    runtime: {
      isProduction
    }
  });
}

function mockHeaders(headers: HeadersInit) {
  headersMocks.headers.mockResolvedValue(new Headers(headers));
}

function expectNoCatalogMutation() {
  for (const mockFn of Object.values(catalogServiceMocks)) {
    expect(mockFn).not.toHaveBeenCalled();
  }
}

describe("catalog Server Action protection", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockAppEnv();
    mockHeaders({
      Origin: "https://auction.example.com"
    });
    authMocks.requireAdminUser.mockResolvedValue({
      id: "admin_1",
      role: "admin"
    });
  });

  it("normalizes same-origin values with trailing slashes", () => {
    expect(
      isSameOriginServerActionOrigin(
        "https://auction.example.com/",
        "https://auction.example.com/admin/"
      )
    ).toBe(true);
  });

  it("rejects foreign Origin before auth or mutation for every catalog action", async () => {
    mockHeaders({
      Origin: "https://evil.example"
    });

    const formData = new FormData();
    const actions = [
      () => createCategoryAction(formData),
      () => updateCategoryAction("category_1", formData),
      () => createPickupEventAction(formData),
      () => updatePickupEventAction("pickup_1", formData),
      () => createListingAction(formData),
      () => updateListingAction("listing_1", formData),
      () => updateListingImagesAction("listing_1", formData),
      () => removeListingImageAction("listing_1", "image_1", formData),
      () => archiveListingAction("listing_1"),
      () => publishListingAction("listing_1"),
      () => unpublishListingAction("listing_1"),
      () => closeListingNowAction("listing_1")
    ];

    for (const action of actions) {
      await expect(action()).rejects.toBeInstanceOf(ServerActionOriginError);
    }

    expect(authMocks.requireAdminUser).not.toHaveBeenCalled();
    expectNoCatalogMutation();
  });

  it("rejects missing Origin before auth or mutation in production-like mode", async () => {
    mockAppEnv({
      isProduction: true
    });
    mockHeaders({});

    await expect(archiveListingAction("listing_1")).rejects.toBeInstanceOf(
      ServerActionOriginError
    );

    expect(authMocks.requireAdminUser).not.toHaveBeenCalled();
    expect(catalogServiceMocks.archiveListing).not.toHaveBeenCalled();
  });

  it("allows same-origin admin actions to continue to the existing mutation path", async () => {
    catalogServiceMocks.createCategoryFromFormData.mockResolvedValue(undefined);

    const formData = new FormData();

    await expect(createCategoryAction(formData)).rejects.toThrow(
      "NEXT_REDIRECT:/admin/categories?status=category_saved"
    );

    expect(authMocks.requireAdminUser).toHaveBeenCalledTimes(1);
    expect(catalogServiceMocks.createCategoryFromFormData).toHaveBeenCalledWith(formData);
  });

  it("still requires admin auth before mutation", async () => {
    authMocks.requireAdminUser.mockRejectedValue(new Error("NEXT_REDIRECT:/auth/login"));

    await expect(createCategoryAction(new FormData())).rejects.toThrow(
      "NEXT_REDIRECT:/auth/login"
    );

    expect(authMocks.requireAdminUser).toHaveBeenCalledTimes(1);
    expect(catalogServiceMocks.createCategoryFromFormData).not.toHaveBeenCalled();
  });
});
