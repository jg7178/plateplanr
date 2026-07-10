const APP_BRAND = {
  name: 'PlatePlanr',
  tagline: 'Plan your plate. Prep your week',
  shortTagline: 'Plan your plate. Prep your week',
};

const SAMPLE_RECIPES = [
  {
    id: 'r1',
    name: 'Overnight Oats',
    calories: 320,
    protein: 14,
    carbs: 48,
    fat: 9,
    servings: 1,
    prepTime: 10,
    tags: ['breakfast', 'meal-prep'],
    ingredients: [
      { name: 'Rolled oats', quantity: 0.5, unit: 'cup' },
      { name: 'Greek yogurt', quantity: 0.5, unit: 'cup' },
      { name: 'Almond milk', quantity: 0.75, unit: 'cup' },
      { name: 'Chia seeds', quantity: 1, unit: 'tbsp' },
      { name: 'Blueberries', quantity: 0.5, unit: 'cup' },
      { name: 'Honey', quantity: 1, unit: 'tbsp' },
    ],
    instructions: 'Mix oats, yogurt, milk, and chia in a jar. Refrigerate overnight. Top with blueberries and honey.',
  },
  {
    id: 'r2',
    name: 'Grilled Chicken & Rice Bowl',
    calories: 485,
    protein: 42,
    carbs: 52,
    fat: 10,
    servings: 1,
    prepTime: 35,
    tags: ['lunch', 'dinner', 'high-protein', 'meal-prep'],
    ingredients: [
      { name: 'Chicken breast', quantity: 6, unit: 'oz' },
      { name: 'Brown rice', quantity: 1, unit: 'cup' },
      { name: 'Broccoli', quantity: 1, unit: 'cup' },
      { name: 'Olive oil', quantity: 1, unit: 'tbsp' },
      { name: 'Garlic', quantity: 2, unit: 'cloves' },
      { name: 'Lemon', quantity: 0.5, unit: 'each' },
    ],
    instructions: 'Season and grill chicken. Cook rice. Steam broccoli. Assemble bowl with lemon squeeze.',
  },
  {
    id: 'r3',
    name: 'Turkey & Veggie Wrap',
    calories: 380,
    protein: 28,
    carbs: 36,
    fat: 14,
    servings: 1,
    prepTime: 15,
    tags: ['lunch', 'quick'],
    ingredients: [
      { name: 'Whole wheat tortilla', quantity: 1, unit: 'each' },
      { name: 'Sliced turkey', quantity: 4, unit: 'oz' },
      { name: 'Spinach', quantity: 1, unit: 'cup' },
      { name: 'Hummus', quantity: 2, unit: 'tbsp' },
      { name: 'Bell pepper', quantity: 0.5, unit: 'each' },
      { name: 'Cucumber', quantity: 0.25, unit: 'each' },
    ],
    instructions: 'Spread hummus on tortilla. Layer turkey, veggies, and spinach. Roll tightly and slice.',
  },
  {
    id: 'r4',
    name: 'Salmon with Quinoa',
    calories: 520,
    protein: 38,
    carbs: 40,
    fat: 22,
    servings: 1,
    prepTime: 30,
    tags: ['dinner', 'high-protein', 'low-carb'],
    ingredients: [
      { name: 'Salmon fillet', quantity: 5, unit: 'oz' },
      { name: 'Quinoa', quantity: 0.75, unit: 'cup' },
      { name: 'Asparagus', quantity: 8, unit: 'spears' },
      { name: 'Olive oil', quantity: 1, unit: 'tbsp' },
      { name: 'Dill', quantity: 1, unit: 'tsp' },
      { name: 'Lemon', quantity: 0.5, unit: 'each' },
    ],
    instructions: 'Bake salmon at 400°F for 15 min. Cook quinoa. Roast asparagus. Plate with dill and lemon.',
  },
  {
    id: 'r5',
    name: 'Greek Yogurt Parfait',
    calories: 245,
    protein: 18,
    carbs: 32,
    fat: 5,
    servings: 1,
    prepTime: 5,
    tags: ['breakfast', 'snack', 'quick'],
    ingredients: [
      { name: 'Greek yogurt', quantity: 1, unit: 'cup' },
      { name: 'Granola', quantity: 0.25, unit: 'cup' },
      { name: 'Strawberries', quantity: 0.5, unit: 'cup' },
      { name: 'Honey', quantity: 1, unit: 'tsp' },
    ],
    instructions: 'Layer yogurt, granola, and berries in a glass. Drizzle with honey.',
  },
  {
    id: 'r6',
    name: 'Lentil Soup (Batch)',
    calories: 290,
    protein: 16,
    carbs: 44,
    fat: 6,
    servings: 4,
    prepTime: 45,
    tags: ['lunch', 'dinner', 'meal-prep'],
    ingredients: [
      { name: 'Red lentils', quantity: 1.5, unit: 'cup' },
      { name: 'Carrots', quantity: 2, unit: 'each' },
      { name: 'Celery', quantity: 2, unit: 'stalks' },
      { name: 'Onion', quantity: 1, unit: 'each' },
      { name: 'Vegetable broth', quantity: 6, unit: 'cup' },
      { name: 'Cumin', quantity: 1, unit: 'tsp' },
      { name: 'Spinach', quantity: 2, unit: 'cup' },
    ],
    instructions: 'Sauté onion, carrot, celery. Add lentils, broth, cumin. Simmer 30 min. Stir in spinach.',
  },
  {
    id: 'r7',
    name: 'Egg White Veggie Scramble',
    calories: 210,
    protein: 24,
    carbs: 12,
    fat: 8,
    servings: 1,
    prepTime: 12,
    tags: ['breakfast', 'high-protein'],
    ingredients: [
      { name: 'Egg whites', quantity: 4, unit: 'each' },
      { name: 'Whole egg', quantity: 1, unit: 'each' },
      { name: 'Mushrooms', quantity: 0.5, unit: 'cup' },
      { name: 'Cherry tomatoes', quantity: 0.5, unit: 'cup' },
      { name: 'Spinach', quantity: 1, unit: 'cup' },
      { name: 'Feta cheese', quantity: 1, unit: 'oz' },
    ],
    instructions: 'Sauté veggies, add eggs, scramble until set. Top with feta.',
  },
  {
    id: 'r8',
    name: 'Protein Smoothie',
    calories: 310,
    protein: 30,
    carbs: 35,
    fat: 7,
    servings: 1,
    prepTime: 5,
    tags: ['breakfast', 'snack', 'quick'],
    ingredients: [
      { name: 'Protein powder', quantity: 1, unit: 'scoop' },
      { name: 'Banana', quantity: 1, unit: 'each' },
      { name: 'Almond milk', quantity: 1, unit: 'cup' },
      { name: 'Peanut butter', quantity: 1, unit: 'tbsp' },
      { name: 'Ice', quantity: 0.5, unit: 'cup' },
    ],
    instructions: 'Blend all ingredients until smooth. Serve immediately.',
  },
];

// Merge extended catalog (recipes-catalog.js)
if (typeof EXTRA_RECIPES !== 'undefined') {
  const existingIds = new Set(SAMPLE_RECIPES.map((r) => r.id));
  EXTRA_RECIPES.forEach((r) => { if (!existingIds.has(r.id)) SAMPLE_RECIPES.push(r); });
}

const MEAL_TYPES = ['breakfast', 'lunch', 'dinner', 'snack'];

const MEAL_CALORIE_SPLIT = { breakfast: 0.25, lunch: 0.35, dinner: 0.30, snack: 0.10 };

const MEAL_EATING_TIMES = {
  breakfast: { start: '07:00', end: '09:00', ideal: '07:30', label: '7:00 – 9:00 AM', tip: 'Eat within an hour of waking to fuel your morning' },
  lunch:     { start: '12:00', end: '13:30', ideal: '12:30', label: '12:00 – 1:30 PM', tip: 'Midday meal keeps energy steady through the afternoon' },
  snack:     { start: '15:00', end: '16:00', ideal: '15:30', label: '3:00 – 4:00 PM', tip: 'A light snack bridges lunch and dinner hunger' },
  dinner:    { start: '18:00', end: '20:00', ideal: '18:30', label: '6:00 – 8:00 PM', tip: 'Finish 2–3 hours before bed for better digestion and sleep' },
};

// Chronological order for schedule display
const MEAL_SCHEDULE_ORDER = ['breakfast', 'lunch', 'snack', 'dinner'];

const MEAL_PLAN_STYLES = [
  { id: 'smart-shop', name: 'Smart Shop', icon: 'fa-cart-shopping', desc: 'Reuse ingredients across the week — smaller grocery list' },
  { id: 'balanced', name: 'Everyday', icon: 'fa-scale-balanced', desc: 'Well-rounded variety matched to your calorie goal' },
  { id: 'high-protein', name: 'High Protein', icon: 'fa-dumbbell', desc: 'Extra protein for muscle and staying full' },
  { id: 'quick', name: 'Quick & Easy', icon: 'fa-bolt', desc: 'Fast meals — everything under 20 minutes' },
  { id: 'meal-prep', name: 'Batch Prep', icon: 'fa-box', desc: 'Cook once, eat all week — make-ahead friendly' },
  { id: 'vegetarian', name: 'Vegetarian', icon: 'fa-leaf', desc: 'Plant-forward meals, no meat' },
  { id: 'low-carb', name: 'Low Carb', icon: 'fa-chart-line', desc: 'Keeps carbs under 30g per meal' },
];

const GROCERY_STORES = [
  { id: 'auto', name: 'Nearest Kroger-family store', icon: 'fa-store', api: 'kroger' },
  { id: 'kroger', name: 'Kroger', icon: 'fa-cart-shopping', api: 'kroger' },
  { id: 'ralphs', name: 'Ralphs', icon: 'fa-cart-shopping', api: 'kroger' },
  { id: 'fredmeyer', name: 'Fred Meyer', icon: 'fa-cart-shopping', api: 'kroger' },
  { id: 'kingsoopers', name: 'King Soopers', icon: 'fa-cart-shopping', api: 'kroger' },
  { id: 'smiths', name: "Smith's", icon: 'fa-cart-shopping', api: 'kroger' },
  { id: 'frys', name: "Fry's", icon: 'fa-cart-shopping', api: 'kroger' },
  { id: 'walmart', name: 'Walmart', icon: 'fa-store', api: 'walmart' },
  { id: 'samsclub', name: "Sam's Club", icon: 'fa-warehouse', api: 'walmart' },
  { id: 'target', name: 'Target', icon: 'fa-bullseye', api: 'target' },
  { id: 'wholefoods', name: 'Whole Foods', icon: 'fa-leaf', api: 'openfoodfacts' },
  { id: 'amazonfresh', name: 'Amazon Fresh', icon: 'fa-box', api: 'openfoodfacts' },
  { id: 'costco', name: 'Costco', icon: 'fa-warehouse', api: 'openfoodfacts' },
  { id: 'safeway', name: 'Safeway', icon: 'fa-store', api: 'openfoodfacts' },
  { id: 'aldi', name: 'Aldi', icon: 'fa-tags', api: 'openfoodfacts' },
  { id: 'publix', name: 'Publix', icon: 'fa-store', api: 'openfoodfacts' },
  { id: 'heb', name: 'H-E-B', icon: 'fa-store', api: 'openfoodfacts' },
  { id: 'meijer', name: 'Meijer', icon: 'fa-store', api: 'openfoodfacts' },
  { id: 'sprouts', name: 'Sprouts', icon: 'fa-leaf', api: 'openfoodfacts' },
  { id: 'traderjoes', name: "Trader Joe's", icon: 'fa-store', api: 'openfoodfacts' },
  { id: 'instacart', name: 'Instacart (multi-store)', icon: 'fa-truck', api: 'openfoodfacts' },
];

const INGREDIENT_REUSE_MODES = [
  { id: 'more-reuse', label: 'More reuse', icon: 'fa-recycle', desc: 'Share staples — smaller grocery list' },
  { id: 'balanced', label: 'Balanced', icon: 'fa-scale-balanced', desc: 'Mix of shared ingredients & variety' },
  { id: 'more-variety', label: 'More variety', icon: 'fa-sparkles', desc: 'Unique ingredients — less repetition' },
];

const DEFAULT_SETTINGS = {
  calorieGoal: 2000,
  proteinGoal: 150,
  carbsGoal: 200,
  fatGoal: 65,
  name: 'My Plan',
  ingredientReuse: 'balanced',
  profile: {
    sex: 'female',
    age: 30,
    weightLbs: 160,
    heightFt: 5,
    heightIn: 6,
    activity: 'moderate',
    goalPreset: 'maintain',
  },
  family: {
    enabled: false,
    adults: 2,
    kids: 0,
    kidPortion: 0.65,
    preset: 'couple',
    members: [],
  },
  banList: {
    allergies: [],
    dislikes: [],
  },
  grocery: {
    zipCode: '',
    favoriteStore: 'auto',
    storeName: '',
    locationId: '',
    lastPriceUpdate: null,
    priceSource: null,
  },
};

const STORAGE_KEY = 'mealprep-app-v1'; // legacy fallback