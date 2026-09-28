export const crossListingChannelIds = [
  "facebook_marketplace", "facebook_page", "facebook_shop", "ebay", "craigslist", "mercari", "shopify",
] as const;

export type CrossListingChannel = typeof crossListingChannelIds[number];

export type CrossListingChannelInfo = {
  id: CrossListingChannel;
  label: string;
  method: "manual" | "page_post" | "catalog_review" | "draft_import";
  openUrl: string;
  summary: string;
  setupSteps: readonly string[];
  titleMaxLength?: number;
};

export const crossListingChannels: readonly CrossListingChannelInfo[] = [
  {
    id: "facebook_marketplace", label: "Facebook Marketplace", method: "manual",
    openUrl: "https://www.facebook.com/marketplace/create/item",
    summary: "Prepare item text and photos, then review and post with your personal Facebook account.",
    setupSteps: ["Confirm that your personal profile can sell on Marketplace.", "Copy the prepared item details and upload its photos in Marketplace.", "Save the published URL here and mark the item sold on every other site when it sells."],
  },
  {
    id: "facebook_page", label: "Facebook business Page", method: "page_post",
    openUrl: "https://business.facebook.com/",
    summary: "Promote your Layu listings and auction closing dates with a post linking to your website.",
    setupSteps: ["Create or choose the Layu Market business Page that you manage.", "Set up an authorized Page connection, or paste the prepared promotion into a Page post.", "Review the post and its auction closing date before publishing."],
  },
  {
    id: "facebook_shop", label: "Facebook Shop / catalog", method: "catalog_review",
    openUrl: "https://business.facebook.com/commerce/",
    summary: "Prepare products for an eligible business catalog. Shop approval and a supported catalog connection are required.",
    setupSteps: ["Check business, domain, checkout, and Shop eligibility in Commerce Manager.", "Choose an approved catalog connection after account review.", "Keep these records as preparation until your catalog accepts and publishes them."],
  },
  {
    id: "ebay", label: "eBay", method: "manual",
    openUrl: "https://www.ebay.com/sl/sell",
    summary: "Prepare fixed-price items for seller review. Direct publishing needs an authorized seller connection and eBay selling policies.",
    setupSteps: ["Confirm your eBay seller account and shipping, return, and payment policies.", "Choose the eBay category, item specifics, and condition for each item.", "Review the final price and any fees in eBay before publishing; save the listing URL here."],
    titleMaxLength: 80,
  },
  {
    id: "craigslist", label: "Craigslist", method: "manual",
    openUrl: "https://post.craigslist.org/",
    summary: "Prepare local sale details for manual posting. The bulk interface requires Craigslist's approval.",
    setupSteps: ["Choose your local Craigslist area and the appropriate seller category.", "Copy the prepared description and upload the ordered photos.", "Review any posting charge and save the final URL here. Ask Craigslist about dealer bulk access if your volume qualifies."],
  },
  {
    id: "mercari", label: "Mercari", method: "manual",
    openUrl: "https://www.mercari.com/sell/",
    summary: "Prepare text and photos for review in Mercari. Publication and sold updates are manual.",
    setupSteps: ["Confirm your Mercari seller account.", "Create the item using its prepared text and photos; choose category, condition, and shipping in Mercari.", "Review the final price and fees, publish, and save its URL here."],
  },
  {
    id: "shopify", label: "Shopify", method: "draft_import",
    openUrl: "https://admin.shopify.com/",
    summary: "Send products to a connected store as drafts, or import a Shopify draft CSV. Review inventory and fulfillment before activating.",
    setupSteps: ["Use an existing Shopify store, or decide separately whether a store subscription is useful.", "Connect the store or import the Shopify CSV with overwrite disabled for your first import.", "Review imported drafts, category, stock, shipping, and taxes in Shopify before making them available."],
  },
];

export function isCrossListingChannel(value: unknown): value is CrossListingChannel {
  return typeof value === "string" && crossListingChannelIds.some((id) => id === value);
}

export function getCrossListingChannel(id: CrossListingChannel): CrossListingChannelInfo {
  const channel = crossListingChannels.find((entry) => entry.id === id);
  if (!channel) throw new Error("Choose a supported destination.");
  return channel;
}
