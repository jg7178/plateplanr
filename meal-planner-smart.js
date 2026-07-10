// Smart meal planning — reuse ingredients across the week without overuse

const SmartMealPlanner = (() => {
  const INGREDIENT_ALIASES = {
    'grilled chicken': 'chicken', 'chicken breast': 'chicken', 'chicken thigh': 'chicken',
    'chicken sausage': 'chicken', 'ground turkey': 'turkey', 'sliced turkey': 'turkey',
    'flank steak': 'beef', 'sirloin steak': 'beef', 'ground beef': 'beef',
    'smoked salmon': 'salmon', 'salmon fillet': 'salmon', 'cod fillet': 'fish',
    'white fish fillet': 'fish', 'canned tuna': 'tuna', 'cooked shrimp': 'shrimp',
    'pork tenderloin': 'pork', 'firm tofu': 'tofu', 'scrambled eggs': 'eggs',
    'hard-boiled egg': 'eggs', 'rolled oats': 'oats', 'steel-cut oats': 'oats',
    'brown rice': 'rice', 'jasmine rice': 'rice', 'basmati rice': 'rice',
    'sushi rice': 'rice', 'arborio rice': 'rice', 'whole wheat pasta': 'pasta',
    'egg noodles': 'pasta', 'ditalini pasta': 'pasta', 'whole grain bread': 'bread',
    'whole wheat bread': 'bread', 'whole wheat bagel': 'bread', 'whole wheat tortilla': 'tortilla',
    'flour tortilla': 'tortilla', 'flour tortillas': 'tortilla', 'corn tortillas': 'tortilla',
    'corn tortilla': 'tortilla', 'bell peppers': 'bell pepper',
    'cherry tomatoes': 'cherry tomato', 'grape tomatoes': 'cherry tomato',
    'crushed tomatoes': 'tomato', 'peach slices': 'peach',
    'mixed berries': 'berries', 'mixed greens': 'greens', 'romaine lettuce': 'greens',
    'baby spinach': 'spinach', 'greek yogurt': 'yogurt', 'cottage cheese': 'cheese',
    'feta cheese': 'feta', 'fresh mozzarella': 'mozzarella', 'mozzarella balls': 'mozzarella',
    'mozzarella pearls': 'mozzarella', 'cheddar cheese': 'cheese', 'pepper jack cheese': 'cheese',
    'parmesan': 'cheese', 'cream cheese': 'cheese', 'ricotta cheese': 'ricotta',
    'jumbo pasta shells': 'pasta shells', 'poached egg': 'eggs', 'fried egg': 'eggs',
    'endive leaves': 'endive',
    'black beans': 'beans', 'cannellini beans': 'beans', 'chickpeas': 'chickpeas',
    'almond milk': 'milk', 'coconut milk': 'milk', 'vegetable broth': 'broth',
    'chicken broth': 'broth', 'olive oil': 'oil', 'peanut butter': 'nut butter',
    'almond butter': 'nut butter', 'red onion': 'onion', 'sweet potato': 'potato',
    'red lentils': 'lentils', 'kidney beans': 'beans', 'deli ham': 'ham', 'potatoes': 'potato',
  };

  const CATEGORY_RULES = [
    { id: 'protein', match: /chicken|turkey|beef|steak|salmon|fish|tuna|shrimp|pork|tofu|sausage|ham|bacon|egg/i, maxMeals: 4, idealMin: 2, idealMax: 3 },
    { id: 'produce', match: /broccoli|spinach|pepper|zucchini|asparagus|kale|carrot|celery|onion|tomato|cucumber|lettuce|greens|berry|apple|banana|mango|lemon|lime|avocado|potato|mushroom|sprout/i, maxMeals: 5, idealMin: 2, idealMax: 4 },
    { id: 'staple', match: /rice|oats|quinoa|pasta|tortilla|bread|oil|garlic|yogurt|milk|beans|chickpea|hummus|oats|granola|honey|salsa|broth|sauce|seasoning|spice|nuts|seed/i, maxMeals: 6, idealMin: 3, idealMax: 5 },
    { id: 'dairy', match: /cheese|feta|mozzarella|butter|cream/i, maxMeals: 5, idealMin: 2, idealMax: 4 },
  ];

  const DEFAULT_RULE = { id: 'specialty', maxMeals: 2, idealMin: 1, idealMax: 1 };

  const SCORE_WEIGHTS = {
    balanced: { reuse: 12, idealReuse: 8, shared2: 5, newIng: 3, overuse: 50, recipeRepeat: 25, maxRecipeWeek: 2 },
    'high-protein': { reuse: 10, idealReuse: 6, shared2: 4, newIng: 3, overuse: 50, recipeRepeat: 25, maxRecipeWeek: 2 },
    quick: { reuse: 10, idealReuse: 6, shared2: 4, newIng: 4, overuse: 45, recipeRepeat: 20, maxRecipeWeek: 2 },
    'meal-prep': { reuse: 18, idealReuse: 12, shared2: 8, newIng: 2, overuse: 55, recipeRepeat: 30, maxRecipeWeek: 3 },
    vegetarian: { reuse: 14, idealReuse: 10, shared2: 6, newIng: 2, overuse: 50, recipeRepeat: 25, maxRecipeWeek: 2 },
    'low-carb': { reuse: 10, idealReuse: 6, shared2: 4, newIng: 4, overuse: 45, recipeRepeat: 25, maxRecipeWeek: 2 },
    'smart-shop': { reuse: 22, idealReuse: 15, shared2: 10, newIng: 6, overuse: 70, recipeRepeat: 35, maxRecipeWeek: 2 },
  };

  function normalizeIngredient(name) {
    const key = String(name || '').toLowerCase().replace(/[^a-z0-9\s]/g, '').trim();
    if (INGREDIENT_ALIASES[key]) return INGREDIENT_ALIASES[key];
    for (const [alias, canon] of Object.entries(INGREDIENT_ALIASES)) {
      if (key.includes(alias) || alias.includes(key)) return canon;
    }
    const words = key.split(/\s+/).filter(Boolean);
    return words.length > 2 ? words.slice(-2).join(' ') : key;
  }

  const REUSE_PRESETS = {
    'more-reuse': { reuseMult: 2.2, idealReuseMult: 1.8, shared2Mult: 2, newIngMult: 2.8, varietyBonus: 0, uniqueIngBonus: 0 },
    balanced: { reuseMult: 1, idealReuseMult: 1, shared2Mult: 1, newIngMult: 1, varietyBonus: 0, uniqueIngBonus: 0 },
    'more-variety': { reuseMult: 0.35, idealReuseMult: 0.4, shared2Mult: 0.25, newIngMult: 0.25, varietyBonus: 12, uniqueIngBonus: 8 },
  };

  function getIngredientRule(name, reusePreference) {
    let rule = DEFAULT_RULE;
    const key = normalizeIngredient(name);
    for (const cat of CATEGORY_RULES) {
      if (cat.match.test(key) || cat.match.test(name)) { rule = cat; break; }
    }
    if (reusePreference === 'more-reuse') {
      return { ...rule, maxMeals: rule.maxMeals + 2, idealMin: rule.idealMin + 1, idealMax: rule.idealMax + 2 };
    }
    if (reusePreference === 'more-variety') {
      return { ...rule, maxMeals: Math.max(2, rule.maxMeals - 2), idealMin: 1, idealMax: 1 };
    }
    return { ...rule };
  }

  function applyReusePreference(weights, reusePreference) {
    const preset = REUSE_PRESETS[reusePreference] || REUSE_PRESETS.balanced;
    return {
      ...weights,
      reuse: weights.reuse * preset.reuseMult,
      idealReuse: weights.idealReuse * preset.idealReuseMult,
      shared2: weights.shared2 * preset.shared2Mult,
      newIng: weights.newIng * preset.newIngMult,
      varietyBonus: preset.varietyBonus,
      uniqueIngBonus: preset.uniqueIngBonus,
    };
  }

  function createContext(style, reusePreference) {
    const base = SCORE_WEIGHTS[style] || SCORE_WEIGHTS.balanced;
    const pref = reusePreference || 'balanced';
    return {
      pantry: {},
      recipeCounts: {},
      recentRecipeIds: [],
      style: style || 'balanced',
      reusePreference: pref,
      weights: applyReusePreference(base, pref),
    };
  }

  function getPantryEntry(pantry, name) {
    const key = normalizeIngredient(name);
    if (!pantry[key]) {
      pantry[key] = { key, displayName: name, meals: 0, recipes: new Set() };
    }
    return pantry[key];
  }

  function addRecipeToContext(ctx, recipe) {
    if (!recipe) return;
    ctx.recipeCounts[recipe.id] = (ctx.recipeCounts[recipe.id] || 0) + 1;
    (recipe.ingredients || []).forEach((ing) => {
      const entry = getPantryEntry(ctx.pantry, ing.name);
      entry.meals += 1;
      entry.recipes.add(recipe.id);
    });
  }

  function scoreRecipe(recipe, targetCal, ctx) {
    const w = ctx.weights;
    let score = 100 - Math.min(35, Math.abs(recipe.calories - targetCal) / 8);

    if (ctx.recentRecipeIds.includes(recipe.id)) score -= w.recipeRepeat;
    const weekCount = ctx.recipeCounts[recipe.id] || 0;
    if (weekCount >= w.maxRecipeWeek) score -= 60;
    else if (weekCount === w.maxRecipeWeek - 1) score -= 20;

    const ings = recipe.ingredients || [];
    let shared = 0;

    ings.forEach((ing) => {
      const key = normalizeIngredient(ing.name);
      const entry = ctx.pantry[key];
      const rule = getIngredientRule(ing.name, ctx.reusePreference);
      const current = entry?.meals || 0;
      const next = current + 1;

      if (current > 0) {
        shared += 1;
        if (next <= rule.maxMeals) score += w.reuse;
        if (next >= rule.idealMin && next <= rule.idealMax) score += w.idealReuse;
      } else {
        score -= w.newIng;
        if (w.uniqueIngBonus) score += w.uniqueIngBonus;
      }

      if (next > rule.maxMeals) score -= w.overuse;
      else if (next === rule.maxMeals) score -= w.overuse * 0.25;
    });

    if (shared >= 2) score += shared * w.shared2;
    if (shared >= 4) score += w.shared2 * 2;

    if (w.varietyBonus && shared === 0 && ings.length >= 4) score += w.varietyBonus;

    if (Object.keys(ctx.pantry).length === 0 && ctx.reusePreference === 'more-reuse') {
      score -= ings.length * 0.3;
    } else if (Object.keys(ctx.pantry).length === 0) {
      score -= ings.length * 0.5;
    }

    return score;
  }

  function pickRecipe(pool, targetCal, ctx) {
    if (!pool.length) return null;
    let candidates = pool.filter((r) => !ctx.recentRecipeIds.slice(-2).includes(r.id));
    if (!candidates.length) candidates = pool.filter((r) => (ctx.recipeCounts[r.id] || 0) < ctx.weights.maxRecipeWeek);
    if (!candidates.length) candidates = pool;

    const scored = candidates.map((r) => ({ recipe: r, score: scoreRecipe(r, targetCal, ctx) }));
    scored.sort((a, b) => b.score - a.score);

    const top = scored.slice(0, Math.min(4, scored.length));
    if (!top.length) return null;
    return top[Math.floor(Math.random() * top.length)].recipe;
  }

  function seedContextFromPlan(ctx, dates, mealTypes, getSlotRecipe) {
    dates.forEach((date) => {
      mealTypes.forEach((meal) => {
        const recipe = getSlotRecipe(date, meal);
        if (recipe) addRecipeToContext(ctx, recipe);
      });
    });
  }

  function analyzeWeek(dates, mealTypes, getSlotRecipe, reusePreference) {
    const pref = reusePreference || 'balanced';
    const pantry = {};
    const recipeCounts = {};
    let mealCount = 0;
    let totalIngredientUses = 0;

    dates.forEach((date) => {
      mealTypes.forEach((meal) => {
        const recipe = getSlotRecipe(date, meal);
        if (!recipe) return;
        mealCount += 1;
        recipeCounts[recipe.id] = (recipeCounts[recipe.id] || 0) + 1;
        (recipe.ingredients || []).forEach((ing) => {
          totalIngredientUses += 1;
          const entry = getPantryEntry(pantry, ing.name);
          entry.meals += 1;
          entry.recipes.add(recipe.name);
        });
      });
    });

    const ingredients = Object.values(pantry).map((e) => {
      const rule = getIngredientRule(e.displayName, pref);
      const status = e.meals > rule.maxMeals ? 'overused' : e.meals >= rule.idealMin ? 'ideal' : e.meals >= 2 ? 'reused' : 'single';
      return {
        key: e.key,
        name: e.displayName,
        meals: e.meals,
        recipes: [...e.recipes],
        maxMeals: rule.maxMeals,
        status,
      };
    }).sort((a, b) => b.meals - a.meals);

    const uniqueIngredients = ingredients.length;
    const reusedCount = ingredients.filter((i) => i.meals >= 2).length;
    const overused = ingredients.filter((i) => i.status === 'overused');
    const sharedStaples = ingredients.filter((i) => i.meals >= 2 && i.status !== 'overused');
    const efficiency = totalIngredientUses
      ? Math.round(Math.max(0, Math.min(100, (1 - uniqueIngredients / totalIngredientUses) * 100 + reusedCount * 2)))
      : 0;

    return {
      mealCount,
      uniqueIngredients,
      totalIngredientUses,
      reusedCount,
      efficiency,
      ingredients,
      overused,
      sharedStaples,
      recipeCounts,
    };
  }

  function aggregateGrocery(dates, mealTypes, getSlotRecipe, reusePreference) {
    const map = new Map();
    const analysis = analyzeWeek(dates, mealTypes, getSlotRecipe, reusePreference);

    dates.forEach((date) => {
      mealTypes.forEach((meal) => {
        const recipe = getSlotRecipe(date, meal);
        if (!recipe) return;
        (recipe.ingredients || []).forEach((ing) => {
          const unit = (ing.unit || 'each').toLowerCase();
          const key = `${normalizeIngredient(ing.name)}|${unit}`;
          if (map.has(key)) {
            const existing = map.get(key);
            existing.quantity += ing.quantity;
            existing.mealUses += 1;
            if (!existing.recipes.includes(recipe.name)) existing.recipes.push(recipe.name);
          } else {
            const meta = analysis.ingredients.find((i) => i.key === key);
            map.set(key, {
              name: ing.name,
              quantity: ing.quantity,
              unit: ing.unit,
              mealUses: 1,
              recipes: [recipe.name],
              status: meta?.status || 'single',
              maxMeals: meta?.maxMeals || DEFAULT_RULE.maxMeals,
            });
          }
        });
      });
    });

    const items = [...map.values()].map((ing) => ({
      name: ing.name,
      quantity: Math.round(ing.quantity * 100) / 100,
      unit: ing.unit,
      mealUses: ing.mealUses,
      recipes: ing.recipes,
      isShared: ing.mealUses >= 2,
      status: ing.status,
      maxMeals: ing.maxMeals,
    }));

    items.sort((a, b) => {
      if (a.isShared !== b.isShared) return a.isShared ? -1 : 1;
      return b.mealUses - a.mealUses;
    });

    return { items, analysis };
  }

  return {
    normalizeIngredient,
    createContext,
    addRecipeToContext,
    seedContextFromPlan,
    pickRecipe,
    scoreRecipe,
    analyzeWeek,
    aggregateGrocery,
    getIngredientRule,
    REUSE_PRESETS,
  };
})();