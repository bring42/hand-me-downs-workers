import { describe, it, expect } from "vitest";
import { _adapt } from "../src/sources/met";

describe("met adapt", () => {
  const baseObj = {
    objectID: 436535,
    isPublicDomain: true,
    primaryImage: "https://images.metmuseum.org/CRDImages/ep/original/DP251139.jpg",
    primaryImageSmall: "https://images.metmuseum.org/CRDImages/ep/web-large/DP251139.jpg",
    additionalImages: ["https://images.metmuseum.org/CRDImages/ep/original/DP251140.jpg"],
    title: "Wheat Field with Cypresses",
    artistDisplayName: "Vincent van Gogh",
    objectDate: "1889",
    objectBeginDate: 1889,
    objectEndDate: 1889,
    medium: "Oil on canvas",
    dimensions: "28 3/4 x 36 3/4 in.",
    classification: "Paintings",
    department: "European Paintings",
    creditLine: "Purchase, Gift of...",
    culture: "",
    objectURL: "https://www.metmuseum.org/art/collection/search/436535",
  };

  it("returns a valid UnifiedRecord for a CC0 object", () => {
    const rec = _adapt(baseObj);
    expect(rec).not.toBeNull();
    expect(rec!.uid).toBe("MET-436535");
    expect(rec!.source).toBe("met");
    expect(rec!.title).toBe("Wheat Field with Cypresses");
    expect(rec!.creator).toBe("Vincent van Gogh");
    expect(rec!.image_url).toBe(baseObj.primaryImage);
    expect(rec!.image_thumb).toBe(baseObj.primaryImageSmall);
    expect(rec!.additional_images).toHaveLength(1);
    expect(rec!.image_count).toBe(2);
    expect(rec!.rights).toBe("CC0");
  });

  it("returns null for non-public-domain objects", () => {
    const rec = _adapt({ ...baseObj, isPublicDomain: false });
    expect(rec).toBeNull();
  });

  it("returns null when primaryImage is empty", () => {
    const rec = _adapt({ ...baseObj, primaryImage: "" });
    expect(rec).toBeNull();
  });

  it("handles missing additionalImages", () => {
    const rec = _adapt({ ...baseObj, additionalImages: [] });
    expect(rec).not.toBeNull();
    expect(rec!.additional_images).toHaveLength(0);
    expect(rec!.image_count).toBe(1);
  });

  it("handles null dates", () => {
    const rec = _adapt({ ...baseObj, objectBeginDate: null, objectEndDate: null });
    expect(rec).not.toBeNull();
    expect(rec!.date_start).toBeNull();
    expect(rec!.date_end).toBeNull();
  });
});
