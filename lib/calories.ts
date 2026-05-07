const DEFAULT_WEIGHT_KG = 70;

interface EstimateCaloriesOptions {
  estimatedMin?: number;
  lengthKm?: number;
  elevationGain?: number;
  weightKg?: number | null;
}

export function estimateCalories({ estimatedMin, lengthKm = 0, elevationGain = 0, weightKg }: EstimateCaloriesOptions) {
  const safeWeightKg = weightKg && weightKg > 0 ? weightKg : DEFAULT_WEIGHT_KG;
  const minutes = estimatedMin && estimatedMin > 0 ? estimatedMin : Math.max((lengthKm / 4.8) * 60, 15);
  const hours = minutes / 60;
  const inclinePerKm = lengthKm > 0 ? elevationGain / lengthKm : 0;
  const met = inclinePerKm >= 40 || elevationGain >= 250 ? 5 : 3.5;

  return Math.round(met * safeWeightKg * hours);
}

export function formatCalories(calories: number) {
  return `${Math.max(0, Math.round(calories))} kcal`;
}

export { DEFAULT_WEIGHT_KG };
