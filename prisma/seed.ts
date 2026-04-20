import {
  BidTier,
  PaymentMethodCode,
  PrismaClient,
  UserRole
} from "@prisma/client";

const prisma = new PrismaClient();

function normalizeEmail(email: string) {
  return email.trim().toLowerCase();
}

async function seed() {
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
      acceptedTermsAtUtc: new Date("2026-04-19T00:00:00.000Z"),
      emailVerifiedAtUtc: new Date("2026-04-19T00:00:00.000Z")
    },
    create: {
      email: adminEmail,
      normalizedEmail: normalizedAdminEmail,
      passwordHash: "credentials-placeholder-hash",
      role: UserRole.admin,
      displayName: "Admin Placeholder",
      acceptedTermsVersion: "v1",
      acceptedTermsAtUtc: new Date("2026-04-19T00:00:00.000Z"),
      emailVerifiedAtUtc: new Date("2026-04-19T00:00:00.000Z")
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

  console.log(
    JSON.stringify(
      {
        seed: "auction-initial",
        status: "ok",
        adminEmail,
        categoriesSeeded: categories.map((category) => category.slug),
        paymentMethodsSeeded: sitePaymentMethods.map((method) => method.code),
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
