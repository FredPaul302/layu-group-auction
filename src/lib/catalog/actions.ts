"use server";

import { Prisma } from "@prisma/client";
import { redirect } from "next/navigation";

import { requireAdminUser } from "@/lib/auth";

import { CatalogValidationError } from "./index";
import {
  archiveListing,
  createCategoryFromFormData,
  createListingFromFormData,
  createPickupEventFromFormData,
  updateCategoryFromFormData,
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
  await requireAdminUser();

  try {
    await createCategoryFromFormData(formData);
  } catch (error) {
    redirect(`/admin/categories?error=${getCatalogErrorCode(error)}`);
  }

  redirect("/admin/categories?status=category_saved");
}

export async function updateCategoryAction(categoryId: string, formData: FormData) {
  await requireAdminUser();

  try {
    await updateCategoryFromFormData(categoryId, formData);
  } catch (error) {
    redirect(`/admin/categories?error=${getCatalogErrorCode(error)}`);
  }

  redirect("/admin/categories?status=category_updated");
}

export async function createPickupEventAction(formData: FormData) {
  await requireAdminUser();

  try {
    await createPickupEventFromFormData(formData);
  } catch (error) {
    redirect(`/admin/pickup-events?error=${getCatalogErrorCode(error)}`);
  }

  redirect("/admin/pickup-events?status=pickup_event_saved");
}

export async function updatePickupEventAction(pickupEventId: string, formData: FormData) {
  await requireAdminUser();

  try {
    await updatePickupEventFromFormData(pickupEventId, formData);
  } catch (error) {
    redirect(`/admin/pickup-events?error=${getCatalogErrorCode(error)}`);
  }

  redirect("/admin/pickup-events?status=pickup_event_updated");
}

export async function createListingAction(formData: FormData) {
  const adminUser = await requireAdminUser();
  let listingId: string;

  try {
    const listing = await createListingFromFormData({
      formData,
      sellerUserId: adminUser.id
    });
    listingId = listing.id;
  } catch (error) {
    redirect(`/admin/listings/new?error=${getCatalogErrorCode(error)}`);
  }

  redirect(`/admin/listings/${listingId}/edit?status=listing_created`);
}

export async function updateListingAction(listingId: string, formData: FormData) {
  await requireAdminUser();

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

export async function archiveListingAction(listingId: string) {
  await requireAdminUser();

  try {
    await archiveListing(listingId);
  } catch (error) {
    redirect(`/admin/listings/${listingId}/edit?error=${getCatalogErrorCode(error)}`);
  }

  redirect("/admin/listings?status=listing_archived");
}
