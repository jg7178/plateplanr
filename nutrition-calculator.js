// Personalized nutrition goal calculator (Mifflin-St Jeor + activity + presets)

const NutritionCalc = (() => {
  const ACTIVITY_LEVELS = [
    { id: 'sedentary', label: 'Sedentary', multiplier: 1.2, desc: 'Desk job, little exercise' },
    { id: 'light', label: 'Lightly active', multiplier: 1.375, desc: 'Light exercise 1–3 days/week' },
    { id: 'moderate', label: 'Moderately active', multiplier: 1.55, desc: 'Moderate exercise 3–5 days/week' },
    { id: 'active', label: 'Very active', multiplier: 1.725, desc: 'Hard exercise 6–7 days/week' },
    { id: 'athlete', label: 'Athlete', multiplier: 1.9, desc: 'Physical job or 2× training/day' },
  ];

  const GOAL_PRESETS = [
    { id: 'lose', label: 'Lose weight', icon: 'fa-arrow-trend-down', calorieOffset: -500, proteinPerLb: 1.0, fatPct: 0.25, desc: 'About 1 lb per week' },
    { id: 'mild-lose', label: 'Gentle cut', icon: 'fa-feather', calorieOffset: -300, proteinPerLb: 0.95, fatPct: 0.27, desc: 'Slow, sustainable loss' },
    { id: 'maintain', label: 'Maintain', icon: 'fa-scale-balanced', calorieOffset: 0, proteinPerLb: 0.8, fatPct: 0.28, desc: 'Stay at current weight' },
    { id: 'recomp', label: 'Recomposition', icon: 'fa-dumbbell', calorieOffset: -100, proteinPerLb: 1.1, fatPct: 0.27, desc: 'More protein, build & lean out' },
    { id: 'gain', label: 'Build muscle', icon: 'fa-arrow-trend-up', calorieOffset: 300, proteinPerLb: 0.95, fatPct: 0.28, desc: 'Lean bulk (+0.5 lb/week)' },
    { id: 'athletic', label: 'Athletic', icon: 'fa-person-running', calorieOffset: 100, proteinPerLb: 0.85, fatPct: 0.22, carbBoost: 0.05, desc: 'Higher carbs for training' },
  ];

  const DEFAULT_PROFILE = {
    sex: 'female',
    age: 30,
    weightLbs: 160,
    heightFt: 5,
    heightIn: 6,
    activity: 'moderate',
    goalPreset: 'maintain',
  };

  function lbsToKg(lbs) { return lbs * 0.453592; }
  function toCm(ft, inches) { return (ft * 12 + inches) * 2.54; }

  function calcBMR(profile) {
    const weightKg = lbsToKg(profile.weightLbs || 150);
    const heightCm = toCm(profile.heightFt || 5, profile.heightIn || 6);
    const age = profile.age || 30;
    const base = 10 * weightKg + 6.25 * heightCm - 5 * age;
    return profile.sex === 'male' ? base + 5 : base - 161;
  }

  function calcTDEE(profile) {
    const bmr = calcBMR(profile);
    const activity = ACTIVITY_LEVELS.find((a) => a.id === profile.activity) || ACTIVITY_LEVELS[2];
    return Math.round(bmr * activity.multiplier);
  }

  function minCalories(profile) {
    return profile.sex === 'male' ? 1500 : 1200;
  }

  function calcGoalCalories(profile, presetId) {
    const preset = GOAL_PRESETS.find((p) => p.id === presetId) || GOAL_PRESETS.find((p) => p.id === 'maintain');
    const tdee = calcTDEE(profile);
    const raw = tdee + (preset.calorieOffset || 0);
    return Math.max(minCalories(profile), Math.round(raw / 10) * 10);
  }

  function calcMacros(calories, profile, presetId) {
    const preset = GOAL_PRESETS.find((p) => p.id === presetId) || GOAL_PRESETS[2];
    const weight = profile.weightLbs || 150;

    const protein = Math.round(weight * (preset.proteinPerLb || 0.8));
    const proteinCals = protein * 4;

    let fatPct = preset.fatPct || 0.28;
    if (preset.carbBoost) fatPct -= preset.carbBoost;
    const fat = Math.max(Math.round(weight * 0.3), Math.round((calories * fatPct) / 9));

    const remaining = calories - proteinCals - fat * 9;
    const carbs = Math.max(50, Math.round(remaining / 4));

    const actualCals = proteinCals + fat * 9 + carbs * 4;
    return {
      calories: actualCals,
      protein,
      carbs,
      fat,
      proteinPct: Math.round((proteinCals / actualCals) * 100),
      carbsPct: Math.round((carbs * 4 / actualCals) * 100),
      fatPct: Math.round((fat * 9 / actualCals) * 100),
    };
  }

  function calculate(profile, presetId) {
    const p = { ...DEFAULT_PROFILE, ...profile };
    const preset = presetId || p.goalPreset || 'maintain';
    const tdee = calcTDEE(p);
    const bmr = Math.round(calcBMR(p));
    const calories = calcGoalCalories(p, preset);
    const macros = calcMacros(calories, p, preset);
    const presetInfo = GOAL_PRESETS.find((g) => g.id === preset);

    return {
      bmr,
      tdee,
      calories: macros.calories,
      protein: macros.protein,
      carbs: macros.carbs,
      fat: macros.fat,
      proteinPct: macros.proteinPct,
      carbsPct: macros.carbsPct,
      fatPct: macros.fatPct,
      preset: presetInfo,
      presetId: preset,
    };
  }

  function readProfileFromForm() {
    return {
      sex: document.getElementById('set-sex')?.value || 'female',
      age: Number(document.getElementById('set-age')?.value) || 30,
      weightLbs: Number(document.getElementById('set-weight')?.value) || 160,
      heightFt: Number(document.getElementById('set-height-ft')?.value) || 5,
      heightIn: Number(document.getElementById('set-height-in')?.value) || 6,
      activity: document.getElementById('set-activity')?.value || 'moderate',
      goalPreset: document.getElementById('set-goal-preset')?.value || 'maintain',
    };
  }

  return {
    ACTIVITY_LEVELS,
    GOAL_PRESETS,
    DEFAULT_PROFILE,
    calcBMR,
    calcTDEE,
    calculate,
    readProfileFromForm,
  };
})();