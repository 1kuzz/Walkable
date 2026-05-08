import { describe, it, expect } from "vitest";
import { getNewAchievementTypes } from "@/lib/achievements";

const base = {
  currentAchievementTypes: [] as string[],
  totalKmAfterCompletion: 0,
  totalCompletionsAfterCompletion: 0,
  elevationGain: 0,
};

describe("getNewAchievementTypes", () => {
  it("returns no achievements for a fresh user with no completions", () => {
    expect(getNewAchievementTypes(base)).toEqual([]);
  });

  it("unlocks first_route on first completion", () => {
    const result = getNewAchievementTypes({ ...base, totalCompletionsAfterCompletion: 1 });
    expect(result).toContain("first_route");
  });

  it("unlocks km_10 when 10 km reached", () => {
    const result = getNewAchievementTypes({ ...base, totalKmAfterCompletion: 10 });
    expect(result).toContain("km_10");
  });

  it("does not unlock km_10 at 9.9 km", () => {
    const result = getNewAchievementTypes({ ...base, totalKmAfterCompletion: 9.9 });
    expect(result).not.toContain("km_10");
  });

  it("unlocks km_50 at 50 km", () => {
    const result = getNewAchievementTypes({ ...base, totalKmAfterCompletion: 50 });
    expect(result).toContain("km_50");
  });

  it("unlocks km_100 at 100 km", () => {
    const result = getNewAchievementTypes({ ...base, totalKmAfterCompletion: 100 });
    expect(result).toContain("km_100");
  });

  it("unlocks explorer at 5 completions", () => {
    const result = getNewAchievementTypes({ ...base, totalCompletionsAfterCompletion: 5 });
    expect(result).toContain("explorer");
  });

  it("does not unlock explorer at 4 completions", () => {
    const result = getNewAchievementTypes({ ...base, totalCompletionsAfterCompletion: 4 });
    expect(result).not.toContain("explorer");
  });

  it("unlocks mountain_goat at exactly 300 m elevation gain", () => {
    const result = getNewAchievementTypes({ ...base, elevationGain: 300 });
    expect(result).toContain("mountain_goat");
  });

  it("does not unlock mountain_goat below 300 m elevation gain", () => {
    const result = getNewAchievementTypes({ ...base, elevationGain: 299 });
    expect(result).not.toContain("mountain_goat");
  });

  it("unlocks multiple achievements in one completion when thresholds are crossed", () => {
    const result = getNewAchievementTypes({
      ...base,
      totalKmAfterCompletion: 100,
      totalCompletionsAfterCompletion: 5,
      elevationGain: 300,
    });
    expect(result).toContain("first_route");
    expect(result).toContain("km_10");
    expect(result).toContain("km_50");
    expect(result).toContain("km_100");
    expect(result).toContain("explorer");
    expect(result).toContain("mountain_goat");
  });

  it("does not re-unlock achievements the user already has", () => {
    const result = getNewAchievementTypes({
      ...base,
      currentAchievementTypes: ["first_route", "km_10", "explorer"],
      totalKmAfterCompletion: 100,
      totalCompletionsAfterCompletion: 10,
      elevationGain: 500,
    });
    expect(result).not.toContain("first_route");
    expect(result).not.toContain("km_10");
    expect(result).not.toContain("explorer");
    expect(result).toContain("km_50");
    expect(result).toContain("km_100");
    expect(result).toContain("mountain_goat");
  });

  it("returns an empty array when all applicable achievements are already unlocked", () => {
    const allTypes = ["first_route", "km_10", "km_50", "km_100", "explorer", "mountain_goat"];
    const result = getNewAchievementTypes({
      currentAchievementTypes: allTypes,
      totalKmAfterCompletion: 200,
      totalCompletionsAfterCompletion: 20,
      elevationGain: 500,
    });
    expect(result).toEqual([]);
  });
});
