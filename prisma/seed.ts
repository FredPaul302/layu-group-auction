import {
  BidTier,
  PaymentMethodCode,
  PrismaClient,
  UserRole
} from "@prisma/client";

import { hashPassword } from "../src/lib/auth/password.js";

const prisma = new PrismaClient();
const fixedAcceptedTermsAtUtc = new Date("2026-04-19T00:00:00.000Z");

function normalizeEmail(email: string) {
  return email.trim().toLowerCase();
}

function getBooleanEnv(value: string | undefined) {
  return value?.trim().toLowerCase() === "true";
}

function getDevSeedConfig() {
  const enabled = getBooleanEnv(process.env.SEED_LOCAL_DEV_DATA);

  if (!enabled) {
    return {
      enabled: false as const
    };
  }

  if (process.env.NODE_ENV === "production") {
    throw new Error("SEED_LOCAL_DEV_DATA must not be enabled when NODE_ENV=production.");
  }

  return {
    enabled: true as const,
    adminEmail: process.env.DEV_SEED_ADMIN_EMAIL?.trim() || "admin@local.layu.test",
    adminPassword: process.env.DEV_SEED_ADMIN_PASSWORD?.trim() || "DevAdmin123!",
    userEmail: process.env.DEV_SEED_USER_EMAIL?.trim() || "bidder@local.layu.test",
    userPassword: process.env.DEV_SEED_USER_PASSWORD?.trim() || "DevBuyer123!"
  };
}

async function upsertUserWithProfile(input: {
  email: string;
  password: string;
  role: UserRole;
  displayName: string;
  maxBidTier: BidTier;
}) {
  const normalizedEmail = normalizeEmail(input.email);
  const passwordHash = await hashPassword(input.password);

  const user = await prisma.user.upsert({
    where: {
      normalizedEmail
    },
    update: {
      role: input.role,
      displayName: input.displayName,
      passwordHash,
      acceptedTermsVersion: "v1",
      acceptedTermsAtUtc: fixedAcceptedTermsAtUtc,
      emailVerifiedAtUtc: fixedAcceptedTermsAtUtc
    },
    create: {
      email: input.email,
      normalizedEmail,
      passwordHash,
      role: input.role,
      displayName: input.displayName,
      acceptedTermsVersion: "v1",
      acceptedTermsAtUtc: fixedAcceptedTermsAtUtc,
      emailVerifiedAtUtc: fixedAcceptedTermsAtUtc
    }
  });

  await prisma.bidderProfile.upsert({
    where: {
      userId: user.id
    },
    update: {
      maxBidTier: input.maxBidTier,
      activeHoldAmountCents: 0,
      isBlocked: false,
      blockedAtUtc: null,
      blockReason: null,
      nonPaymentStrikeCount: 0,
      lastNonPaymentAtUtc: null
    },
    create: {
      userId: user.id,
      maxBidTier: input.maxBidTier,
      activeHoldAmountCents: 0,
      isBlocked: false,
      nonPaymentStrikeCount: 0
    }
  });

  return user;
}

async function seedBaseAdminUser(devSeed: ReturnType<typeof getDevSeedConfig>) {
  if (devSeed.enabled) {
    return upsertUserWithProfile({
      email: devSeed.adminEmail,
      password: devSeed.adminPassword,
      role: UserRole.admin,
      displayName: "Admin Placeholder",
      maxBidTier: BidTier.full
    });
  }

  const adminEmail = "admin@example.com";
  const normalizedAdminEmail = normalizeEmail(adminEmail);

  const adminUser = await prisma.user.upsert({
    where: {
      normalizedEmail: normalizedAdminEmail
    },
    update: {
      role: UserRole.admin,
      displayName: "Admin Placeholder",
      acceptedTermsVersion: "v1",
      acceptedTermsAtUtc: fixedAcceptedTermsAtUtc,
      emailVerifiedAtUtc: fixedAcceptedTermsAtUtc
    },
    create: {
      email: adminEmail,
      normalizedEmail: normalizedAdminEmail,
      passwordHash: "credentials-placeholder-hash",
      role: UserRole.admin,
      displayName: "Admin Placeholder",
      acceptedTermsVersion: "v1",
      acceptedTermsAtUtc: fixedAcceptedTermsAtUtc,
      emailVerifiedAtUtc: fixedAcceptedTermsAtUtc
    }
  });

  await prisma.bidderProfile.upsert({
    where: {
      userId: adminUser.id
    },
    update: {
      maxBidTier: BidTier.full,
      activeHoldAmountCents: 0,
      isBlocked: false,
      nonPaymentStrikeCount: 0
    },
    create: {
      userId: adminUser.id,
      maxBidTier: BidTier.full,
      activeHoldAmountCents: 0,
      isBlocked: false,
      nonPaymentStrikeCount: 0
    }
  });

  return adminUser;
}

async function seedLocalDevFixtures(input: {
  adminUserId: string;
  devSeed: Extract<ReturnType<typeof getDevSeedConfig>, { enabled: true }>;
}) {
  const bidderUser = await upsertUserWithProfile({
    email: input.devSeed.userEmail,
    password: input.devSeed.userPassword,
    role: UserRole.bidder,
    displayName: "Local Test Bidder",
    maxBidTier: BidTier.tier_0
  });

  const [categories, pickupEvent] = await Promise.all([
    prisma.category.findMany({
      where: {
        slug: {
          in: ["tier-5-collectibles", "tier-10-vintage", "tier-20-premium"]
        }
      }
    }),
    prisma.pickupEvent.findUniqueOrThrow({
      where: {
        slug: "sample-spring-pickup"
      }
    })
  ]);

  const categoryMap = new Map(categories.map((category) => [category.slug, category]));
  const tier5Category = categoryMap.get("tier-5-collectibles");
  const tier10Category = categoryMap.get("tier-10-vintage");
  const tier20Category = categoryMap.get("tier-20-premium");

  if (!tier5Category || !tier10Category || !tier20Category) {
    throw new Error("Local dev fixture seed requires the base categories to exist.");
  }

  const now = new Date();
  const auctionEndFast = new Date(now.getTime() + 48 * 60 * 60 * 1000);
  const auctionEndSlow = new Date(now.getTime() + 72 * 60 * 60 * 1000);
  const seededListings: string[] = [];

  const fixedPriceFixtures = [
    {
      slug: "dev-fixed-price-vintage-camera",
      title: "Vintage 35mm Camera Kit",
      description:
        "Clean local-dev sample listing with body, lens, strap, and case. Useful for fixed-price checkout and admin payment review testing.",
      conditionNote: "Test fixture with light cosmetic wear and no film included.",
      fixedPriceCents: 12_500,
      fulfillmentMode: "pickup_or_shipping" as const,
      shippingFeeCents: 1_500,
      shippingNotes: "Flat-rate insured shipping.",
      categoryId: tier10Category.id,
      pickupEventId: pickupEvent.id
    },
    {
      slug: "dev-fixed-price-arcade-stick",
      title: "Custom Arcade Fight Stick",
      description:
        "Second local-dev fixed-price listing for account, order, and fulfillment testing.",
      conditionNote: "Test fixture with sanwa-style buttons and USB cable.",
      fixedPriceCents: 18_900,
      fulfillmentMode: "shipping_only" as const,
      shippingFeeCents: 2_200,
      shippingNotes: "Ships in a padded carton.",
      categoryId: tier20Category.id,
      pickupEventId: null
    }
  ] as const;

  for (const fixture of fixedPriceFixtures) {
    const listing = await prisma.listing.upsert({
      where: {
        slug: fixture.slug
      },
      update: {
        sellerUserId: input.adminUserId,
        categoryId: fixture.categoryId,
        pickupEventId: fixture.pickupEventId,
        listingType: "fixed_price",
        status: "published",
        title: fixture.title,
        description: fixture.description,
        conditionNote: fixture.conditionNote,
        fixedPriceCents: fixture.fixedPriceCents,
        fulfillmentMode: fixture.fulfillmentMode,
        shippingFeeCents: fixture.shippingFeeCents,
        shippingNotes: fixture.shippingNotes,
        publishedAtUtc: now,
        archivedAtUtc: null
      },
      create: {
        sellerUserId: input.adminUserId,
        categoryId: fixture.categoryId,
        pickupEventId: fixture.pickupEventId,
        listingType: "fixed_price",
        status: "published",
        slug: fixture.slug,
        title: fixture.title,
        description: fixture.description,
        conditionNote: fixture.conditionNote,
        fixedPriceCents: fixture.fixedPriceCents,
        fulfillmentMode: fixture.fulfillmentMode,
        shippingFeeCents: fixture.shippingFeeCents,
        shippingNotes: fixture.shippingNotes,
        publishedAtUtc: now
      }
    });

    await prisma.auction.deleteMany({
      where: {
        listingId: listing.id
      }
    });

    seededListings.push(fixture.slug);
  }

  const auctionFixtures = [
    {
      slug: "dev-auction-comic-lot",
      title: "Bronze Age Comic Lot",
      description:
        "Local-dev auction fixture with a live end time for bid placement and auction close-job testing.",
      conditionNote: "Test fixture in mixed condition with visible edge wear.",
      startingBidCents: 3_500,
      endAtUtc: auctionEndFast,
      fulfillmentMode: "pickup_only" as const,
      shippingFeeCents: 0,
      shippingNotes: null,
      categoryId: tier5Category.id,
      minimumIncrementCents: tier5Category.minimumBidIncrementCents,
      pickupEventId: pickupEvent.id
    },
    {
      slug: "dev-auction-synth-module",
      title: "Boutique Eurorack Synth Module",
      description:
        "Second local-dev auction fixture for live catalog, bidding, and order conversion testing.",
      conditionNote: "Test fixture with power ribbon and original screws.",
      startingBidCents: 24_000,
      endAtUtc: auctionEndSlow,
      fulfillmentMode: "pickup_or_shipping" as const,
      shippingFeeCents: 1_800,
      shippingNotes: "Flat-rate tracked shipping.",
      categoryId: tier20Category.id,
      minimumIncrementCents: tier20Category.minimumBidIncrementCents,
      pickupEventId: pickupEvent.id
    }
  ] as const;

  for (const fixture of auctionFixtures) {
    const listing = await prisma.listing.upsert({
      where: {
        slug: fixture.slug
      },
      update: {
        sellerUserId: input.adminUserId,
        categoryId: fixture.categoryId,
        pickupEventId: fixture.pickupEventId,
        listingType: "auction",
        status: "published",
        title: fixture.title,
        description: fixture.description,
        conditionNote: fixture.conditionNote,
        fixedPriceCents: null,
        fulfillmentMode: fixture.fulfillmentMode,
        shippingFeeCents: fixture.shippingFeeCents,
        shippingNotes: fixture.shippingNotes,
        publishedAtUtc: now,
        archivedAtUtc: null
      },
      create: {
        sellerUserId: input.adminUserId,
        categoryId: fixture.categoryId,
        pickupEventId: fixture.pickupEventId,
        listingType: "auction",
        status: "published",
        slug: fixture.slug,
        title: fixture.title,
        description: fixture.description,
        conditionNote: fixture.conditionNote,
        fixedPriceCents: null,
        fulfillmentMode: fixture.fulfillmentMode,
        shippingFeeCents: fixture.shippingFeeCents,
        shippingNotes: fixture.shippingNotes,
        publishedAtUtc: now
      }
    });

    await prisma.auction.upsert({
      where: {
        listingId: listing.id
      },
      update: {
        status: "live",
        startAtUtc: now,
        endAtUtc: fixture.endAtUtc,
        startingBidCents: fixture.startingBidCents,
        currentHighestBidCents: null,
        currentHighestBidderId: null,
        minimumIncrementCents: fixture.minimumIncrementCents,
        closedAtUtc: null
      },
      create: {
        listingId: listing.id,
        status: "live",
        startAtUtc: now,
        endAtUtc: fixture.endAtUtc,
        startingBidCents: fixture.startingBidCents,
        minimumIncrementCents: fixture.minimumIncrementCents
      }
    });

    seededListings.push(fixture.slug);
  }

  return {
    bidderEmail: bidderUser.email,
    bidderPassword: input.devSeed.userPassword,
    seededListings
  };
}

async function seed() {
  const devSeed = getDevSeedConfig();
  const adminUser = await seedBaseAdminUser(devSeed);

  const categories = [
    {
      slug: "tier-5-collectibles",
      name: "Tier 5 Collectibles",
      description: "Entry-tier items with a five-dollar deposit requirement.",
      requiredBidTier: BidTier.tier_5,
      minimumBidIncrementCents: 100,
      minimumStartBidCents: 500
    },
    {
      slug: "tier-10-vintage",
      name: "Tier 10 Vintage",
      description: "Mid-tier vintage inventory that requires the ten-dollar tier.",
      requiredBidTier: BidTier.tier_10,
      minimumBidIncrementCents: 250,
      minimumStartBidCents: 1000
    },
    {
      slug: "tier-20-premium",
      name: "Tier 20 Premium",
      description: "Higher-value listings reserved for the twenty-dollar tier.",
      requiredBidTier: BidTier.tier_20,
      minimumBidIncrementCents: 500,
      minimumStartBidCents: 2000
    }
  ] as const;

  for (const category of categories) {
    await prisma.category.upsert({
      where: {
        slug: category.slug
      },
      update: {
        name: category.name,
        description: category.description,
        requiredBidTier: category.requiredBidTier,
        minimumBidIncrementCents: category.minimumBidIncrementCents,
        minimumStartBidCents: category.minimumStartBidCents,
        isEnabled: true
      },
      create: {
        ...category,
        isEnabled: true
      }
    });
  }

  await prisma.pickupEvent.upsert({
    where: {
      slug: "sample-spring-pickup"
    },
    update: {
      name: "Sample Spring Pickup Event",
      locationName: "Warehouse Pickup Desk",
      address: "123 Sample Warehouse Way, Buffalo, NY 14202",
      instructions: "Bring a copy of your paid order confirmation and photo ID at pickup.",
      startAtUtc: new Date("2026-05-02T14:00:00.000Z"),
      endAtUtc: new Date("2026-05-02T18:00:00.000Z"),
      isActive: true
    },
    create: {
      slug: "sample-spring-pickup",
      name: "Sample Spring Pickup Event",
      locationName: "Warehouse Pickup Desk",
      address: "123 Sample Warehouse Way, Buffalo, NY 14202",
      instructions: "Bring a copy of your paid order confirmation and photo ID at pickup.",
      startAtUtc: new Date("2026-05-02T14:00:00.000Z"),
      endAtUtc: new Date("2026-05-02T18:00:00.000Z"),
      isActive: true
    }
  });

  await prisma.siteSetting.upsert({
    where: {
      id: 1
    },
    update: {
      sellerDisplayName: "Layu Group LLC",
      supportEmail: "support@example.com",
      defaultWinnerPaymentWindowHours: 48,
      defaultRunnerUpOfferWindowHours: 48,
      timeZone: "America/New_York"
    },
    create: {
      id: 1,
      sellerDisplayName: "Layu Group LLC",
      supportEmail: "support@example.com",
      defaultWinnerPaymentWindowHours: 48,
      defaultRunnerUpOfferWindowHours: 48,
      timeZone: "America/New_York"
    }
  });

  const sitePaymentMethods = [
    {
      code: PaymentMethodCode.paypal,
      displayName: "PayPal",
      handle: "paypal-placeholder",
      linkUrl: process.env.PAYPAL_ME_URL ?? "https://paypal.me/your-handle",
      instructions: "Submit your PayPal payment and include the transaction reference.",
      sortOrder: 1
    },
    {
      code: PaymentMethodCode.venmo,
      displayName: "Venmo",
      handle: process.env.VENMO_HANDLE ?? "@yourvenmo",
      linkUrl: process.env.VENMO_PROFILE_URL ?? "https://venmo.com/yourvenmo",
      instructions: "Submit your Venmo payment and include the payment note or reference.",
      sortOrder: 2
    },
    {
      code: PaymentMethodCode.cash_app,
      displayName: "Cash App",
      handle: process.env.CASH_APP_CASHTAG ?? "$yourcashtag",
      linkUrl: process.env.CASH_APP_PROFILE_URL ?? "https://cash.app/$yourcashtag",
      instructions: "Submit your Cash App payment and include the payment confirmation details.",
      sortOrder: 3
    }
  ] as const;

  for (const paymentMethod of sitePaymentMethods) {
    await prisma.sitePaymentMethod.upsert({
      where: {
        code: paymentMethod.code
      },
      update: {
        displayName: paymentMethod.displayName,
        handle: paymentMethod.handle,
        linkUrl: paymentMethod.linkUrl,
        instructions: paymentMethod.instructions,
        isEnabled: true,
        sortOrder: paymentMethod.sortOrder
      },
      create: {
        ...paymentMethod,
        isEnabled: true
      }
    });
  }

  const localDevFixtures = devSeed.enabled
    ? await seedLocalDevFixtures({
        adminUserId: adminUser.id,
        devSeed
      })
    : null;

  console.log(
    JSON.stringify(
      {
        seed: "auction-initial",
        status: "ok",
        adminEmail: adminUser.email,
        categoriesSeeded: categories.map((category) => category.slug),
        paymentMethodsSeeded: sitePaymentMethods.map((method) => method.code),
        localDevSeedEnabled: devSeed.enabled,
        localDevFixtures,
        timestampUtc: new Date().toISOString()
      },
      null,
      2
    )
  );
}

seed()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
