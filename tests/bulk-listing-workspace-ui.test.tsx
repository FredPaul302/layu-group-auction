import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { BulkListingWorkspace } from "../src/components/admin/bulk-listing-workspace.js";

describe("bulk listing workspace UI", () => {
  it("renders row health counts and the draft creation summary", () => {
    const html = renderToStaticMarkup(
      <BulkListingWorkspace
        categories={[
          {
            id: "cat_1",
            name: "Arcade",
            slug: "arcade"
          }
        ]}
      />
    );

    expect(html).toContain("Total rows");
    expect(html).toContain("Ready rows");
    expect(html).toContain("Warning rows");
    expect(html).toContain("Blocked rows");
    expect(html).toContain("Draft creation summary");
    expect(html).toContain("Reset workspace");
  });
});
