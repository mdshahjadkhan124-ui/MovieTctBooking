import { describe, it, expect } from "vitest";
import { parsePagination, paginationMeta, DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE } from "./pagination.js";

describe("parsePagination", () => {
  it("defaults to the first page when nothing is asked for", () => {
    expect(parsePagination({})).toEqual({ page: 1, limit: DEFAULT_PAGE_SIZE, skip: 0 });
    expect(parsePagination()).toEqual({ page: 1, limit: DEFAULT_PAGE_SIZE, skip: 0 });
  });

  it("computes skip from page and limit", () => {
    expect(parsePagination({ page: "3", limit: "10" })).toEqual({ page: 3, limit: 10, skip: 20 });
  });

  it("caps limit so a single request can't pull the whole collection", () => {
    expect(parsePagination({ limit: "100000" }).limit).toBe(MAX_PAGE_SIZE);
  });

  it("ignores nonsense instead of failing the request", () => {
    expect(parsePagination({ page: "-5", limit: "0" })).toEqual({
      page: 1,
      limit: DEFAULT_PAGE_SIZE,
      skip: 0,
    });
    expect(parsePagination({ page: "abc", limit: "xyz" }).page).toBe(1);
  });
});

describe("paginationMeta", () => {
  it("reports more pages while results remain", () => {
    expect(paginationMeta({ page: 1, limit: 20, total: 55 })).toEqual({
      page: 1,
      limit: 20,
      total: 55,
      totalPages: 3,
      hasMore: true,
    });
  });

  it("reports no more on the last page", () => {
    expect(paginationMeta({ page: 3, limit: 20, total: 55 }).hasMore).toBe(false);
    expect(paginationMeta({ page: 1, limit: 20, total: 20 }).hasMore).toBe(false);
  });

  it("stays sane with no results at all", () => {
    expect(paginationMeta({ page: 1, limit: 20, total: 0 })).toMatchObject({
      totalPages: 1,
      hasMore: false,
    });
  });
});
