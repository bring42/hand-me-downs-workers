import { describe, it, expect } from "vitest";
import { _adapt } from "../src/sources/aic";

describe("aic adapt", () => {
  const baseObj = {
    id: 27992,
    title: "A Sunday on La Grande Jatte",
    artist_display: "Georges Seurat",
    artist_title: "Georges Seurat",
    date_display: "1884-86",
    date_start: 1884,
    date_end: 1886,
    medium_display: "Oil on canvas",
    dimensions: "207.5 × 308.1 cm",
    department_title: "Painting and Sculpture of Europe",
    department_id: 14,
    classification_title: "Painting",
    credit_line: "Helen Birch Bartlett Memorial Collection",
    is_public_domain: true,
    image_id: "2d484387-2509-5e8e-2c43-22f9981972eb",
    alt_image_ids: ["abc123"],
    short_description: "A famous pointillist painting",
    description: "Full description here",
    place_of_origin: "France",
  };

  it("returns a valid UnifiedRecord for a CC0 artwork", () => {
    const rec = _adapt(baseObj);
    expect(rec).not.toBeNull();
    expect(rec!.uid).toBe("AIC-27992");
    expect(rec!.source).toBe("aic");
    expect(rec!.title).toBe("A Sunday on La Grande Jatte");
    expect(rec!.image_url).toContain("iiif/2/2d484387");
    expect(rec!.image_url).toContain("843,");
    expect(rec!.image_thumb).toContain("400,");
    expect(rec!.additional_images).toHaveLength(1);
    expect(rec!.image_count).toBe(2);
    expect(rec!.object_url).toBe("https://www.artic.edu/artworks/27992");
    expect(rec!.rights).toBe("CC0");
  });

  it("returns null for non-public-domain artworks", () => {
    const rec = _adapt({ ...baseObj, is_public_domain: false });
    expect(rec).toBeNull();
  });

  it("returns null when image_id is null", () => {
    const rec = _adapt({ ...baseObj, image_id: null });
    expect(rec).toBeNull();
  });

  it("uses short_description over description", () => {
    const rec = _adapt(baseObj);
    expect(rec!.description).toBe("A famous pointillist painting");
  });

  it("falls back to description when short_description is empty", () => {
    const rec = _adapt({ ...baseObj, short_description: "", description: "Fallback" });
    expect(rec!.description).toBe("Fallback");
  });

  it("handles empty alt_image_ids", () => {
    const rec = _adapt({ ...baseObj, alt_image_ids: [] });
    expect(rec).not.toBeNull();
    expect(rec!.additional_images).toHaveLength(0);
    expect(rec!.image_count).toBe(1);
  });
});
