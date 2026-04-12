import { describe, it, expect } from "vitest";
import { _adapt, _extractTitle, _extractCreatorName } from "../src/sources/rijks";

describe("rijks extractTitle", () => {
  it("handles plain string", () => {
    expect(_extractTitle("The Night Watch")).toBe("The Night Watch");
  });

  it("handles array with @language/@value objects", () => {
    expect(
      _extractTitle([
        { "@language": "nl", "@value": "De Nachtwacht" },
        { "@language": "en", "@value": "The Night Watch" },
      ])
    ).toBe("The Night Watch");
  });

  it("handles array falling back to first value", () => {
    expect(
      _extractTitle([{ "@language": "nl", "@value": "De Nachtwacht" }])
    ).toBe("De Nachtwacht");
  });

  it("handles object with @value", () => {
    expect(_extractTitle({ "@value": "Some title" })).toBe("Some title");
  });

  it("returns empty string for null/undefined", () => {
    expect(_extractTitle(null)).toBe("");
    expect(_extractTitle(undefined)).toBe("");
  });
});

describe("rijks extractCreatorName", () => {
  it("handles string creator", () => {
    expect(_extractCreatorName("Rembrandt")).toBe("Rembrandt");
  });

  it("handles object with title", () => {
    expect(_extractCreatorName({ title: "Rembrandt van Rijn" })).toBe("Rembrandt van Rijn");
  });

  it("handles array of creators", () => {
    expect(
      _extractCreatorName([{ title: "Rembrandt" }, { title: "Workshop" }])
    ).toBe("Rembrandt, Workshop");
  });

  it("returns empty for null", () => {
    expect(_extractCreatorName(null)).toBe("");
  });
});

describe("rijks adapt", () => {
  const baseObj = {
    title: "The Night Watch",
    creator: { title: "Rembrandt van Rijn" },
    date: "1642",
    description: "A famous painting",
    format: { title: "Oil on canvas" },
    type: { title: [{ "@language": "en", "@value": "painting" }] },
    rights: { "@id": "https://creativecommons.org/publicdomain/zero/1.0/" },
    relation: { "@id": "https://lh3.ggpht.com/full/max/0/default.jpg" },
    identifier: "SK-C-5",
  };

  it("returns a valid UnifiedRecord for CC0 object", () => {
    const rec = _adapt(baseObj, "SK-C-5");
    expect(rec).not.toBeNull();
    expect(rec!.uid).toBe("RIJKS-SK-C-5");
    expect(rec!.source).toBe("rijks");
    expect(rec!.title).toBe("The Night Watch");
    expect(rec!.creator).toBe("Rembrandt van Rijn");
    expect(rec!.rights).toBe("CC0");
  });

  it("returns Public Domain Mark for PDM rights", () => {
    const rec = _adapt(
      { ...baseObj, rights: { "@id": "https://creativecommons.org/publicdomain/mark/1.0/" } },
      "SK-C-5"
    );
    expect(rec).not.toBeNull();
    expect(rec!.rights).toBe("Public Domain Mark");
  });

  it("returns null for non-CC0 rights", () => {
    const rec = _adapt(
      { ...baseObj, rights: { "@id": "https://creativecommons.org/licenses/by/4.0/" } },
      "SK-C-5"
    );
    expect(rec).toBeNull();
  });

  it("returns null when relation has no image URL", () => {
    const rec = _adapt({ ...baseObj, relation: {} }, "SK-C-5");
    expect(rec).toBeNull();
  });

  it("constructs thumb URL from image URL", () => {
    const rec = _adapt(baseObj, "SK-C-5");
    expect(rec!.image_thumb).toContain("400,");
  });
});
