interface CompletionAchievementInput {
  currentAchievementTypes: string[];
  totalKmAfterCompletion: number;
  totalCompletionsAfterCompletion: number;
  elevationGain: number;
}

export function getNewAchievementTypes({
  currentAchievementTypes,
  totalKmAfterCompletion,
  totalCompletionsAfterCompletion,
  elevationGain,
}: CompletionAchievementInput) {
  const existing = new Set(currentAchievementTypes);
  const unlocked: string[] = [];

  const maybeAdd = (type: string, shouldUnlock: boolean) => {
    if (shouldUnlock && !existing.has(type)) {
      existing.add(type);
      unlocked.push(type);
    }
  };

  maybeAdd("first_route", totalCompletionsAfterCompletion >= 1);
  maybeAdd("km_10", totalKmAfterCompletion >= 10);
  maybeAdd("km_50", totalKmAfterCompletion >= 50);
  maybeAdd("km_100", totalKmAfterCompletion >= 100);
  maybeAdd("explorer", totalCompletionsAfterCompletion >= 5);
  maybeAdd("mountain_goat", elevationGain >= 300);

  return unlocked;
}
