import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { CategoryForm } from "../src/components/admin/category-form.js";

describe("admin category form", () => {
  it("renders editable slug controls with regeneration affordance", () => {
    const html = renderToStaticMarkup(
      <CategoryForm action={() => undefined} submitLabel="Save category" />
    );

    expect(html).toContain("name=\"slug\"");
    expect(html).toContain("Regenerate from name");
    expect(html).toContain("Save category");
  });
});
