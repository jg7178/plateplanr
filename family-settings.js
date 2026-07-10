// Household / family meal planning — scales groceries & recipes

const FamilySettings = (() => {
  const DEFAULT_FAMILY = {
    enabled: false,
    adults: 2,
    kids: 0,
    kidPortion: 0.65,
    preset: 'couple',
    members: [],
  };

  const PRESETS = [
    { id: 'solo', label: 'Just me', adults: 1, kids: 0, icon: 'fa-user' },
    { id: 'couple', label: 'Couple', adults: 2, kids: 0, icon: 'fa-user-group' },
    { id: 'family3', label: 'Family of 3', adults: 2, kids: 1, icon: 'fa-users' },
    { id: 'family4', label: 'Family of 4', adults: 2, kids: 2, icon: 'fa-users' },
    { id: 'family5', label: 'Family of 5', adults: 2, kids: 3, icon: 'fa-users' },
    { id: 'family6', label: 'Family of 6', adults: 4, kids: 2, icon: 'fa-users' },
    { id: 'custom', label: 'Custom', adults: 2, kids: 0, icon: 'fa-sliders' },
  ];

  const KID_PORTION_OPTIONS = [
    { value: 0.5, label: 'Half (young kids)' },
    { value: 0.65, label: 'Two-thirds (kids)' },
    { value: 0.75, label: 'Three-quarters (teens)' },
    { value: 1, label: 'Full (same as adult)' },
  ];

  function normalize(family) {
    return { ...DEFAULT_FAMILY, ...family };
  }

  function getMultiplier(family) {
    const f = normalize(family);
    if (!f.enabled) return 1;
    if (f.members?.length) {
      return f.members.reduce((sum, m) => sum + (Number(m.portion) || 1), 0);
    }
    const kidPortion = Number(f.kidPortion) || 0.65;
    const adults = Math.max(0, Number(f.adults) || 0);
    const kids = Math.max(0, Number(f.kids) || 0);
    return Math.max(1, adults + kids * kidPortion);
  }

  function getSummary(family) {
    const f = normalize(family);
    if (!f.enabled) return { multiplier: 1, label: 'Solo', detail: 'Cooking for 1' };
    const mult = getMultiplier(f);
    const preset = PRESETS.find((p) => p.id === f.preset);
    if (f.members?.length) {
      const names = f.members.map((m) => m.name || m.type).filter(Boolean);
      return {
        multiplier: mult,
        label: names.length ? names.join(', ') : 'Family',
        detail: `Cooking for ${formatServings(mult)}`,
      };
    }
    const parts = [];
    if (f.adults) parts.push(`${f.adults} adult${f.adults !== 1 ? 's' : ''}`);
    if (f.kids) parts.push(`${f.kids} kid${f.kids !== 1 ? 's' : ''}`);
    return {
      multiplier: mult,
      label: preset?.id !== 'custom' ? preset?.label : parts.join(' + ') || 'Family',
      detail: `Cooking for ${formatServings(mult)}`,
      adults: f.adults,
      kids: f.kids,
    };
  }

  function formatServings(n) {
    const rounded = Math.round(n * 10) / 10;
    return rounded % 1 === 0 ? String(rounded) : rounded.toFixed(1);
  }

  function scaleQuantity(qty, multiplier) {
    if (!multiplier || multiplier === 1) return qty;
    return Math.round(qty * multiplier * 100) / 100;
  }

  function scaleNutrition(recipe, multiplier) {
    if (!multiplier || multiplier === 1) return recipe;
    return {
      calories: Math.round(recipe.calories * multiplier),
      protein: Math.round(recipe.protein * multiplier),
      carbs: Math.round(recipe.carbs * multiplier),
      fat: Math.round(recipe.fat * multiplier),
    };
  }

  function readFromForm() {
    const enabled = document.getElementById('family-enabled')?.checked || false;
    const adults = Number(document.getElementById('family-adults')?.value) || 1;
    const kids = Number(document.getElementById('family-kids')?.value) || 0;
    const kidPortion = Number(document.getElementById('family-kid-portion')?.value) || 0.65;
    const preset = document.getElementById('family-preset')?.value || 'custom';
    const members = [];
    document.querySelectorAll('[data-family-member]').forEach((row) => {
      const name = row.querySelector('.family-member-name')?.value?.trim();
      const type = row.querySelector('.family-member-type')?.value || 'adult';
      const portion = type === 'kid'
        ? kidPortion
        : type === 'teen' ? 0.85 : 1;
      if (name) members.push({ id: row.dataset.familyMember, name, type, portion });
    });
    return { enabled, adults, kids, kidPortion, preset, members };
  }

  return {
    DEFAULT_FAMILY,
    PRESETS,
    KID_PORTION_OPTIONS,
    normalize,
    getMultiplier,
    getSummary,
    scaleQuantity,
    scaleNutrition,
    formatServings,
    readFromForm,
  };
})();