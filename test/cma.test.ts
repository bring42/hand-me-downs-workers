import { describe, it, expect } from "vitest";
import { _adapt } from "../src/sources/cma";

describe("cma adapt", () => {
  const baseObj = {
    id: 129541,
    accession_number: "1916.1052",
    title: "Twilight in the Wilderness",
    creation_date: "1860",
    creation_date_earliest: 1860,
    creation_date_latest: 1860,
    technique: "Oil on canvas",
    measurements: "40 x 64 in.",
    type: "Painting",
    department: "American Painting and Sculpture",
    creditline: "Mr. and Mrs. William H. Marlatt Fund",
    description: "A dramatic landscape",
    culture: "American",
    share_license_status: "CC0",
    url: "https://www.clevelandart.org/art/1916.1052",
    creators: [{ description: "Frederic Edwin Church (American, 1826-1900)" }],
    images: {
      web: { url: "https://openaccess-cdn.clevelandart.org/1916.1052/1916.1052_web.jpg" },
      print: { url: "https://openaccess-cdn.clevelandart.org/1916.1052/1916.1052_print.jpg" },
      full: { url: "https://openaccess-cdn.clevelandart.org/1916.1052/1916.1052_full.jpg" },
    },
    alternate_images: [
      { web: { url: "https://openaccess-cdn.clevelandart.org/1916.1052/alt1_web.jpg" } },
    ],
  };

  it("returns a valid UnifiedRecord for CC0 artwork", () => {
    const rec = _adapt(baseObj);
    expect(rec).not.toBeNull();
    expect(rec!.uid).toBe("CMA-129541");
    expect(rec!.source).toBe("cma");
    expect(rec!.title).toBe("Twilight in the Wilderness");
    expect(rec!.creator).toBe("Frederic Edwin Church");
    expect(rec!.image_url).toContain("1916.1052_web.jpg");
    expect(rec!.additional_images).toHaveLength(1);
    expect(rec!.image_count).toBe(2);
    expect(rec!.rights).toBe("CC0");
  });

  it("returns null for non-CC0 artwork", () => {
    const rec = _adapt({ ...baseObj, share_license_status: "ARR" });
    expect(rec).toBeNull();
  });

  it("returns null when web image URL is missing", () => {
    const rec = _adapt({ ...baseObj, images: { web: { url: "" } } });
    expect(rec).toBeNull();
  });

  it("handles array culture", () => {
    const rec = _adapt({ ...baseObj, culture: ["American", "European"] });
    expect(rec!.culture).toBe("American, European");
  });

  it("strips parenthetical from creator name", () => {
    const rec = _adapt(baseObj);
    expect(rec!.creator).toBe("Frederic Edwin Church");
  });

  it("handles missing creators", () => {
    const rec = _adapt({ ...baseObj, creators: [] });
    expect(rec).not.toBeNull();
    expect(rec!.creator).toBe("");
  });

  it("handles missing alternate_images", () => {
    const rec = _adapt({ ...baseObj, alternate_images: undefined });
    expect(rec).not.toBeNull();
    expect(rec!.additional_images).toHaveLength(0);
    expect(rec!.image_count).toBe(1);
  });
});
