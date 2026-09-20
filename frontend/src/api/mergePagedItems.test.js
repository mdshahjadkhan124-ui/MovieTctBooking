import { describe, it, expect } from "vitest";
import { mergePagedItems } from "./mergePagedItems.js";

const row = (id, extra = {}) => ({ _id: id, ...extra });

describe("mergePagedItems", () => {
  it("appends a newly loaded page after the rows already cached", () => {
    const merged = mergePagedItems([row("a"), row("b")], [row("c"), row("d")]);
    expect(merged.map((r) => r._id)).toEqual(["a", "b", "c", "d"]);
  });

  // The regression this exists for: an invalidated list refetches the page
  // that was loaded last, so the same rows arrive again.
  it("does not duplicate rows when the same page arrives twice", () => {
    const pageTwo = [row("c"), row("d")];
    const afterLoadMore = mergePagedItems([row("a"), row("b")], pageTwo);
    const afterRefetch = mergePagedItems(afterLoadMore, pageTwo);

    expect(afterRefetch.map((r) => r._id)).toEqual(["a", "b", "c", "d"]);
  });

  it("refreshes a cached row in place rather than adding a second copy", () => {
    const cached = [row("a", { status: "confirmed" }), row("b", { status: "confirmed" })];
    const merged = mergePagedItems(cached, [row("a", { status: "cancelled" })]);

    expect(merged).toHaveLength(2);
    expect(merged[0]).toEqual({ _id: "a", status: "cancelled" });
    expect(merged.map((r) => r._id)).toEqual(["a", "b"]);
  });

  it("handles an empty cache and an empty page", () => {
    expect(mergePagedItems([], [row("a")]).map((r) => r._id)).toEqual(["a"]);
    expect(mergePagedItems([row("a")], []).map((r) => r._id)).toEqual(["a"]);
  });
});
