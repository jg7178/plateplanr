// Allergy & food dislike ban list — filters recipes and meal planning

const BanList = (() => {
  const DEFAULT_BAN_LIST = {
    allergies: [],
    dislikes: [],
  };

  const ALLERGY_SUGGESTIONS = [
    { id: 'peanuts', label: 'Peanuts', terms: ['peanut'] },
    { id: 'tree-nuts', label: 'Tree nuts', terms: ['almond', 'walnut', 'pecan', 'cashew', 'pistachio', 'hazelnut', 'macadamia', 'pine nut'] },
    { id: 'shellfish', label: 'Shellfish', terms: ['shrimp', 'crab', 'lobster', 'scallop', 'clam', 'mussel', 'oyster', 'crawfish'] },
    { id: 'fish', label: 'Fish', terms: ['salmon', 'tuna', 'cod', 'tilapia', 'sardine', 'anchovy', 'trout', 'halibut', 'fish'] },
    { id: 'dairy', label: 'Dairy', terms: ['milk', 'cheese', 'butter', 'cream', 'yogurt', 'whey', 'cottage cheese', 'mozzarella', 'feta', 'parmesan', 'cheddar', 'cream cheese'] },
    { id: 'eggs', label: 'Eggs', terms: ['egg'] },
    { id: 'soy', label: 'Soy', terms: ['soy', 'tofu', 'edamame', 'tempeh', 'miso'] },
    { id: 'wheat', label: 'Wheat / Gluten', terms: ['wheat', 'flour', 'bread', 'pasta', 'barley', 'rye', 'couscous', 'tortilla', 'bagel', 'bun', 'noodle', 'gluten'] },
    { id: 'sesame', label: 'Sesame', terms: ['sesame', 'tahini'] },
    { id: 'sulfites', label: 'Sulfites', terms: ['wine', 'dried fruit', 'sulfite'] },
  ];

  const DISLIKE_SUGGESTIONS = [
    { id: 'cilantro', label: 'Cilantro', terms: ['cilantro', 'coriander'] },
    { id: 'mushrooms', label: 'Mushrooms', terms: ['mushroom'] },
    { id: 'olives', label: 'Olives', terms: ['olive'] },
    { id: 'anchovies', label: 'Anchovies', terms: ['anchovy', 'anchovies'] },
    { id: 'blue-cheese', label: 'Blue cheese', terms: ['blue cheese', 'gorgonzola', 'roquefort'] },
    { id: 'liver', label: 'Liver', terms: ['liver'] },
    { id: 'brussels-sprouts', label: 'Brussels sprouts', terms: ['brussels sprout'] },
    { id: 'eggplant', label: 'Eggplant', terms: ['eggplant'] },
    { id: 'tofu', label: 'Tofu', terms: ['tofu'] },
    { id: 'spicy', label: 'Spicy food', terms: ['jalapeno', 'habanero', 'sriracha', 'cayenne', 'chili flake', 'hot sauce'] },
    { id: 'coconut', label: 'Coconut', terms: ['coconut'] },
    { id: 'beets', label: 'Beets', terms: ['beet'] },
  ];

  const CUSTOM_ALIASES = {
    gluten: ['wheat', 'flour', 'bread', 'pasta', 'barley', 'rye', 'couscous', 'gluten'],
    lactose: ['milk', 'cheese', 'butter', 'cream', 'yogurt', 'whey'],
    nuts: ['peanut', 'almond', 'walnut', 'pecan', 'cashew', 'pistachio', 'hazelnut', 'macadamia', 'pine nut'],
    seafood: ['shrimp', 'crab', 'lobster', 'scallop', 'clam', 'mussel', 'oyster', 'salmon', 'tuna', 'cod', 'fish'],
    pork: ['pork', 'bacon', 'ham', 'sausage'],
    'red meat': ['beef', 'steak', 'lamb', 'veal'],
    chicken: ['chicken'],
    turkey: ['turkey'],
  };

  function normalize(text) {
    return String(text || '').toLowerCase().replace(/[^a-z0-9\s]/g, ' ').replace(/\s+/g, ' ').trim();
  }

  function expandTerm(term) {
    const key = normalize(term);
    if (!key) return [];
    const suggestion = [...ALLERGY_SUGGESTIONS, ...DISLIKE_SUGGESTIONS]
      .find((s) => s.id === key || normalize(s.label) === key);
    if (suggestion) return suggestion.terms.map(normalize);
    if (CUSTOM_ALIASES[key]) return CUSTOM_ALIASES[key].map(normalize);
    return [key];
  }

  function textMatchesTerm(text, term) {
    const hay = normalize(text);
    if (!hay) return false;
    const needles = expandTerm(term);
    return needles.some((needle) => {
      if (!needle) return false;
      if (hay === needle) return true;
      if (hay.includes(needle)) return true;
      if (needle.includes(' ') && hay.includes(needle)) return true;
      const words = hay.split(' ');
      return words.some((w) => w === needle || w.startsWith(needle) || needle.startsWith(w));
    });
  }

  function normalizeList(banList) {
    const bl = { ...DEFAULT_BAN_LIST, ...banList };
    bl.allergies = [...new Set((bl.allergies || []).map((t) => String(t).trim()).filter(Boolean))];
    bl.dislikes = [...new Set((bl.dislikes || []).map((t) => String(t).trim()).filter(Boolean))];
    return bl;
  }

  function findMatches(recipe, banList) {
    const bl = normalizeList(banList);
    const matches = [];
    const fields = [];

    (recipe.ingredients || []).forEach((ing) => fields.push({ text: ing.name, source: 'ingredient' }));
    fields.push({ text: recipe.name, source: 'recipe' });
    (recipe.tags || []).forEach((tag) => fields.push({ text: tag, source: 'tag' }));
    if (recipe.instructions) fields.push({ text: recipe.instructions, source: 'instructions' });

    bl.allergies.forEach((term) => {
      fields.forEach(({ text, source }) => {
        if (textMatchesTerm(text, term)) {
          matches.push({ kind: 'allergy', term, text, source });
        }
      });
    });

    bl.dislikes.forEach((term) => {
      fields.forEach(({ text, source }) => {
        if (textMatchesTerm(text, term)) {
          matches.push({ kind: 'dislike', term, text, source });
        }
      });
    });

    const seen = new Set();
    return matches.filter((m) => {
      const key = `${m.kind}:${m.term}:${m.text}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  }

  function isRecipeBanned(recipe, banList) {
    return findMatches(recipe, banList).length > 0;
  }

  function filterRecipes(recipes, banList) {
    const bl = normalizeList(banList);
    if (!bl.allergies.length && !bl.dislikes.length) return recipes;
    return recipes.filter((r) => !isRecipeBanned(r, bl));
  }

  function countBanned(recipes, banList) {
    const bl = normalizeList(banList);
    if (!bl.allergies.length && !bl.dislikes.length) return 0;
    return recipes.filter((r) => isRecipeBanned(r, bl)).length;
  }

  function readFromForm() {
    const allergies = [...document.querySelectorAll('[data-ban-allergy]')]
      .map((el) => el.dataset.banAllergy?.trim())
      .filter(Boolean);
    const dislikes = [...document.querySelectorAll('[data-ban-dislike]')]
      .map((el) => el.dataset.banDislike?.trim())
      .filter(Boolean);
    return normalizeList({ allergies, dislikes });
  }

  function parseInput(value) {
    return value
      .split(/[,;]+/)
      .map((s) => s.trim())
      .filter(Boolean);
  }

  return {
    DEFAULT_BAN_LIST,
    ALLERGY_SUGGESTIONS,
    DISLIKE_SUGGESTIONS,
    normalize: normalizeList,
    expandTerm,
    findMatches,
    isRecipeBanned,
    filterRecipes,
    countBanned,
    readFromForm,
    parseInput,
  };
})();