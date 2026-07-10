// Convert recipe amounts → retail containers (pack, jar, bag, box, bunch, etc.)

const GroceryUnits = (() => {
  const PANTRY_AT_HOME = [/^ice$/i, /^water$/i];

  const COUNTABLE = new Set([
    'each', 'piece', 'pieces', 'slice', 'slices', 'link', 'links',
    'leaf', 'leaves', 'clove', 'cloves', 'stalk', 'stalks', 'strip', 'strips',
    'wedge', 'wedges', 'cracker', 'crackers', 'medium', 'large', 'portion',
  ]);

  const RETAIL_UNITS = new Set([
    'pack', 'dozen', 'loaf', 'box', 'bag', 'bottle', 'jar', 'can', 'bunch', 'head',
    'lb', 'lbs', 'carton', 'tub', 'block', 'bulb', 'pint', 'quart', 'gallon', 'container',
  ]);

  /** How stores sell items — used for labels and pricing */
  const CONTAINER_TYPES = {
    pack:    { label: 'Pack',    icon: 'fa-box',            bundled: true },
    jar:     { label: 'Jar',     icon: 'fa-jar',            bundled: true },
    bag:     { label: 'Bag',     icon: 'fa-bag-shopping',   bundled: true },
    box:     { label: 'Box',     icon: 'fa-box-open',       bundled: true },
    bunch:   { label: 'Bunch',   icon: 'fa-leaf',           bundled: true },
    bottle:  { label: 'Bottle',  icon: 'fa-bottle-water',   bundled: true },
    carton:  { label: 'Carton',  icon: 'fa-box',            bundled: true },
    tub:     { label: 'Tub',     icon: 'fa-bucket',         bundled: true },
    can:     { label: 'Can',     icon: 'fa-box',            bundled: true },
    loaf:    { label: 'Loaf',    icon: 'fa-bread-slice',    bundled: true },
    dozen:   { label: 'Dozen',   icon: 'fa-egg',            bundled: true },
    lb:      { label: 'Lb',      icon: 'fa-weight-hanging', bundled: true },
    block:   { label: 'Block',   icon: 'fa-cheese',         bundled: true },
    head:    { label: 'Head',    icon: 'fa-seedling',       bundled: true },
    pint:    { label: 'Pint',    icon: 'fa-basket-shopping', bundled: true },
    bulb:    { label: 'Bulb',    icon: 'fa-seedling',       bundled: true },
    each:    { label: 'Each',    icon: 'fa-apple-whole',    bundled: false },
  };

  const CUP_UNITS = new Set(['cup', 'cups']);
  const SPOON_UNITS = new Set(['tbsp', 'tsp', 'pinch']);

  const MEAT = /chicken|turkey|beef|steak|pork|salmon|shrimp|fish|fillet|cod|tuna|ham|bacon|sausage|ground|sirloin|flank|tenderloin|deli|smoked salmon|grilled chicken|cooked shrimp|white fish|chorizo|catfish|tilapia|jerky/i;
  const CHEESE = /cheese|feta|mozzarella|parmesan|cheddar|pepper jack|cream cheese|cottage|ricotta/i;
  const MOZZARELLA = /mozzarella/i;
  const OLIVES = /olives?|kalamata/i;
  const DRY_GRAIN = /rice|oats|quinoa|lentil|pasta|noodle|granola|arborio|basmati|jasmine|sushi|ditalini|egg noodle|steel-cut|rolled oats|couscous|polenta|grits/i;
  const CANNED_BEAN = /black beans|chickpeas|kidney beans|cannellini|edamame/i;
  const CANNED_OTHER = /crushed tomato|tomato sauce|marinara|salsa|canned tuna|curry paste|tikka|enchilada|teriyaki|pesto|artichoke heart/i;
  const BROTH = /broth|stock/i;
  const MILK_LIQ = /milk|almond milk|coconut milk|oat milk/i;
  const YOGURT = /yogurt/i;
  const GREENS = /spinach|kale|lettuce|romaine|mixed greens|arugula|greens/i;
  const BERRY = /berr|grapes?\b|strawberr|blueberr|peach slice|mango|cantaloupe/i;
  const PRODUCE_EACH = /lemon|lime|(?<!cherry |grape )tomato|cucumber|zucchini|avocado|apple|banana|carrot|celery|sweet potato|mango|peach|corn(?! tortilla)|cabbage|cauliflower|broccoli(?! sprouts)|eggplant|bok choy|squash/i;
  const BELL_PEPPER = /bell pepper/i;
  const SPICE = /spice|seasoning|powder|flakes|cumin|turmeric|cinnamon|dill|italian|fajita|curry powder|chili|bagel seasoning|nutritional yeast|red pepper flake|sesame seed|sea salt|capers|everything bagel|paprika|oregano|thyme|saffron|cajun/i;
  const SAUCE = /sauce|dressing|glaze|mustard|honey|maple|jam|tahini|hummus|ranch|soy sauce|balsamic|sesame dressing|lime crema|wine|vinegar|pesto|salsa|fish sauce|coconut aminos|bbq|alfredo|buffalo|miso|amino/i;
  const OIL_BUTTER = /olive oil|oil|butter|peanut butter|almond butter/i;
  const NUT_SEED = /almond|walnut|pecan|peanut|seed|chia|pumpkin|cranberr|raisin|chocolate chip|coconut flake|cashew|sunflower/i;
  const HERB_BUNCH = /basil|cilantro|parsley|chives|dill(?! pickle)/i;

  function normUnit(unit) {
    return (unit || 'each').toLowerCase();
  }

  function round2(n) {
    return Math.round(n * 100) / 100;
  }

  function plural(n, word) {
    return `${n} ${word}${n === 1 ? '' : 's'}`;
  }

  function unitsMatch(group, unit) {
    if (group === '*') return true;
    if (group === 'countable') return COUNTABLE.has(unit);
    if (group === 'cup') return CUP_UNITS.has(unit);
    if (group === 'spoon') return SPOON_UNITS.has(unit);
    if (group === 'slice') return unit === 'slice' || unit === 'slices';
    if (group === 'link') return unit === 'link' || unit === 'links';
    if (group === 'oz') return unit === 'oz';
    if (group === 'clove') return unit === 'clove' || unit === 'cloves';
    if (group === 'stalk') return unit === 'stalk' || unit === 'stalks';
    if (group === 'spear') return unit === 'spears';
    if (group === 'scoop') return unit === 'scoop' || unit === 'scoops';
    if (group === 'leaves') return unit === 'leaf' || unit === 'leaves';
    if (group === 'can') return unit === 'can';
    if (group === 'pack') return unit === 'pack';
    return group === unit;
  }

  function build(item, conv) {
    const container = conv.container || conv.unit;
    return {
      ...item,
      neededQuantity: round2(item.quantity || 1),
      neededUnit: item.unit,
      quantity: conv.quantity,
      unit: conv.unit,
      retailContainer: container,
      packSize: conv.packSize,
      pricePerPack: conv.pricePerPack !== false,
      purchaseLabel: conv.purchaseLabel,
      searchName: conv.searchName || item.name,
    };
  }

  function packLabel(container, packs, size, sizeLabel) {
    const c = container === 'box' && packs > 1 ? 'boxes' : plural(packs, container);
    return sizeLabel ? `${c} (${sizeLabel})` : c;
  }

  function fromContainer(item, { container, size, sizeLabel, searchName, pricePerPack, fixed, label }) {
    const qty = item.quantity || 1;
    if (fixed) {
      return build(item, {
        quantity: 1,
        unit: container,
        container,
        packSize: size || 1,
        pricePerPack: pricePerPack !== false,
        purchaseLabel: label || `1 ${container}`,
        searchName: searchName || item.name,
      });
    }
    const packs = Math.max(1, Math.ceil(qty / (size || 1)));
    return build(item, {
      quantity: packs,
      unit: container,
      container,
      packSize: size,
      pricePerPack: pricePerPack !== false,
      purchaseLabel: label || packLabel(container, packs, size, sizeLabel),
      searchName: searchName || item.name,
    });
  }

  // ── Special converters (threshold / multi-form items) ──

  const Special = {
    passRetail(item, buyUnit) {
      const qty = Math.max(1, Math.ceil(item.quantity || 1));
      return build(item, {
        quantity: qty,
        unit: buyUnit,
        container: buyUnit,
        packSize: 1,
        pricePerPack: true,
        purchaseLabel: plural(qty, buyUnit),
      });
    },

    onion(item) {
      const count = Math.max(1, Math.ceil(item.quantity || 1));
      if (count >= 3) {
        const bags = Math.max(1, Math.ceil(count / 6));
        return build(item, {
          quantity: bags,
          unit: 'bag',
          container: 'bag',
          packSize: 6,
          pricePerPack: true,
          purchaseLabel: `${bags} bag${bags > 1 ? 's' : ''} (3 lb, ~6 ct)`,
          searchName: 'yellow onions 3 lb bag',
        });
      }
      return build(item, {
        quantity: count,
        unit: 'each',
        container: 'each',
        pricePerPack: false,
        purchaseLabel: plural(count, 'each'),
        searchName: count === 1 ? 'yellow onion' : 'yellow onions',
      });
    },

    bellPepper(item) {
      const count = Math.max(1, Math.ceil(item.quantity || 1));
      if (count >= 2) {
        const packs = Math.max(1, Math.ceil(count / 3));
        return build(item, {
          quantity: packs,
          unit: 'pack',
          container: 'pack',
          packSize: 3,
          pricePerPack: true,
          purchaseLabel: `${packs} pack${packs > 1 ? 's' : ''} (3 ct)`,
          searchName: 'bell peppers 3 pack',
        });
      }
      return build(item, {
        quantity: count,
        unit: 'each',
        container: 'each',
        pricePerPack: false,
        purchaseLabel: plural(count, 'each'),
        searchName: 'bell pepper',
      });
    },

    potato(item) {
      const raw = item.quantity || 1;
      const u = normUnit(item.unit);
      const count = CUP_UNITS.has(u) ? Math.ceil(raw / 2) : Math.ceil(raw);
      if (count < 4) {
        return fromContainer(item, { container: 'each', size: 1, pricePerPack: false, fixed: false });
      }
      const bags = Math.max(1, Math.ceil(count / 5));
      return build(item, {
        quantity: bags,
        unit: 'bag',
        container: 'bag',
        packSize: 5,
        pricePerPack: true,
        purchaseLabel: `${bags} bag${bags > 1 ? 's' : ''} (5 lb)`,
        searchName: 'potatoes 5 lb bag',
      });
    },

    meatLb(item) {
      const oz = item.quantity || 1;
      const lbs = Math.max(1, Math.ceil(oz / 16));
      return build(item, {
        quantity: lbs,
        unit: 'lb',
        container: 'lb',
        packSize: 16,
        pricePerPack: true,
        purchaseLabel: plural(lbs, 'lb'),
        searchName: `${item.name} fresh`,
      });
    },

    cheeseBlock(item, opts = {}) {
      const oz = item.quantity || 1;
      const blocks = Math.max(1, Math.ceil(oz / 8));
      const name = (item.name || '').toLowerCase();
      let searchName = opts.searchName || item.searchName;
      if (!searchName) {
        if (/mozzarella/i.test(name)) searchName = 'fresh mozzarella block 8 oz';
        else if (/feta/i.test(name)) searchName = 'feta cheese';
        else if (/cream cheese/i.test(name)) searchName = 'cream cheese';
        else if (/cheddar|pepper jack/i.test(name)) searchName = 'cheddar cheese';
        else searchName = item.name;
      }
      let purchaseLabel = `${blocks} block${blocks > 1 ? 's' : ''} (8 oz)`;
      if (/mozzarella/i.test(name)) {
        purchaseLabel = `${blocks} block${blocks > 1 ? 's' : ''} (8 oz) — cube or scoop for balls`;
      }
      return build(item, {
        quantity: blocks,
        unit: 'block',
        container: 'block',
        packSize: 8,
        pricePerPack: true,
        purchaseLabel: opts.purchaseLabel || purchaseLabel,
        searchName,
      });
    },

    /** Fresh mozzarella — sold as blocks; recipe "balls" are portioned from the block */
    mozzarella(item) {
      const u = normUnit(item.unit);
      let oz = item.quantity || 1;
      if (COUNTABLE.has(u)) {
        oz = Math.max(1, Math.ceil(item.quantity || 1));
      }
      return Special.cheeseBlock({ ...item, quantity: oz, unit: 'oz' });
    },

    eggs(item) {
      const count = item.quantity || 1;
      const dozens = Math.max(1, Math.ceil(count / 12));
      return build(item, {
        quantity: dozens,
        unit: 'dozen',
        container: 'dozen',
        packSize: 12,
        pricePerPack: true,
        purchaseLabel: plural(dozens, 'dozen'),
        searchName: `${item.name} dozen`,
      });
    },

    sauceJarCups(name) {
      if (/hummus/i.test(name)) return 2;
      if (/salsa/i.test(name)) return 2;
      return 3;
    },
  };

  /**
   * Retail container rules — first match wins.
   * container: pack | jar | bag | box | bunch | bottle | carton | tub | can | loaf | dozen | lb | block | head | pint | each
   */
  const RETAIL_RULES = [
    // ── PACKS (multi-count wrapped items) ──
    { match: /tortilla/i, units: 'countable', container: 'pack', size: 10, sizeLabel: '10 ct', searchName: (n) => `${n} 10 count` },
    { match: /bagel/i, units: 'countable', container: 'pack', size: 6, sizeLabel: '6 ct', searchName: (n) => `${n} 6 count` },
    { match: /pita|naan|flatbread/i, units: 'countable', container: 'pack', size: 6, sizeLabel: '6 ct' },
    { match: /\b(roll|bun|ciabatta|baguette)\b/i, units: 'countable', container: 'pack', size: 4, sizeLabel: '4 ct' },
    { match: /cracker/i, units: 'countable', container: 'box', size: 24, sizeLabel: '24 ct', searchName: (n) => `${n} box` },
    { match: /rice cake/i, units: 'countable', container: 'pack', size: 12, sizeLabel: '12 ct' },
    { match: /bacon/i, units: 'slice', container: 'pack', size: 12, sizeLabel: '12 oz', searchName: () => 'bacon 12 oz' },
    { match: /sausage/i, units: 'link', container: 'pack', size: 5, sizeLabel: '5 links' },
    { match: /tofu/i, units: 'oz', container: 'pack', size: 14, sizeLabel: '14 oz' },
    { match: /deli|sliced turkey|sliced ham|smoked salmon/i, units: 'oz', container: 'pack', size: 8, sizeLabel: '8 oz' },

    // ── LOAF / DOZEN ──
    { match: /\bbread\b/i, exclude: /crumb|crouton/i, units: 'slice', container: 'loaf', size: 20, searchName: (n) => `${n} loaf` },
    { match: /\bbread\b/i, exclude: /crumb|crouton/i, units: 'countable', container: 'loaf', size: 20, searchName: (n) => `${n} loaf` },
    { match: /\b(eggs?|scrambled eggs|hard-boiled egg|whole egg)\b/i, exclude: /egg white|egg noodle|eggplant/i, units: 'countable', handler: (i) => Special.eggs(i) },
    { match: /egg white/i, units: 'countable', container: 'carton', size: 16, sizeLabel: '16 oz', searchName: (n) => `${n} carton` },

    // ── LB / BLOCK (weight) ──
    { match: MOZZARELLA, units: 'oz', handler: (i) => Special.mozzarella(i) },
    { match: MOZZARELLA, units: 'countable', handler: (i) => Special.mozzarella(i) },
    { match: CHEESE, exclude: /mozzarella|ricotta|cottage/i, units: 'oz', handler: (i) => Special.cheeseBlock(i) },
    { match: /ricotta/i, units: 'cup', container: 'tub', size: 2, sizeLabel: '15 oz', searchName: () => 'ricotta cheese tub' },
    { match: /ricotta/i, units: 'oz', container: 'tub', size: 15, sizeLabel: '15 oz', searchName: () => 'ricotta cheese tub' },
    { match: MEAT, units: 'oz', handler: (i) => Special.meatLb(i) },

    // ── JAR (olives — sold by jar, not individual) ──
    { match: OLIVES, exclude: /olive oil|oil/i, units: 'countable', container: 'jar', size: 15, sizeLabel: '10 oz jar (~15 ct)', searchName: () => 'kalamata olives' },

    // ── PINT / CLAMSHELL (cherry & grape tomatoes — sold in containers, not singles) ──
    { match: /cherry tomato|grape tomato/i, units: 'cup', container: 'pint', size: 1.5, sizeLabel: 'pint clamshell (~10 oz)', searchName: () => 'cherry tomatoes pint' },
    { match: /cherry tomato|grape tomato/i, units: 'countable', container: 'pint', size: 12, sizeLabel: 'pint clamshell (~12 ct)', searchName: () => 'cherry tomatoes pint' },

    // ── BUNCH / HEAD (produce bundles) ──
    { match: HERB_BUNCH, units: 'cup', container: 'bunch', fixed: true, searchName: (n) => `fresh ${n} bunch` },
    { match: HERB_BUNCH, units: 'leaves', container: 'bunch', fixed: true, searchName: (n) => `fresh ${n} bunch` },
    { match: /garlic/i, units: 'clove', container: 'head', size: 10, sizeLabel: '~10 cloves' },
    { match: /celery/i, units: 'stalk', container: 'bunch', size: 8, sizeLabel: '8 stalks' },
    { match: /celery/i, units: 'countable', container: 'bunch', size: 8, sizeLabel: '8 stalks' },
    { match: /asparagus/i, units: 'spear', container: 'bunch', size: 12, sizeLabel: '12 spears' },
    { match: /basil/i, units: 'countable', container: 'bunch', fixed: true, searchName: () => 'fresh basil bunch' },
    // Belgian endive — sold as whole heads (~8 leaves per head), not loose leaves
    { match: /endive/i, units: 'countable', container: 'head', size: 8, sizeLabel: '~8 leaves per head', searchName: () => 'belgian endive' },
    { match: /endive/i, units: 'leaves', container: 'head', size: 8, sizeLabel: '~8 leaves per head', searchName: () => 'belgian endive' },
    { match: /endive/i, units: 'leaf', container: 'head', size: 8, sizeLabel: '~8 leaves per head', searchName: () => 'belgian endive' },

    // ── BAG (bulk / produce bags) ──
    { match: DRY_GRAIN, exclude: /pasta|noodle|ditalini/i, units: 'cup', container: 'bag', size: 2, sizeLabel: '1 lb', searchName: (n) => `${n} 1 lb bag` },
    { match: GREENS, units: 'cup', container: 'bag', size: 4, sizeLabel: '5 oz' },
    { match: GREENS, units: 'leaves', container: 'head', fixed: true, sizeLabel: '1 head', searchName: (n) => n },
    { match: /broccoli/i, exclude: /sprout/i, units: 'cup', container: 'each', size: 4, pricePerPack: false, searchName: () => 'broccoli' },
    { match: /carrot stick/i, units: 'cup', container: 'bag', size: 2, sizeLabel: '12 oz', searchName: () => 'carrots' },
    { match: /frozen/i, units: 'cup', container: 'bag', size: 3, sizeLabel: '12 oz' },
    { match: /crouton/i, units: 'cup', container: 'bag', size: 2 },
    { match: /mushroom/i, units: 'cup', container: 'pack', size: 2, sizeLabel: '8 oz', searchName: () => 'mushrooms 8 oz' },
    { match: /brussels sprout/i, units: 'cup', container: 'bag', size: 4, sizeLabel: '1 lb' },
    { match: /green beans/i, units: 'cup', container: 'bag', size: 3, sizeLabel: '12 oz' },
    { match: /\bpeas\b/i, exclude: /chickpea/i, units: 'cup', container: 'bag', size: 2, sizeLabel: '10 oz' },
    { match: /cabbage slaw|coleslaw/i, units: 'cup', container: 'bag', size: 3, sizeLabel: '12 oz' },
    { match: /dried apricot|dried cranberr/i, units: 'countable', container: 'bag', size: 12, sizeLabel: '6 oz' },
    { match: /potato/i, units: 'countable', handler: (i) => Special.potato(i) },
    { match: /potato/i, units: 'cup', handler: (i) => Special.potato(i) },
    { match: /^onion/i, exclude: /green onion|scallion|spring onion/i, units: 'countable', handler: (i) => Special.onion(i) },
    { match: BELL_PEPPER, units: 'countable', handler: (i) => Special.bellPepper(i) },
    { match: BELL_PEPPER, units: 'cup', handler: (i) => Special.bellPepper(i) },

    // ── BOX (dry boxed goods) ──
    { match: /pasta shell|jumbo shell|stuffing shell/i, units: 'countable', container: 'box', size: 12, sizeLabel: '12 ct', searchName: () => 'jumbo pasta shells' },
    { match: /pasta|noodle|ditalini|angel hair|ziti|orzo/i, units: 'cup', container: 'box', size: 4, sizeLabel: '1 lb' },
    { match: /pasta|ziti|orzo/i, units: 'oz', container: 'box', size: 16, sizeLabel: '1 lb' },
    { match: /granola/i, units: 'cup', container: 'box', size: 3, sizeLabel: '12 oz' },
    { match: /pizza dough/i, units: 'countable', container: 'pack', fixed: true, sizeLabel: '16 oz ball', searchName: () => 'pizza dough' },

    // ── CAN (canned goods) ──
    { match: CANNED_BEAN, units: 'cup', container: 'can', size: 1.5, sizeLabel: '15 oz' },
    { match: /crushed tomato/i, units: 'cup', container: 'can', size: 2, sizeLabel: '28 oz' },
    { match: /artichoke heart/i, units: 'cup', container: 'can', size: 1, sizeLabel: '14 oz' },
    { match: /\bcorn\b/i, exclude: /tortilla/i, units: 'cup', container: 'can', size: 1.5, sizeLabel: '15 oz' },

    // ── JAR (sauces, spices, spreads) ──
    { match: CANNED_OTHER, units: 'cup', handler: (i) => {
      const perJar = Special.sauceJarCups(i.name);
      const sizeLabel = perJar >= 3 ? '24 oz' : '16 oz';
      const search = /marinara|tomato sauce|pesto/i.test(i.name) ? `${i.name} jar 24 oz` : i.name;
      return fromContainer(i, { container: 'jar', size: perJar, sizeLabel, searchName: search });
    }},
    { match: /hummus/i, units: 'cup', container: 'jar', size: 2, sizeLabel: '10 oz' },
    { match: SPICE, units: 'spoon', container: 'jar', fixed: true },
    { match: /olive/i, exclude: /oil/i, units: 'countable', container: 'jar', size: 12, sizeLabel: '12 ct' },

    // ── CARTON (broth, milk) ──
    { match: BROTH, units: 'cup', container: 'carton', size: 4, sizeLabel: '32 oz' },
    { match: MILK_LIQ, units: 'cup', container: 'carton', size: 4, sizeLabel: '1 qt' },

    // ── TUB (dairy tubs) ──
    { match: YOGURT, units: 'cup', container: 'tub', size: 4, sizeLabel: '32 oz' },
    { match: /cottage/i, units: 'cup', container: 'tub', size: 2, sizeLabel: '16 oz' },
    { match: /protein powder|scoop/i, units: 'scoop', container: 'tub', size: 40, sizeLabel: '2 lb' },

    // ── BOTTLE (oils, condiments) ──
    { match: OIL_BUTTER, exclude: /peanut butter|almond butter/i, units: 'spoon', container: 'bottle', size: 32, sizeLabel: '16 oz' },
    { match: /peanut butter|almond butter|seed butter/i, units: 'spoon', container: 'jar', size: 24, sizeLabel: '16 oz' },
    { match: /butter/i, units: 'spoon', container: 'box', size: 32, sizeLabel: '1 lb' },
    { match: NUT_SEED, units: 'spoon', container: 'bag', size: 24, sizeLabel: '8 oz' },
    { match: SAUCE, units: 'spoon', container: 'bottle', size: 16, sizeLabel: '12 oz' },
    { match: /cheese|parmesan/i, units: 'spoon', handler: (i) => Special.cheeseBlock({ ...i, quantity: Math.max(2, (i.quantity || 1) * 0.5) }) },

    // ── PINT (berries) ──
    { match: BERRY, units: 'cup', container: 'pint', size: 1.5, sizeLabel: 'pint' },

    // ── EACH (single produce) ──
    { match: PRODUCE_EACH, units: 'cup', container: 'each', size: 3, pricePerPack: false },
    { match: PRODUCE_EACH, units: 'countable', container: 'each', size: 1, pricePerPack: false },
  ];

  function applyRule(item, rule) {
    if (rule.handler) return rule.handler(item);
    const searchName = typeof rule.searchName === 'function' ? rule.searchName(item.name) : rule.searchName;
    return fromContainer(item, {
      container: rule.container,
      size: rule.size,
      sizeLabel: rule.sizeLabel,
      searchName,
      pricePerPack: rule.pricePerPack,
      fixed: rule.fixed,
      label: rule.label,
    });
  }

  function resolve(item) {
    const name = item.name || '';
    const unit = normUnit(item.unit);

    if (unit === 'can') return Special.passRetail(item, 'can');
    if (unit === 'pack') return Special.passRetail(item, 'pack');

    for (const rule of RETAIL_RULES) {
      if (rule.exclude?.test(name)) continue;
      if (!rule.match.test(name)) continue;
      if (!unitsMatch(rule.units, unit)) continue;
      return applyRule(item, rule);
    }

    if (unit === 'oz') return Special.meatLb(item);

    if (CUP_UNITS.has(unit)) {
      return fromContainer(item, { container: 'each', size: 3, pricePerPack: false });
    }

    if (SPOON_UNITS.has(unit)) {
      return fromContainer(item, { container: 'bottle', size: 16, sizeLabel: '12 oz', fixed: false });
    }

    if (COUNTABLE.has(unit)) {
      const qty = Math.max(1, Math.ceil(item.quantity || 1));
      return build(item, {
        quantity: qty,
        unit: 'each',
        container: 'each',
        pricePerPack: false,
        purchaseLabel: plural(qty, 'each'),
      });
    }

    const qty = Math.max(1, Math.ceil(item.quantity || 1));
    return build(item, {
      quantity: qty,
      unit: unit || 'each',
      container: unit || 'each',
      pricePerPack: false,
      purchaseLabel: `${qty} ${unit}`,
    });
  }

  function isSoldByPack(unit) {
    return RETAIL_UNITS.has(normUnit(unit));
  }

  function isPantryAtHome(name) {
    return PANTRY_AT_HOME.some((re) => re.test((name || '').trim()));
  }

  function isGarnishSkip(item) {
    const u = normUnit(item.unit);
    if (!SPOON_UNITS.has(u)) return false;
    const q = item.quantity || 0;
    const name = item.name || '';
    if (SPICE.test(name) && !/green onion|scallion|cilantro|parsley|chives|dill/i.test(name)) return false;
    if (OIL_BUTTER.test(name)) return q < 8;
    if (SAUCE.test(name) && !/green onion|scallion|red onion|cilantro|parsley/i.test(name)) return q < 8;
    if (/green onion|scallion|red onion|cilantro|parsley|chives|dill|basil/i.test(name)) return q < 8;
    if (/cheese|parmesan/i.test(name)) return false;
    return q < 4;
  }

  function toRetailPurchase(item) {
    if (isPantryAtHome(item.name)) return null;
    if (isGarnishSkip(item)) return null;
    return resolve(item);
  }

  function getBillableQuantity(item) {
    if (item.pricePerPack || isSoldByPack(item.unit)) return item.quantity || 1;
    return item.quantity || 1;
  }

  function getContainerMeta(container) {
    return CONTAINER_TYPES[container] || { label: container, icon: 'fa-cart-shopping', bundled: true };
  }

  return {
    toRetailPurchase,
    isPantryAtHome,
    isSoldByPack,
    getBillableQuantity,
    getContainerMeta,
    CONTAINER_TYPES,
    RETAIL_UNITS,
  };
})();