"use server";

import { Prisma } from "@prisma/client";
import { redirect } from "next/navigation";

import { requireAdminServerActionUser } from "@/lib/auth/server-action";

import { CatalogValidationError } from "./index";
import {
  archiveListing,
  closeListingNow,
  createCategoryFromFormData,
  createListingsFromFormData,
  createPickupEventFromFormData,
  publishListing,
  removeListingImage,
  unpublishListing,
  updateCategoryFromFormData,
  updateListingImagesFromFormData,
  updateListingFromFormData,
  updatePickupEventFromFormData
} from "./service";

function getCatalogErrorCode(error: unknown) {
  if (error instanceof CatalogValidationError) {
    return error.code;
  }

  if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
    return "duplicate_value";
  }

  return "unexpected";
}

export async function createCategoryAction(formData: FormData) {
  await requireAdminServerActionUser();

  try {
    await createCategoryFromFormData(formData);
  } catch (error) {
    redirect(`/admin/categories?error=${getCatalogErrorCode(error)}`);
  }

  redirect("/admin/categories?status=category_saved");
}

export async function updateCategoryAction(categoryId: string, formData: FormData) {
  await requireAdminServerActionUser();

  try {
    await updateCategoryFromFormData(categoryId, formData);
  } catch (error) {
    redirect(`/admin/categories?error=${getCatalogErrorCode(error)}`);
  }

  redirect("/admin/categories?status=category_updated");
}

export async function createPickupEventAction(formData: FormData) {
  await requireAdminServerActionUser();

  try {
    await createPickupEventFromFormData(formData);
  } catch (error) {
    redirect(`/admin/pickup-events?error=${getCatalogErrorCode(error)}`);
  }

  redirect("/admin/pickup-events?status=pickup_event_saved");
}

export async function updatePickupEventAction(pickupEventId: string, formData: FormData) {
  await requireAdminServerActionUser();

  try {
    await updatePickupEventFromFormData(pickupEventId, formData);
  } catch (error) {
    redirect(`/admin/pickup-events?error=${getCatalogErrorCode(error)}`);
  }

  redirect("/admin/pickup-events?status=pickup_event_updated");
}

export async function createListingAction(formData: FormData) {
  const adminUser = await requireAdminServerActionUser();
  let listingIds: string[] = [];

  try {
    const listings = await createListingsFromFormData({
      formData,
      sellerUserId: adminUser.id
    });
    listingIds = listings.map((listing) => listing.id);
  } catch (error) {
    redirect(`/admin/listings/new?error=${getCatalogErrorCode(error)}`);
  }

  if (listingIds.length > 1) {
    redirect(`/admin/listings?status=listing_batch_created&count=${listingIds.length}`);
  }

  redirect(`/admin/listings/${listingIds[0]}/edit?status=listing_created`);
}

export async function updateListingAction(listingId: string, formData: FormData) {
  await requireAdminServerActionUser();

  try {
    await updateListingFromFormData({
      listingId,
      formData
    });
  } catch (error) {
    redirect(`/admin/listings/${listingId}/edit?error=${getCatalogErrorCode(error)}`);
  }

  redirect(`/admin/listings/${listingId}/edit?status=listing_updated`);
}

export async function updateListingImagesAction(listingId: string, formData: FormData) {
  await requireAdminServerActionUser();

  try {
    await updateListingImagesFromFormData({
      listingId,
      formData
    });
  } catch (error) {
    redirect(`/admin/listings/${listingId}/edit?error=${getCatalogErrorCode(error)}`);
  }

  redirect(`/admin/listings/${listingId}/edit?status=listing_images_updated`);
}

export async function removeListingImageAction(
  listingId: string,
  imageId: string,
  _formData: FormData
) {
  await requireAdminServerActionUser();

  try {
    await removeListingImage({
      listingId,
      imageId
    });
  } catch (error) {
    redirect(`/admin/listings/${listingId}/edit?error=${getCatalogErrorCode(error)}`);
  }

  redirect(`/admin/listings/${listingId}/edit?status=listing_image_removed`);
}

export async function archiveListingAction(listingId: string) {
  await requireAdminServerActionUser();

  try {
    await archiveListing(listingId);
  } catch (error) {
    redirect(`/admin/listings/${listingId}/edit?error=${getCatalogErrorCode(error)}`);
  }

  redirect("/admin/listings?status=listing_archived");
}

export async function publishListingAction(listingId: string) {
  await requireAdminServerActionUser();

  try {
    await publishListing(listingId);
  } catch (error) {
    redirect(`/admin/listings/${listingId}/edit?error=${getCatalogErrorCode(error)}`);
  }

  redirect(`/admin/listings/${listingId}/edit?status=listing_published`);
}

export async function unpublishListingAction(listingId: string) {
  await requireAdminServerActionUser();

  try {
    await unpublishListing(listingId);
  } catch (error) {
    redirect(`/admin/listings/${listingId}/edit?error=${getCatalogErrorCode(error)}`);
  }

  redirect(`/admin/listings/${listingId}/edit?status=listing_unpublished`);
}

export async function closeListingNowAction(listingId: string) {
  await requireAdminServerActionUser();

  try {
    await closeListingNow(listingId);
  } catch (error) {
    redirect(`/admin/listings/${listingId}/edit?error=${getCatalogErrorCode(error)}`);
  }

  redirect(`/admin/listings/${listingId}?status=listing_closed`);
}
