import { describe, it, expect } from "vitest";
import { _adapt, _imageUrls } from "../src/sources/mia";

describe("mia imageUrls", () => {
  it("constructs correct URLs from cache location and rendition", () => {
    const { primary, thumb } = _imageUrls({
      Cache_Location: "TMS Archives\\Objects\\1234",
      Primary_RenditionNumber: "1234_001.jpg",
    } as any);
    expect(primary).toBe(
      "https://img.artsmia.org/web_objects_cache/TMS Archives/Objects/1234/1234_001_full.jpg"
    );
    expect(thumb).toBe(
      "https://img.artsmia.org/web_objects_cache/TMS Archives/Objects/1234/1234_001_400.jpg"
    );
  });

  it("returns empty strings when cache location is missing", () => {
    const { primary, thumb } = _imageUrls({ Cache_Location: "", Primary_RenditionNumber: "x.jpg" } as any);
    expect(primary).toBe("");
    expect(thumb).toBe("");
  });

  it("returns empty strings when rendition number is missing", () => {
    const { primary, thumb } = _imageUrls({
      Cache_Location: "foo",
      Primary_RenditionNumber: "",
    } as any);
    expect(primary).toBe("");
    expect(thumb).toBe("");
  });
});

describe("mia adapt", () => {
  const baseObj = {
    id: 1234,
    public_access: 1,
    image: "valid",
    rights_type: "Public Domain",
    title: "Summer Landscape",
    artist: "John Smith",
    dated: "1890",
    medium: "Oil on canvas",
    dimension: "20 x 30 in.\r\n50.8 x 76.2 cm",
    classification: "Paintings",
    department: "Paintings",
    creditline: "Gift of...",
    culture: "American",
    Cache_Location: "TMS Archives\\Objects\\1234",
    Primary_RenditionNumber: "1234_001.jpg",
  };

  it("returns a valid UnifiedRecord for public domain object", () => {
    const rec = _adapt(baseObj as any);
    expect(rec).not.toBeNull();
    expect(rec!.uid).toBe("MIA-1234");
    expect(rec!.source).toBe("mia");
    expect(rec!.title).toBe("Summer Landscape");
    expect(rec!.image_url).toContain("_full.jpg");
    expect(rec!.image_thumb).toContain("_400.jpg");
    expect(rec!.rights).toBe("Public Domain");
  });

  it("returns null when public_access is not 1", () => {
    const rec = _adapt({ ...baseObj, public_access: 0 } as any);
    expect(rec).toBeNull();
  });

  it("returns null when image is not valid", () => {
    const rec = _adapt({ ...baseObj, image: "invalid" } as any);
    expect(rec).toBeNull();
  });

  it("returns null when rights_type is not Public Domain", () => {
    const rec = _adapt({ ...baseObj, rights_type: "Copyright" } as any);
    expect(rec).toBeNull();
  });

  it("replaces \\r\\n in dimensions with semicolons", () => {
    const rec = _adapt(baseObj as any);
    expect(rec!.dimensions).toBe("20 x 30 in.; 50.8 x 76.2 cm");
  });

  it("returns null when no cache location for images", () => {
    const rec = _adapt({ ...baseObj, Cache_Location: "" } as any);
    expect(rec).toBeNull();
  });
});
