// PlatePlanr — App Logic

const App = (() => {
  let state = defaultState();
  let activeView = 'dashboard';
  let homeCalorieLogOpen = false;
  let homeRecipeLibraryOpen = false;
  let homeLogDate = null;
  let weekOffset = 0;
  let selectedRecipeId = null;
  let recipeLibraryCategory = 'all';
  let pendingPhotoData = null;
  let authReady = false;
  let priceLoading = false;


  function defaultState() {
    return {
      recipes: [...SAMPLE_RECIPES],
      mealPlan: {},
      calorieLog: {},
      groceryList: [],
      settings: {
        ...DEFAULT_SETTINGS,
        grocery: { ...DEFAULT_SETTINGS.grocery },
        profile: { ...DEFAULT_SETTINGS.profile },
        family: { ...DEFAULT_SETTINGS.family },
        banList: { ...DEFAULT_SETTINGS.banList },
      },
    };
  }

  function getGrocerySettings() {
    if (!state.settings.grocery) state.settings.grocery = { ...DEFAULT_SETTINGS.grocery };
    return state.settings.grocery;
  }

  function loadState() {
    try {
      const key = typeof Auth !== 'undefined' ? Auth.getStorageKey() : STORAGE_KEY;
      const saved = localStorage.getItem(key);
      if (saved) return mergeNewRecipes(JSON.parse(saved));
      const legacy = localStorage.getItem(STORAGE_KEY);
      if (legacy) return mergeNewRecipes(JSON.parse(legacy));
    } catch (_) {}
    return defaultState();
  }

  function mergeNewRecipes(data) {
    const ids = new Set((data.recipes || []).map((r) => r.id));
    const merged = { ...defaultState(), ...data };
    merged.settings = { ...DEFAULT_SETTINGS, ...merged.settings };
    merged.settings.grocery = { ...DEFAULT_SETTINGS.grocery, ...merged.settings.grocery };
    merged.settings.profile = { ...DEFAULT_SETTINGS.profile, ...merged.settings.profile };
    merged.settings.family = { ...DEFAULT_SETTINGS.family, ...merged.settings.family };
    merged.settings.banList = { ...DEFAULT_SETTINGS.banList, ...merged.settings.banList };
    SAMPLE_RECIPES.forEach((r) => { if (!ids.has(r.id)) merged.recipes.push(r); });
    return merged;
  }

  function saveState() {
    const key = typeof Auth !== 'undefined' ? Auth.getStorageKey() : STORAGE_KEY;
    localStorage.setItem(key, JSON.stringify(state));
    if (typeof Auth !== 'undefined' && Auth.getSession()) {
      Auth.pushToCloud(state);
    }
  }

  function toLocalDateStr(date) {
    const y = date.getFullYear();
    const m = String(date.getMonth() + 1).padStart(2, '0');
    const d = String(date.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
  }

  function todayStr() {
    return toLocalDateStr(new Date());
  }

  function formatDate(date) {
    return toLocalDateStr(date);
  }

  function parseDate(str) {
    const [y, m, d] = str.split('-').map(Number);
    return new Date(y, m - 1, d);
  }

  function nowTimeStr() {
    const n = new Date();
    return `${String(n.getHours()).padStart(2, '0')}:${String(n.getMinutes()).padStart(2, '0')}`;
  }

  function formatTimeDisplay(hhmm) {
    if (!hhmm) return '';
    const [h, m] = hhmm.split(':').map(Number);
    const d = new Date();
    d.setHours(h, m, 0, 0);
    return d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
  }

  function formatLogTime(iso) {
    if (!iso) return '';
    return new Date(iso).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
  }

  function timeToMins(hhmm) {
    const [h, m] = hhmm.split(':').map(Number);
    return h * 60 + m;
  }

  function getSuggestedTime(mealType) {
    return MEAL_EATING_TIMES[mealType]?.ideal || '12:00';
  }

  function normalizeMealSlot(raw) {
    if (!raw) return null;
    if (typeof raw === 'string') return { recipeId: raw, time: null };
    return { recipeId: raw.recipeId, time: raw.time || null };
  }

  function getMealSlot(date, mealType) {
    const raw = getPlannedMeals(date)[mealType];
    if (!raw) return null;
    const slot = normalizeMealSlot(raw);
    if (!slot.time) slot.time = getSuggestedTime(mealType);
    return slot;
  }

  function getMealRecipeId(date, mealType) {
    return getMealSlot(date, mealType)?.recipeId || null;
  }

  function migrateMealPlanTimes() {
    let changed = false;
    Object.keys(state.mealPlan || {}).forEach((date) => {
      MEAL_TYPES.forEach((meal) => {
        const raw = state.mealPlan[date][meal];
        if (typeof raw === 'string') {
          state.mealPlan[date][meal] = { recipeId: raw, time: getSuggestedTime(meal) };
          changed = true;
        } else if (raw && !raw.time) {
          state.mealPlan[date][meal] = { ...raw, time: getSuggestedTime(meal) };
          changed = true;
        }
      });
    });
    return changed;
  }

  function getMealTimeStatus(date, mealType) {
    const slot = getMealSlot(date, mealType);
    if (!slot) return 'unplanned';
    if (date < todayStr()) return 'past';
    if (date > todayStr()) return 'future';
    const nowMins = timeToMins(nowTimeStr());
    const win = MEAL_EATING_TIMES[mealType];
    const start = timeToMins(win.start) - 30;
    const end = timeToMins(win.end) + 30;
    if (nowMins < start) return 'upcoming';
    if (nowMins <= end) return 'now';
    return 'missed';
  }

  function mealStatusClass(status) {
    return { upcoming: 'meal-upcoming', now: 'meal-now', missed: 'meal-missed', past: 'meal-past', future: 'meal-future', unplanned: '' }[status] || '';
  }

  function getNextMealSuggestion() {
    const today = todayStr();
    const nowMins = timeToMins(nowTimeStr());
    let best = null;

    MEAL_SCHEDULE_ORDER.forEach((meal) => {
      const slot = getMealSlot(today, meal);
      if (!slot) return;
      const recipe = getRecipe(slot.recipeId);
      if (!recipe) return;
      const diff = timeToMins(slot.time) - nowMins;
      if (diff >= -45 && (!best || Math.abs(diff) < Math.abs(best.diff))) {
        best = { meal, slot, recipe, diff, status: getMealTimeStatus(today, meal) };
      }
    });
    return best;
  }

  function formatCountdown(diffMins) {
    if (diffMins < -60) return `${Math.round(Math.abs(diffMins) / 60)}h ago`;
    if (diffMins < 0) return `${Math.abs(diffMins)} min ago`;
    if (diffMins < 60) return `in ${diffMins} min`;
    const h = Math.floor(diffMins / 60);
    const m = diffMins % 60;
    return m ? `in ${h}h ${m}m` : `in ${h}h`;
  }

  function addDays(date, n) {
    const d = new Date(date);
    d.setDate(d.getDate() + n);
    return d;
  }

  function getWeekStart(offset = 0) {
    const today = new Date();
    const day = today.getDay();
    const monday = addDays(today, -((day + 6) % 7) + offset * 7);
    monday.setHours(0, 0, 0, 0);
    return monday;
  }

  function getWeekDates(offset = 0) {
    const start = getWeekStart(offset);
    return Array.from({ length: 7 }, (_, i) => formatDate(addDays(start, i)));
  }

  function getWeekRangeLabel(offset = 0) {
    const dates = getWeekDates(offset);
    const start = parseDate(dates[0]);
    const end = parseDate(dates[6]);
    const range = `${start.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })} – ${end.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}`;
    const labels = { '-1': 'Last week', 0: 'This week', 1: 'Next week', 2: 'In 2 weeks' };
    const name = labels[offset] ?? `Week ${offset > 0 ? '+' : ''}${offset}`;
    return { name, range };
  }

  function getMonthDates(monthOffset = 0) {
    const anchor = new Date();
    const first = new Date(anchor.getFullYear(), anchor.getMonth() + monthOffset, 1);
    const last = new Date(anchor.getFullYear(), anchor.getMonth() + monthOffset + 1, 0);
    const dates = [];
    for (let d = new Date(first); d <= last; d.setDate(d.getDate() + 1)) {
      dates.push(formatDate(new Date(d)));
    }
    return dates;
  }

  function getMonthRangeLabel(monthOffset = 0) {
    const dates = getMonthDates(monthOffset);
    const start = parseDate(dates[0]);
    const end = parseDate(dates[dates.length - 1]);
    const range = `${start.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })} – ${end.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}`;
    const labels = { '-1': 'Last month', 0: 'This month', 1: 'Next month', 2: 'In 2 months' };
    const name = labels[monthOffset] ?? start.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
    return { name, range, dayCount: dates.length };
  }

  function getWeekOffsetForDate(dateStr) {
    for (let off = -4; off <= 12; off++) {
      if (getWeekDates(off).includes(dateStr)) return off;
    }
    return 0;
  }

  function getRecipe(id) {
    return state.recipes.find((r) => r.id === id);
  }

  function escapeHtml(str) {
    return String(str ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

  function formatInstructions(text, recipe) {
    return InstructionHelper.renderHtml(text, recipe, escapeHtml);
  }

  function recipeLink(recipeId, name, className = 'recipe-link') {
    return `<button type="button" class="${className}" onclick="App.openRecipeModal('${recipeId}')">${escapeHtml(name)}</button>`;
  }

  function openRecipeModal(recipeId, mealType, date) {
    const recipe = getRecipe(recipeId);
    if (!recipe) return;
    const banMatches = typeof BanList !== 'undefined' ? BanList.findMatches(recipe, getBanList()) : [];
    const banWarning = banMatches.length ? `
      <div class="ban-warning mb-4">
        <div class="font-semibold mb-1"><i class="fa-solid fa-triangle-exclamation mr-1"></i> Contains banned items</div>
        <ul class="list-disc list-inside space-y-0.5">
          ${banMatches.slice(0, 6).map((m) => `
            <li><span class="capitalize">${m.kind === 'allergy' ? 'Allergy' : 'Dislike'}:</span> ${escapeHtml(m.term)}${m.source === 'ingredient' ? ` (${escapeHtml(m.text)})` : ''}</li>
          `).join('')}
          ${banMatches.length > 6 ? `<li>+${banMatches.length - 6} more</li>` : ''}
        </ul>
      </div>` : '';
    const famMult = getFamilyMultiplier();
    const famSummary = FamilySettings.getSummary(getFamily());
    const scaledNut = FamilySettings.scaleNutrition(recipe, famMult);
    const tags = (recipe.tags || []).map((t) => `<span class="tag">${escapeHtml(t)}</span>`).join('');
    const ingredients = (recipe.ingredients || []).map((ing) => {
      const qty = FamilySettings.scaleQuantity(ing.quantity, famMult);
      return `
      <li class="flex items-start gap-2 text-sm text-slate-600">
        <i class="fa-solid fa-circle text-[4px] text-emerald-400 mt-2 flex-shrink-0"></i>
        <span>${qty} ${escapeHtml(ing.unit)} ${escapeHtml(ing.name)}</span>
      </li>`;
    }).join('');
    const ctx = mealType
      ? `<p class="text-sm text-emerald-600 mb-1 capitalize"><i class="fa-solid ${mealIcon(mealType)} mr-1"></i>${escapeHtml(mealType)}${date ? ` · ${escapeHtml(formatDisplayDate(date))}` : ''}</p>`
      : '';

    showModal(`
      ${banWarning}
      <div class="flex items-start justify-between gap-3 mb-2">
        <div class="min-w-0">
          ${ctx}
          <h3 class="text-xl font-bold text-slate-800">${escapeHtml(recipe.name)}</h3>
          <p class="text-sm text-slate-500 mt-1">
            ${famMult > 1 ? `${FamilySettings.formatServings(famMult)} servings (family)` : `${recipe.servings || 1} serving(s)`}
            · ${recipe.prepTime || '—'} min prep
          </p>
          ${famMult > 1 ? `<p class="text-xs text-violet-600 mt-0.5"><i class="fa-solid fa-users mr-1"></i>${escapeHtml(famSummary.detail)}</p>` : ''}
        </div>
        <button type="button" onclick="App.closeModal()" class="text-slate-400 hover:text-slate-600 flex-shrink-0 p-1" aria-label="Close">
          <i class="fa-solid fa-xmark text-lg"></i>
        </button>
      </div>
      <div class="grid grid-cols-4 gap-2 mb-4">
        <div class="nutrition-pill"><div class="text-lg font-bold text-orange-600">${scaledNut.calories}</div><div class="text-xs text-slate-400">Calories${famMult > 1 ? ' total' : ''}</div></div>
        <div class="nutrition-pill"><div class="text-lg font-bold text-blue-600">${scaledNut.protein}g</div><div class="text-xs text-slate-400">Protein</div></div>
        <div class="nutrition-pill"><div class="text-lg font-bold text-amber-600">${scaledNut.carbs}g</div><div class="text-xs text-slate-400">Carbs</div></div>
        <div class="nutrition-pill"><div class="text-lg font-bold text-rose-600">${scaledNut.fat}g</div><div class="text-xs text-slate-400">Fat</div></div>
      </div>
      ${famMult > 1 ? `<p class="text-[10px] text-slate-400 mb-3 -mt-2">Per person: ~${Math.round(recipe.calories)} kcal · ${recipe.protein}g protein</p>` : ''}
      ${tags ? `<div class="flex gap-1 flex-wrap mb-4">${tags}</div>` : ''}
      <div class="mb-4">
        <h4 class="font-semibold text-slate-700 mb-2 flex items-center gap-2">
          <i class="fa-solid fa-list text-emerald-500"></i> Ingredients — get these ready first
        </h4>
        <ul class="grid sm:grid-cols-2 gap-x-4 gap-y-2">${ingredients || '<li class="text-sm text-slate-400">No ingredients listed</li>'}</ul>
      </div>
      <div class="max-h-[55vh] overflow-y-auto pr-1">
        <h4 class="font-semibold text-slate-700 mb-2 flex items-center gap-2 sticky top-0 bg-white py-1 z-10">
          <i class="fa-solid fa-shoe-prints text-orange-500"></i> Step-by-step instructions
        </h4>
        ${formatInstructions(recipe.instructions, recipe)}
      </div>
      <button type="button" onclick="App.closeModal()" class="btn-primary w-full mt-4">Done</button>
    `, 'modal-lg');
  }

  function uid() {
    return 'id-' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
  }

  function getDayLog(date) {
    if (!state.calorieLog[date]) state.calorieLog[date] = { entries: [] };
    return state.calorieLog[date];
  }

  function getDayTotals(date) {
    const log = getDayLog(date);
    return log.entries.reduce(
      (acc, e) => ({
        calories: acc.calories + e.calories,
        protein: acc.protein + e.protein,
        carbs: acc.carbs + e.carbs,
        fat: acc.fat + e.fat,
      }),
      { calories: 0, protein: 0, carbs: 0, fat: 0 }
    );
  }

  function getPlannedMeals(date) {
    return state.mealPlan[date] || {};
  }

  function setPlannedMeal(date, mealType, recipeId, time, skipRender) {
    if (typeof time === 'boolean') { skipRender = time; time = null; }
    if (!state.mealPlan[date]) state.mealPlan[date] = {};
    if (recipeId) {
      const existing = getMealSlot(date, mealType);
      state.mealPlan[date][mealType] = {
        recipeId,
        time: time || existing?.time || getSuggestedTime(mealType),
      };
    } else {
      delete state.mealPlan[date][mealType];
    }
    saveState();
    if (getWeekDates(0).includes(date)) syncGroceryFromMealPlan(0);
    if (!skipRender) render();
  }

  function setMealTime(date, mealType, time) {
    const slot = getMealSlot(date, mealType);
    if (!slot) return;
    state.mealPlan[date][mealType] = { ...slot, time };
    saveState();
    render();
  }

  function getBanList() {
    const empty = { allergies: [], dislikes: [] };
    if (typeof BanList === 'undefined') return empty;
    return BanList.normalize(state.settings.banList || empty);
  }

  function filterAllowedRecipes(recipes) {
    if (typeof BanList === 'undefined') return recipes;
    return BanList.filterRecipes(recipes, getBanList());
  }

  function getRecipesForMeal(mealType, style) {
    let pool = filterAllowedRecipes(state.recipes.filter((r) => r.tags.includes(mealType)));
    if (!pool.length) pool = filterAllowedRecipes([...state.recipes]);

    if (style === 'high-protein') {
      const filtered = pool.filter((r) => r.tags.includes('high-protein') || r.protein >= 22);
      if (filtered.length >= 3) pool = filtered;
    } else if (style === 'quick') {
      const filtered = pool.filter((r) => r.tags.includes('quick') || r.prepTime <= 20);
      if (filtered.length >= 3) pool = filtered;
    } else if (style === 'meal-prep') {
      const filtered = pool.filter((r) => r.tags.includes('meal-prep'));
      if (filtered.length >= 3) pool = filtered;
    } else if (style === 'vegetarian') {
      const filtered = pool.filter((r) => r.tags.includes('vegetarian'));
      if (filtered.length >= 3) pool = filtered;
    } else if (style === 'low-carb') {
      const filtered = pool.filter((r) => r.tags.includes('low-carb') || r.carbs <= 30);
      if (filtered.length >= 3) pool = filtered;
    }
    return pool;
  }

  function getWeekSlotRecipe(date, meal) {
    const id = getMealRecipeId(date, meal);
    return id ? getRecipe(id) : null;
  }

  function getIngredientReuse() {
    return state.settings.ingredientReuse || 'balanced';
  }

  function scrollToGroceryList(offset = 0) {
    if (offset !== 0) generateGroceryFromWeek(offset, { silent: true });
    activeView = 'planner';
    render();
    requestAnimationFrame(() => {
      document.getElementById('meal-prep-grocery')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    });
  }

  function syncGroceryFromMealPlan(offset = 0) {
    if (offset !== 0) return;
    const dates = getWeekDates(0);
    const hasMeals = dates.some((d) => MEAL_TYPES.some((m) => getMealSlot(d, m)));
    if (!hasMeals) {
      state.groceryList = state.groceryList.filter((i) => i.source !== 'recipe');
      state.settings.lastShopEfficiency = getWeekShoppingAnalysis(0);
      applyQuickPriceEstimates();
      saveState();
      return;
    }
    generateGroceryFromWeek(0, { silent: true });
  }

  function getWeekShoppingAnalysis(offset = weekOffset) {
    const dates = getWeekDates(offset);
    return SmartMealPlanner.analyzeWeek(dates, MEAL_TYPES, getWeekSlotRecipe, getIngredientReuse());
  }

  function autoPopulateDates(dates, style, replaceExisting, skipRender) {
    const goal = state.settings.calorieGoal || 2000;
    const ctx = SmartMealPlanner.createContext(style, getIngredientReuse());

    if (!replaceExisting) {
      SmartMealPlanner.seedContextFromPlan(ctx, dates, MEAL_TYPES, getWeekSlotRecipe);
    }

    dates.forEach((date) => {
      if (!replaceExisting) {
        if (MEAL_TYPES.every((m) => getMealSlot(date, m))) return;
      }

      if (!state.mealPlan[date]) state.mealPlan[date] = {};

      MEAL_TYPES.forEach((meal) => {
        if (!replaceExisting && getMealSlot(date, meal)) return;

        const targetCal = Math.round(goal * MEAL_CALORIE_SPLIT[meal]);
        const poolStyle = style === 'smart-shop' ? 'balanced' : style;
        const pool = getRecipesForMeal(meal, poolStyle);
        const recipe = SmartMealPlanner.pickRecipe(pool, targetCal, ctx);
        if (recipe) {
          state.mealPlan[date][meal] = { recipeId: recipe.id, time: getSuggestedTime(meal) };
          SmartMealPlanner.addRecipeToContext(ctx, recipe);
          ctx.recentRecipeIds.push(recipe.id);
          if (ctx.recentRecipeIds.length > 8) ctx.recentRecipeIds.shift();
        }
      });
    });

    state.settings.lastShopEfficiency = getWeekShoppingAnalysis(0);
    saveState();
    syncGroceryFromMealPlan(0);
    if (!skipRender) render();
  }

  function autoPopulateWeek(offset, style, replaceExisting, skipRender) {
    autoPopulateDates(getWeekDates(offset), style, replaceExisting, skipRender);
  }

  function autoPopulateMonth(monthOffset, style, replaceExisting, skipRender) {
    autoPopulateDates(getMonthDates(monthOffset), style, replaceExisting, skipRender);
  }

  function clearDatesPlan(dates) {
    dates.forEach((date) => { delete state.mealPlan[date]; });
    saveState();
    syncGroceryFromMealPlan(0);
    render();
  }

  function clearWeekPlan(offset) {
    clearDatesPlan(getWeekDates(offset));
  }

  function clearMonthPlan(monthOffset) {
    clearDatesPlan(getMonthDates(monthOffset));
  }

  function isMealLogged(date, mealType, recipeId) {
    return getDayLog(date).entries.some(
      (e) => e.mealType === mealType && e.recipeId === recipeId
    );
  }

  function addPlannedMealToLog(date, mealType, silent) {
    const slot = getMealSlot(date, mealType);
    if (!slot) return false;
    const recipe = getRecipe(slot.recipeId);
    if (!recipe || isMealLogged(date, mealType, slot.recipeId)) return false;

    let loggedAt = new Date();
    if (date === todayStr() && slot.time) {
      const [h, m] = slot.time.split(':').map(Number);
      loggedAt.setHours(h, m, 0, 0);
    }
    getDayLog(date).entries.push({
      id: uid(),
      recipeId: slot.recipeId,
      name: recipe.name,
      calories: recipe.calories,
      protein: recipe.protein,
      carbs: recipe.carbs,
      fat: recipe.fat,
      mealType,
      time: loggedAt.toISOString(),
    });
    saveState();
    if (!silent) render();
    return true;
  }

  function logFromRecipe(date, recipeId, mealType) {
    const recipe = getRecipe(recipeId);
    if (!recipe) return;
    if (isMealLogged(date, mealType, recipeId)) return;
    const log = getDayLog(date);
    let loggedAt = new Date();
    const slot = getMealSlot(date, mealType);
    if (date === todayStr() && slot?.time) {
      const [h, m] = slot.time.split(':').map(Number);
      loggedAt.setHours(h, m, 0, 0);
    }
    log.entries.push({
      id: uid(),
      recipeId,
      name: recipe.name,
      calories: recipe.calories,
      protein: recipe.protein,
      carbs: recipe.carbs,
      fat: recipe.fat,
      mealType,
      time: loggedAt.toISOString(),
    });
    saveState();
    if (activeView === 'dashboard') {
      homeCalorieLogOpen = true;
      homeLogDate = date;
    }
    render();
  }

  function logScheduledMeal(date, mealType) {
    if (addPlannedMealToLog(date, mealType)) return;
    const slot = getMealSlot(date, mealType);
    if (!slot) alert('No meal planned for this slot.');
    else alert('This meal is already in your calorie log.');
  }

  function getScheduledMealsForDate(date) {
    return MEAL_SCHEDULE_ORDER.map((meal) => {
      const slot = getMealSlot(date, meal);
      const recipe = slot ? getRecipe(slot.recipeId) : null;
      return {
        meal,
        slot,
        recipe,
        logged: recipe ? isMealLogged(date, meal, recipe.id) : false,
      };
    }).filter((s) => s.recipe);
  }

  function logAllPlannedForDate(date) {
    let count = 0;
    MEAL_SCHEDULE_ORDER.forEach((meal) => {
      if (addPlannedMealToLog(date, meal, true)) count++;
    });
    if (!count) {
      const hasPlanned = MEAL_SCHEDULE_ORDER.some((m) => getMealSlot(date, m));
      alert(hasPlanned ? 'All planned meals are already logged!' : 'No meals planned for this day.');
      return;
    }
    if (activeView === 'dashboard') {
      homeCalorieLogOpen = true;
      homeLogDate = date;
    }
    render();
  }

  function logAllScheduleToCalories() {
    logAllPlannedForDate(todayStr());
  }

  function removeLogEntry(date, entryId) {
    const log = getDayLog(date);
    log.entries = log.entries.filter((e) => e.id !== entryId);
    saveState();
    render();
  }

  function addCustomLogEntry(date, entry) {
    const log = getDayLog(date);
    log.entries.push({ id: uid(), ...entry, time: new Date().toISOString() });
    saveState();
    render();
    loadPhotoThumbnails();
  }

  function generateGroceryFromWeek(offset = 0, opts = {}) {
    const silent = opts === true || opts?.silent;
    const dates = getWeekDates(offset);
    const { items, analysis } = SmartMealPlanner.aggregateGrocery(dates, MEAL_TYPES, getWeekSlotRecipe, getIngredientReuse());

    const famMult = getFamilyMultiplier();
    const autoItems = items.map((ing) => {
      const scaled = {
        name: ing.name,
        quantity: FamilySettings.scaleQuantity(ing.quantity, famMult),
        unit: ing.unit,
        mealUses: ing.mealUses,
        isShared: ing.isShared,
        shopStatus: ing.status,
        usedInRecipes: ing.recipes,
      };
      const retail = typeof GroceryUnits !== 'undefined' ? GroceryUnits.toRetailPurchase(scaled) : scaled;
      if (!retail) return null;
      return {
        id: uid(),
        ...retail,
        checked: false,
        source: 'recipe',
      };
    }).filter(Boolean);

    const manualItems = state.groceryList.filter((i) => i.source === 'manual');
    state.groceryList = [...autoItems, ...manualItems];
    state.settings.lastShopEfficiency = analysis;
    applyQuickPriceEstimates();
    saveState();
    if (!silent) render();
  }

  function applyQuickPriceEstimates() {
    const g = getGrocerySettings();
    if (!g.zipCode || !/^\d{5}$/.test(g.zipCode) || !state.groceryList.length) return;
    const items = state.groceryList.map((item) => ({
      id: item.id,
      ...GroceryPrices.estimatePrice(item, g.zipCode, g.favoriteStore),
    }));
    state.groceryList = GroceryPrices.applyPricesToList(state.groceryList, { items });
    state.settings.grocery.priceSource = 'estimate';
    state.settings.grocery.lastPriceUpdate = new Date().toISOString();
    state.settings.grocery.storeName = GROCERY_STORES.find((s) => s.id === g.favoriteStore)?.name;
  }

  function toggleGroceryItem(id) {
    const item = state.groceryList.find((i) => i.id === id);
    if (item) item.checked = !item.checked;
    saveState();
    render();
  }

  function removeGroceryItem(id) {
    state.groceryList = state.groceryList.filter((i) => i.id !== id);
    saveState();
    render();
  }

  function addManualGroceryItem(name) {
    state.groceryList.push({
      id: uid(),
      name: name.trim(),
      quantity: 1,
      unit: 'item',
      checked: false,
      source: 'manual',
    });
    saveState();
    render();
  }

  function clearCheckedGroceries() {
    state.groceryList = state.groceryList.filter((i) => !i.checked);
    saveState();
    render();
  }

  function addRecipe(recipe) {
    state.recipes.push({ id: uid(), ...recipe });
    saveState();
    render();
  }

  function deleteRecipe(id) {
    state.recipes = state.recipes.filter((r) => r.id !== id);
    Object.keys(state.mealPlan).forEach((date) => {
      MEAL_TYPES.forEach((meal) => {
        if (getMealRecipeId(date, meal) === id) delete state.mealPlan[date][meal];
      });
    });
    syncGroceryFromMealPlan(0);
    saveState();
    render();
  }

  function updateSettings(settings) {
    state.settings = { ...state.settings, ...settings };
    saveState();
    render();
  }

  function switchView(view) {
    if (view === 'calories') {
      activeView = 'dashboard';
      homeCalorieLogOpen = true;
      if (!homeLogDate) homeLogDate = todayStr();
      render();
      return;
    }
    if (view === 'recipes') {
      activeView = 'dashboard';
      homeRecipeLibraryOpen = true;
      render();
      return;
    }
    if (view === 'grocery') {
      scrollToGroceryList(weekOffset);
      return;
    }
    activeView = view;
    if (view !== 'dashboard') {
      homeCalorieLogOpen = false;
      homeRecipeLibraryOpen = false;
    }
    render();
  }

  function getHomeLogDate() {
    return homeLogDate || todayStr();
  }

  function toggleHomeCalorieLog() {
    homeCalorieLogOpen = !homeCalorieLogOpen;
    if (homeCalorieLogOpen && !homeLogDate) homeLogDate = todayStr();
    render();
  }

  function openHomeCalorieLog(date) {
    homeCalorieLogOpen = true;
    homeLogDate = date || todayStr();
    activeView = 'dashboard';
    render();
  }

  function setHomeLogDate(date) {
    homeLogDate = date;
    render();
  }

  function toggleHomeRecipeLibrary() {
    homeRecipeLibraryOpen = !homeRecipeLibraryOpen;
    render();
  }

  function openHomeRecipeLibrary() {
    homeRecipeLibraryOpen = true;
    activeView = 'dashboard';
    render();
  }

  function pct(current, goal) {
    return goal > 0 ? Math.min(100, Math.round((current / goal) * 100)) : 0;
  }

  function mealIcon(meal) {
    const icons = { breakfast: 'fa-mug-hot', lunch: 'fa-bowl-food', dinner: 'fa-utensils', snack: 'fa-apple-whole' };
    return icons[meal] || 'fa-plate-wheat';
  }

  function getRecipeMealCategories(recipe) {
    return MEAL_TYPES.filter((m) => recipe.tags.includes(m));
  }

  function getRecipeDisplayTags(recipe) {
    const mealSet = new Set(MEAL_TYPES);
    return recipe.tags.filter((t) => !mealSet.has(t));
  }

  function recipeInLibraryCategory(recipe, category) {
    if (category === 'all') return true;
    return recipe.tags.includes(category);
  }

  function sortRecipesByName(recipes) {
    return [...recipes].sort((a, b) => a.name.localeCompare(b.name));
  }

  function getRecipeCategoryCounts(recipes) {
    const counts = { all: recipes.length };
    MEAL_TYPES.forEach((m) => {
      counts[m] = recipes.filter((r) => r.tags.includes(m)).length;
    });
    return counts;
  }

  function renderRecipeCategoryBar(recipes) {
    const counts = getRecipeCategoryCounts(recipes);
    const categories = [{ id: 'all', label: 'All', icon: 'fa-grid-2' }, ...MEAL_TYPES.map((m) => ({
      id: m,
      label: m.charAt(0).toUpperCase() + m.slice(1),
      icon: mealIcon(m),
    }))];
    return `
      <div class="recipe-category-bar" role="tablist" aria-label="Recipe categories">
        ${categories.map((c) => `
          <button type="button" role="tab" aria-selected="${recipeLibraryCategory === c.id}"
            class="recipe-cat-btn ${recipeLibraryCategory === c.id ? 'active' : ''}"
            onclick="App.setRecipeLibraryCategory('${c.id}')">
            <i class="fa-solid ${c.icon}"></i>
            <span>${c.label}</span>
            <span class="recipe-cat-count">${counts[c.id]}</span>
          </button>
        `).join('')}
      </div>`;
  }

  function renderRecipeListCard(r) {
    const categories = getRecipeMealCategories(r);
    const displayTags = getRecipeDisplayTags(r);
    return `
      <div class="recipe-card ${selectedRecipeId === r.id ? 'active' : ''}" onclick="App.selectRecipe('${r.id}')">
        <div class="flex justify-between items-start gap-2">
          <div class="min-w-0">
            <div class="font-semibold text-slate-800">${escapeHtml(r.name)}</div>
            ${categories.length ? `
              <div class="flex gap-1 mt-1 flex-wrap">
                ${categories.map((c) => `
                  <span class="recipe-category-badge">
                    <i class="fa-solid ${mealIcon(c)}"></i>${c}
                  </span>
                `).join('')}
              </div>` : ''}
          </div>
          <div class="flex items-center gap-1 flex-shrink-0">
            <button type="button" class="recipe-view-btn" onclick="event.stopPropagation(); App.openRecipeModal('${r.id}')" title="Cooking instructions">
              <i class="fa-solid fa-book-open"></i>
            </button>
            <span class="text-xs bg-emerald-50 text-emerald-700 px-2 py-0.5 rounded-full">${r.calories} kcal</span>
          </div>
        </div>
        <div class="flex gap-3 mt-2 text-xs text-slate-400">
          <span><i class="fa-solid fa-dumbbell mr-1"></i>${r.protein}g protein</span>
          <span><i class="fa-solid fa-clock mr-1"></i>${r.prepTime} min</span>
        </div>
        ${displayTags.length ? `
          <div class="flex gap-1 mt-2 flex-wrap">
            ${displayTags.map((t) => `<span class="tag">${t}</span>`).join('')}
          </div>` : ''}
      </div>`;
  }

  function renderRecipeListContent(recipes) {
    if (recipeLibraryCategory === 'all') {
      const sections = MEAL_TYPES.map((meal) => {
        const items = sortRecipesByName(recipes.filter((r) => r.tags.includes(meal)));
        if (!items.length) return '';
        return `
          <div class="recipe-category-section">
            <div class="recipe-category-header">
              <i class="fa-solid ${mealIcon(meal)} text-emerald-500"></i>
              <span class="capitalize font-semibold text-slate-700">${meal}</span>
              <span class="recipe-category-count">${items.length}</span>
            </div>
            <div class="space-y-3">
              ${items.map((r) => renderRecipeListCard(r)).join('')}
            </div>
          </div>`;
      }).filter(Boolean).join('');
      return sections || `<div class="recipe-category-empty">No recipes match your filters.</div>`;
    }

    const items = sortRecipesByName(recipes.filter((r) => recipeInLibraryCategory(r, recipeLibraryCategory)));
    if (!items.length) {
      return `<div class="recipe-category-empty">No ${recipeLibraryCategory} recipes available.</div>`;
    }
    return `<div class="space-y-3">${items.map((r) => renderRecipeListCard(r)).join('')}</div>`;
  }

  function renderMacroBar(label, current, goal, color) {
    const p = pct(current, goal);
    return `
      <div class="macro-row">
        <div class="flex justify-between text-sm mb-1">
          <span class="font-medium text-slate-700">${label}</span>
          <span class="text-slate-500">${Math.round(current)}g / ${goal}g</span>
        </div>
        <div class="h-2 bg-slate-100 rounded-full overflow-hidden">
          <div class="h-full rounded-full transition-all duration-500 ${color}" style="width:${p}%"></div>
        </div>
      </div>`;
  }

  function renderCalorieRing(current, goal) {
    const p = pct(current, goal);
    const circumference = 2 * Math.PI * 54;
    const offset = circumference - (p / 100) * circumference;
    const remaining = Math.max(0, goal - current);
    return `
      <div class="calorie-ring relative flex items-center justify-center">
        <svg width="140" height="140" class="-rotate-90">
          <circle cx="70" cy="70" r="54" fill="none" stroke="#e2e8f0" stroke-width="10"/>
          <circle cx="70" cy="70" r="54" fill="none" stroke="url(#ringGrad)" stroke-width="10"
            stroke-dasharray="${circumference}" stroke-dashoffset="${offset}" stroke-linecap="round"
            class="transition-all duration-700"/>
          <defs>
            <linearGradient id="ringGrad" x1="0%" y1="0%" x2="100%" y2="0%">
              <stop offset="0%" stop-color="#10b981"/>
              <stop offset="100%" stop-color="#059669"/>
            </linearGradient>
          </defs>
        </svg>
        <div class="absolute text-center">
          <div class="text-2xl font-bold text-slate-800">${Math.round(current)}</div>
          <div class="text-xs text-slate-500">of ${goal} kcal</div>
          <div class="text-xs text-emerald-600 font-medium mt-1">${remaining} left</div>
        </div>
      </div>`;
  }

  function renderDashboard() {
    const today = todayStr();
    const totals = getDayTotals(today);
    const s = state.settings;
    const nextMeal = getNextMealSuggestion();
    const nowDisplay = new Date().toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });

    const schedule = MEAL_SCHEDULE_ORDER.map((meal) => {
      const slot = getMealSlot(today, meal);
      const recipe = slot ? getRecipe(slot.recipeId) : null;
      const win = MEAL_EATING_TIMES[meal];
      const status = getMealTimeStatus(today, meal);
      return { meal, slot, recipe, win, status };
    });

    return `
      <div class="view-enter space-y-6">
        <div class="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <h2 class="text-2xl font-bold text-slate-800">Good ${getGreeting()}, ${s.name}!</h2>
            <p class="text-slate-500 mt-1">${formatDisplayDate(today)} · <span class="text-emerald-600 font-medium">${nowDisplay}</span></p>
          </div>
          <div class="flex flex-wrap gap-2">
            <button onclick="App.openPhotoLogModal()" class="btn-secondary">
              <i class="fa-solid fa-camera"></i> Scan food
            </button>
            <button onclick="App.openBarcodeModal()" class="btn-secondary">
              <i class="fa-solid fa-barcode"></i> Scan
            </button>
            <button onclick="App.quickLogToday()" class="btn-primary">
              <i class="fa-solid fa-plus"></i> Log meals
            </button>
          </div>
        </div>

        ${nextMeal ? `
        <div class="card p-5 border-2 border-emerald-200 bg-gradient-to-r from-emerald-50 to-white meal-clickable"
          onclick="App.openRecipeModal('${nextMeal.recipe.id}','${nextMeal.meal}','${today}')">
          <div class="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div class="flex items-center gap-4 min-w-0">
              <div class="w-12 h-12 rounded-xl bg-emerald-500 text-white flex items-center justify-center text-lg flex-shrink-0">
                <i class="fa-solid ${mealIcon(nextMeal.meal)}"></i>
              </div>
              <div class="min-w-0">
                <div class="text-xs font-semibold text-emerald-600 uppercase tracking-wide">
                  ${nextMeal.status === 'now' ? 'Time to eat now' : 'Up next'}
                </div>
                <div class="font-bold text-slate-800 capitalize">${nextMeal.meal}: ${escapeHtml(nextMeal.recipe.name)}</div>
                <div class="text-sm text-slate-500">
                  Best time: <strong>${formatTimeDisplay(nextMeal.slot.time)}</strong>
                  · ${formatCountdown(nextMeal.diff)}
                  · ${nextMeal.recipe.calories} kcal
                  · <span class="text-emerald-600"><i class="fa-solid fa-book-open"></i> Step-by-step recipe</span>
                </div>
              </div>
            </div>
            <button type="button" onclick="event.stopPropagation(); App.logFromRecipe('${today}','${nextMeal.recipe.id}','${nextMeal.meal}')" class="btn-primary flex-shrink-0">
              <i class="fa-solid fa-check"></i> Log now
            </button>
          </div>
        </div>` : ''}

        <div class="card p-6">
          <div class="flex flex-wrap items-center justify-between gap-3 mb-1">
            <h3 class="font-semibold text-slate-800 flex items-center gap-2">
              <i class="fa-solid fa-clock text-blue-500"></i> Today's Eating Schedule
            </h3>
            ${(() => {
              const unlogged = schedule.filter((s) => s.recipe && !isMealLogged(today, s.meal, s.recipe.id)).length;
              return unlogged ? `<button onclick="App.logAllScheduleToCalories()" class="btn-primary text-sm py-1.5">
                <i class="fa-solid fa-plus"></i> Log all to calories (${unlogged})
              </button>` : schedule.some((s) => s.recipe) ? '<span class="text-xs text-emerald-600 font-medium"><i class="fa-solid fa-check mr-1"></i>All logged</span>' : '';
            })()}
          </div>
          <p class="text-xs text-slate-400 mb-4">Suggested windows based on circadian rhythm & digestion</p>
          <div class="space-y-2">
            ${schedule.map(({ meal, slot, recipe, win, status }) => {
              const logged = recipe && isMealLogged(today, meal, recipe.id);
              const statusBadge = status === 'now' ? '<span class="text-xs font-semibold text-emerald-600 bg-emerald-100 px-2 py-0.5 rounded-full">Now</span>'
                : status === 'missed' ? '<span class="text-xs text-amber-600">Past window</span>'
                : status === 'upcoming' ? '<span class="text-xs text-blue-600">Upcoming</span>' : '';
              const actionBtn = recipe
                ? (logged
                  ? '<span class="text-xs text-emerald-600 font-medium"><i class="fa-solid fa-check"></i> Logged</span>'
                  : `<button type="button" onclick="event.stopPropagation(); App.logScheduledMeal('${today}','${meal}')" class="btn-secondary text-xs py-1 px-2.5 whitespace-nowrap">
                      <i class="fa-solid fa-plus"></i> Add
                    </button>`)
                : '';
              return `
              <div class="schedule-row ${mealStatusClass(status)} flex items-center gap-3 p-3 rounded-xl border border-slate-100 ${recipe ? 'meal-clickable' : ''}"
                ${recipe ? `onclick="App.openRecipeModal('${recipe.id}','${meal}','${today}')"` : ''}>
                <div class="w-16 text-center flex-shrink-0">
                  <div class="text-sm font-bold text-slate-700">${slot ? formatTimeDisplay(slot.time) : formatTimeDisplay(win.ideal)}</div>
                  <div class="text-[10px] text-slate-400">${win.label}</div>
                </div>
                <div class="w-8 h-8 rounded-lg bg-slate-50 flex items-center justify-center flex-shrink-0">
                  <i class="fa-solid ${mealIcon(meal)} text-emerald-500 text-xs"></i>
                </div>
                <div class="flex-1 min-w-0">
                  <div class="font-medium text-slate-700 capitalize">${meal}${recipe ? `: <span class="text-emerald-800">${escapeHtml(recipe.name)}</span>` : ''}${recipe ? ` <span class="text-xs text-slate-400 font-normal">· ${recipe.calories} kcal</span>` : ''}</div>
                  <div class="text-xs text-slate-400 truncate">${recipe ? '<i class="fa-solid fa-book-open text-emerald-500 mr-0.5"></i>Tap for step-by-step recipe · ' : ''}${win.tip}</div>
                </div>
                <div class="flex-shrink-0 flex flex-col items-end gap-1.5" onclick="event.stopPropagation()">
                  ${statusBadge}
                  ${actionBtn}
                </div>
              </div>`;
            }).join('')}
          </div>
        </div>

        ${(() => {
          const ban = getBanList();
          const hiddenCount = BanList.countBanned(state.recipes, ban);
          const filtered = filterAllowedRecipes(state.recipes);
          const selected = selectedRecipeId ? getRecipe(selectedRecipeId) : null;
          return `
        <div class="grid md:grid-cols-2 gap-6 items-start">
          <div class="space-y-4 min-w-0">
            <div class="card p-6 meal-clickable calorie-summary-card h-full" onclick="App.toggleHomeCalorieLog()">
              <div class="flex items-center justify-between mb-4">
                <h3 class="font-semibold text-slate-800 flex items-center gap-2">
                  <i class="fa-solid fa-fire text-orange-500"></i> Today's Calories
                </h3>
                <i class="fa-solid fa-chevron-${homeCalorieLogOpen ? 'up' : 'down'} text-slate-400 text-sm"></i>
              </div>
              <div class="flex flex-col sm:flex-row items-center gap-4 sm:gap-6">
                ${renderCalorieRing(totals.calories, s.calorieGoal)}
                <div class="flex-1 w-full space-y-3">
                  ${renderMacroBar('Protein', totals.protein, s.proteinGoal, 'bg-blue-500')}
                  ${renderMacroBar('Carbs', totals.carbs, s.carbsGoal, 'bg-amber-500')}
                  ${renderMacroBar('Fat', totals.fat, s.fatGoal, 'bg-rose-500')}
                </div>
              </div>
              <p class="text-xs text-emerald-600 mt-4 font-medium">
                <i class="fa-solid fa-list-ul mr-1"></i>${homeCalorieLogOpen ? 'Hide food log' : 'Tap to view food log &amp; add meals'}
              </p>
            </div>
            ${homeCalorieLogOpen ? renderCalorieLogPanel(getHomeLogDate(), { compact: true }) : ''}
          </div>

          <div class="space-y-4 min-w-0">
            <div class="card p-6 meal-clickable calorie-summary-card h-full" onclick="App.toggleHomeRecipeLibrary()">
              <div class="flex items-center justify-between mb-2">
                <h3 class="font-semibold text-slate-800 flex items-center gap-2">
                  <i class="fa-solid fa-book text-emerald-500"></i> Recipe Library
                </h3>
                <i class="fa-solid fa-chevron-${homeRecipeLibraryOpen ? 'up' : 'down'} text-slate-400 text-sm"></i>
              </div>
              <p class="text-sm text-slate-500">${filtered.length} recipes${hiddenCount ? ` · <span class="text-amber-600">${hiddenCount} hidden</span>` : ''}</p>
              ${selected ? `<p class="text-sm font-medium text-slate-700 mt-2 truncate">${escapeHtml(selected.name)} · ${selected.calories} kcal</p>` : ''}
              <p class="text-xs text-emerald-600 mt-3 font-medium">
                <i class="fa-solid fa-book-open mr-1"></i>${homeRecipeLibraryOpen ? 'Hide recipe library' : 'Tap to browse recipes &amp; cooking instructions'}
              </p>
            </div>
            ${homeRecipeLibraryOpen ? renderRecipeLibraryPanel({ compact: true }) : ''}
          </div>
        </div>`;
        })()}
      </div>`;
  }

  function getGreeting() {
    const h = new Date().getHours();
    if (h < 12) return 'morning';
    if (h < 17) return 'afternoon';
    return 'evening';
  }

  function formatDisplayDate(str) {
    return parseDate(str).toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' });
  }

  function renderPlanner() {
    const dates = getWeekDates(weekOffset);
    const start = parseDate(dates[0]);
    const end = parseDate(dates[6]);
    const weekLabel = `${start.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })} – ${end.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}`;
    const groceryBtnAction = `App.scrollToGroceryList(${weekOffset})`;

    return `
      <div class="view-enter space-y-6">
        <div class="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <h2 class="text-2xl font-bold text-slate-800">Meal Prep Planner</h2>
            <p class="text-slate-500 mt-1">Plan your week — pick a meal style to auto-fill</p>
          </div>
          <div class="flex flex-wrap items-center gap-2">
            <button onclick="App.changeWeek(-1)" class="btn-icon"><i class="fa-solid fa-chevron-left"></i></button>
            <span class="text-sm font-medium text-slate-600 min-w-[160px] text-center">${weekLabel}</span>
            <button onclick="App.changeWeek(1)" class="btn-icon"><i class="fa-solid fa-chevron-right"></i></button>
            <button onclick="App.openAutoFillModal()" class="btn-primary">
              <i class="fa-solid fa-utensils"></i> Meal style
            </button>
            <button onclick="${groceryBtnAction}" class="btn-secondary">
              <i class="fa-solid fa-cart-shopping"></i> Grocery list
            </button>
            <button onclick="App.clearWeekPlan(${weekOffset})" class="btn-ghost text-xs text-slate-400 hover:text-red-500">Clear week</button>
          </div>
        </div>

        ${renderFamilyBadge() ? `<div class="flex justify-end">${renderFamilyBadge()}</div>` : ''}

        <div class="grid sm:grid-cols-2 lg:grid-cols-4 gap-3">
          ${MEAL_SCHEDULE_ORDER.map((meal) => {
            const win = MEAL_EATING_TIMES[meal];
            return `
              <div class="card p-3 text-center">
                <i class="fa-solid ${mealIcon(meal)} text-emerald-500 mb-1"></i>
                <div class="text-sm font-semibold text-slate-700 capitalize">${meal}</div>
                <div class="text-xs text-emerald-600 font-medium">${win.label}</div>
                <div class="text-[10px] text-slate-400 mt-1">${win.tip}</div>
              </div>`;
          }).join('')}
        </div>

        <div class="overflow-x-auto">
          <div class="min-w-[700px]">
            <div class="grid grid-cols-8 gap-2 mb-2">
              <div></div>
              ${dates.map((date) => {
                const isToday = date === todayStr();
                return `
                  <div class="text-center py-2 ${isToday ? 'bg-emerald-50 rounded-xl' : ''}">
                    <div class="text-xs text-slate-400">${parseDate(date).toLocaleDateString('en-US', { weekday: 'short' })}</div>
                    <div class="font-semibold text-slate-700">${parseDate(date).getDate()}</div>
                  </div>`;
              }).join('')}
            </div>
            ${MEAL_TYPES.map((meal) => {
              const win = MEAL_EATING_TIMES[meal];
              return `
              <div class="grid grid-cols-8 gap-2 mb-2">
                <div class="flex flex-col justify-center py-2 pr-2">
                  <div class="flex items-center gap-2">
                    <i class="fa-solid ${mealIcon(meal)} text-emerald-600 w-4"></i>
                    <span class="text-sm font-medium text-slate-600 capitalize">${meal}</span>
                  </div>
                  <span class="text-[10px] text-slate-400 ml-6">${win.label}</span>
                </div>
                ${dates.map((date) => {
                  const slot = getMealSlot(date, meal);
                  const recipe = slot ? getRecipe(slot.recipeId) : null;
                  const isToday = date === todayStr();
                  const status = isToday ? getMealTimeStatus(date, meal) : '';
                  return `
                    <div class="meal-slot ${recipe ? 'has-meal' : ''} ${mealStatusClass(status)} ${recipe ? 'relative' : ''}"
                      ${recipe ? `onclick="App.openRecipeModal('${recipe.id}','${meal}','${date}')"` : `onclick="App.openMealPicker('${date}','${meal}')"`}>
                      ${recipe ? `
                        <button type="button" class="meal-edit-btn" onclick="event.stopPropagation(); App.openMealPicker('${date}','${meal}')" title="Change meal">
                          <i class="fa-solid fa-pen"></i>
                        </button>
                        <div class="text-[10px] font-medium text-slate-500 mb-0.5" onclick="event.stopPropagation(); App.openTimePicker('${date}','${meal}')">
                          <i class="fa-regular fa-clock"></i> ${formatTimeDisplay(slot.time)}
                        </div>
                        <div class="text-xs font-semibold text-emerald-800 leading-tight hover:underline">${escapeHtml(recipe.name)}</div>
                        <div class="text-xs text-emerald-600 mt-0.5">${recipe.calories} kcal · <span class="text-emerald-700"><i class="fa-solid fa-book-open"></i> Cook</span></div>
                      ` : `<div class="text-[10px] text-slate-400 mb-1">${formatTimeDisplay(win.ideal)}</div><i class="fa-solid fa-plus text-slate-300"></i>`}
                    </div>`;
                }).join('')}
              </div>`;
            }).join('')}
          </div>
        </div>

        <div class="card p-6">
          <h3 class="font-semibold text-slate-800 mb-3">Weekly Nutrition Summary</h3>
          <div class="grid sm:grid-cols-4 gap-4">
            ${(() => {
              const weekTotals = dates.reduce((acc, date) => {
                const plan = getPlannedMeals(date);
                MEAL_TYPES.forEach((meal) => {
                  const r = getMealRecipeId(date, meal) ? getRecipe(getMealRecipeId(date, meal)) : null;
                  if (r) {
                    acc.calories += r.calories;
                    acc.protein += r.protein;
                    acc.carbs += r.carbs;
                    acc.fat += r.fat;
                    acc.meals += 1;
                  }
                });
                return acc;
              }, { calories: 0, protein: 0, carbs: 0, fat: 0, meals: 0 });
              const avgCal = weekTotals.meals ? Math.round(weekTotals.calories / 7) : 0;
              return `
                <div class="stat-box"><div class="stat-value">${weekTotals.calories}</div><div class="stat-label">Total kcal</div></div>
                <div class="stat-box"><div class="stat-value">${avgCal}</div><div class="stat-label">Avg / day</div></div>
                <div class="stat-box"><div class="stat-value">${Math.round(weekTotals.protein)}g</div><div class="stat-label">Protein</div></div>
                <div class="stat-box"><div class="stat-value">${weekTotals.meals}</div><div class="stat-label">Meals planned</div></div>`;
            })()}
          </div>
        </div>

        ${renderGroceryPanel()}
      </div>`;
  }

  function renderCalorieLogPanel(logDate, opts = {}) {
    const compact = opts.compact;
    const log = getDayLog(logDate);
    return `
      <div class="space-y-4 calorie-log-panel" onclick="event.stopPropagation()">
        <div class="flex flex-wrap items-center justify-between gap-3">
          <h3 class="font-semibold text-slate-800 flex items-center gap-2">
            <i class="fa-solid fa-clipboard-list text-emerald-500"></i> Food Log
          </h3>
          <div class="flex flex-wrap gap-2 items-center">
            <input type="date" id="log-date" value="${logDate}" onchange="App.setHomeLogDate(this.value)"
              class="px-4 py-2 border border-slate-200 rounded-xl text-sm focus:ring-2 focus:ring-emerald-400 outline-none"/>
            <button onclick="App.openBarcodeModal('${logDate}')" class="btn-secondary text-sm py-2">
              <i class="fa-solid fa-barcode"></i> Scan
            </button>
            <button onclick="App.openPhotoLogModal('${logDate}')" class="btn-secondary text-sm py-2">
              <i class="fa-solid fa-camera"></i> Photo
            </button>
            <button onclick="App.openCustomLogModal('${logDate}')" class="btn-primary text-sm py-2">
              <i class="fa-solid fa-plus"></i> Add food
            </button>
          </div>
        </div>

        <div class="card p-6">
          ${log.entries.length ? `
            <div class="space-y-2">
              ${[...log.entries].reverse().map((e) => `
                <div class="flex items-center justify-between p-3 bg-slate-50 rounded-xl group">
                  <div class="flex items-center gap-3">
                    ${e.photoId
                      ? `<img data-photo-id="${e.photoId}" class="w-10 h-10 rounded-lg object-cover bg-slate-200" alt="meal"/>`
                      : `<div class="w-8 h-8 rounded-lg bg-white flex items-center justify-center shadow-sm">
                          <i class="fa-solid ${e.barcode ? 'fa-barcode' : mealIcon(e.mealType || 'snack')} text-emerald-500 text-xs"></i>
                        </div>`}
                    <div>
                      <div>${e.recipeId ? recipeLink(e.recipeId, e.name, 'recipe-link font-medium text-slate-700') : `<span class="font-medium text-slate-700">${escapeHtml(e.name)}</span>`}</div>
                      <div class="text-xs text-slate-400 capitalize">${formatLogTime(e.time)} · ${e.mealType || 'snack'} · P ${e.protein}g · C ${e.carbs}g · F ${e.fat}g${e.aiConfidence ? ` · AI: ${e.aiConfidence}` : ''}</div>
                    </div>
                  </div>
                  <div class="flex items-center gap-3">
                    <span class="font-semibold text-slate-700">${e.calories} kcal</span>
                    <button onclick="App.removeLogEntry('${logDate}','${e.id}')" class="opacity-0 group-hover:opacity-100 text-slate-400 hover:text-red-500 transition">
                      <i class="fa-solid fa-trash-can text-sm"></i>
                    </button>
                  </div>
                </div>
              `).join('')}
            </div>
          ` : '<p class="text-slate-400 text-center py-8">No food logged yet for this day.</p>'}
        </div>

        ${(() => {
          const planned = getScheduledMealsForDate(logDate);
          const unlogged = planned.filter((s) => !s.logged).length;
          const planLabel = logDate === todayStr() ? "Today's Meal Plan" : 'Meal Plan';
          return `
        <div class="card p-6">
          <div class="flex flex-wrap items-center justify-between gap-3 mb-3">
            <h3 class="font-semibold text-slate-800 flex items-center gap-2">
              <i class="fa-solid fa-calendar-check text-emerald-500"></i> Quick Add from ${planLabel}
            </h3>
            ${unlogged ? `
              <button type="button" onclick="App.logAllPlannedForDate('${logDate}')" class="btn-primary text-sm py-1.5">
                <i class="fa-solid fa-plus"></i> Log all (${unlogged})
              </button>` : planned.length ? `
              <span class="text-xs text-emerald-600 font-medium"><i class="fa-solid fa-check mr-1"></i>All planned meals logged</span>` : ''}
          </div>
          ${planned.length ? `
          <div class="grid ${compact ? 'grid-cols-1 sm:grid-cols-2' : 'sm:grid-cols-2 lg:grid-cols-4'} gap-3">
            ${planned.map(({ meal, slot, recipe, logged }) => `
              <div class="quick-recipe-card flex items-center gap-2 ${logged ? 'quick-recipe-card-logged' : ''}">
                <div class="w-9 h-9 rounded-lg bg-emerald-50 text-emerald-600 flex items-center justify-center flex-shrink-0">
                  <i class="fa-solid ${mealIcon(meal)} text-sm"></i>
                </div>
                <button type="button" class="flex-1 text-left min-w-0" onclick="App.openRecipeModal('${recipe.id}','${meal}','${logDate}')">
                  <div class="text-xs text-slate-400 capitalize">${meal}${slot?.time ? ` · ${formatTimeDisplay(slot.time)}` : ''}</div>
                  <div class="font-medium text-slate-700 text-sm hover:text-emerald-700">${escapeHtml(recipe.name)}</div>
                  <div class="text-xs text-emerald-600 mt-0.5">${recipe.calories} kcal · ${recipe.protein}g protein</div>
                </button>
                ${logged ? `
                  <span class="text-xs font-semibold text-emerald-600 flex-shrink-0 px-2" title="Already logged">
                    <i class="fa-solid fa-check"></i>
                  </span>` : `
                  <button type="button" onclick="App.logFromRecipe('${logDate}','${recipe.id}','${meal}')" class="btn-secondary text-xs py-1.5 px-2 flex-shrink-0" title="Log to calories">
                    <i class="fa-solid fa-plus"></i>
                  </button>`}
              </div>
            `).join('')}
          </div>` : `
          <div class="text-center py-6 px-4 bg-slate-50 rounded-xl border border-dashed border-slate-200">
            <p class="text-sm text-slate-500 mb-3">No meals planned for ${logDate === todayStr() ? 'today' : 'this day'}.</p>
            <button type="button" onclick="App.switchView('planner')" class="btn-secondary text-sm">
              <i class="fa-solid fa-calendar-week"></i> Plan in Meal Prep
            </button>
          </div>`}
        </div>`;
        })()}
      </div>`;
  }

  function getPriceSourceLabel(source) {
    if (!source) return '';
    if (source === 'estimate') return 'Regional estimates';
    return StoreAPIs.API_LABELS[source] || 'Live prices';
  }

  function getPriceBadgeClass(source) {
    if (!source || source === 'estimate') return 'est';
    return source;
  }

  function renderGroceryPanel() {
    const unchecked = state.groceryList.filter((i) => !i.checked);
    const checked = state.groceryList.filter((i) => i.checked);
    const recipeItems = unchecked.filter((i) => i.source === 'recipe');
    const manualItems = unchecked.filter((i) => i.source === 'manual');
    const g = getGrocerySettings();
    const store = GROCERY_STORES.find((s) => s.id === g.favoriteStore) || GROCERY_STORES[0];
    const listTotal = GroceryPrices.calcListTotal(state.groceryList);
    const uncheckedTotal = GroceryPrices.calcListTotal(unchecked);
    const hasPrices = state.groceryList.some((i) => i.lineTotal);
    const priceLabel = g.priceSource ? getPriceSourceLabel(g.priceSource) : hasPrices ? 'Regional estimates' : '';
    const shop = state.settings.lastShopEfficiency || (recipeItems.length ? getWeekShoppingAnalysis(0) : null);
    const sharedItems = recipeItems.filter((i) => i.isShared);
    const singleItems = recipeItems.filter((i) => !i.isShared);

    return `
      <section id="meal-prep-grocery" class="scroll-mt-24 pt-8 border-t border-slate-200 space-y-6">
        <div class="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <h3 class="text-xl font-bold text-slate-800 flex items-center gap-2">
              <i class="fa-solid fa-cart-shopping text-emerald-500"></i> Grocery List
            </h3>
            <p class="text-slate-500 mt-1 flex flex-wrap items-center gap-2 text-sm">${unchecked.length} items${hasPrices ? ` · <strong class="text-emerald-600">$${uncheckedTotal.toFixed(2)}</strong> to buy` : ''} ${renderFamilyBadge()}${recipeItems.length || shop?.mealCount ? ' · <span class="text-xs text-slate-400">auto-synced from meal prep</span>' : ''}</p>
          </div>
          <div class="flex flex-wrap items-center gap-2">
            ${unchecked.length ? `
              <button onclick="App.openOrderModal()" class="btn-primary">
                <i class="fa-solid fa-bag-shopping"></i> Order
              </button>
            ` : ''}
            ${checked.length ? `<button onclick="App.clearCheckedGroceries()" class="btn-ghost text-sm">Clear checked</button>` : ''}
          </div>
        </div>

        <div class="card p-5">
          <h3 class="font-semibold text-slate-800 mb-3 flex items-center gap-2">
            <i class="fa-solid fa-location-dot text-red-500"></i> Your Store
          </h3>
          <div class="grid sm:grid-cols-3 gap-3 mb-3">
            <div>
              <label class="label">Zip code</label>
              <input id="grocery-zip" type="text" maxlength="5" pattern="[0-9]{5}" placeholder="e.g. 90210"
                value="${g.zipCode || ''}" class="input"/>
            </div>
            <div class="sm:col-span-2">
              <label class="label">Favorite store</label>
              <select id="grocery-store" class="input">
                ${GROCERY_STORES.map((s) => `
                  <option value="${s.id}" ${g.favoriteStore === s.id ? 'selected' : ''}>${s.name}</option>
                `).join('')}
              </select>
            </div>
          </div>
          <div class="flex flex-wrap gap-2 items-center">
            <button onclick="App.saveGroceryStore()" class="btn-secondary text-sm">
              <i class="fa-solid fa-floppy-disk"></i> Save location
            </button>
            ${g.zipCode ? `
              <span class="text-sm text-slate-500">
                <i class="fa-solid ${store.icon || 'fa-store'} text-emerald-500 mr-1"></i>
                ${g.storeName || store.name} near <strong>${g.zipCode}</strong>
                ${priceLabel ? ` · <span class="text-emerald-600">${priceLabel}</span>` : ''}
              </span>
            ` : '<span class="text-xs text-slate-400">Enter zip code to see local prices</span>'}
          </div>
          ${hasPrices ? `
            <div class="mt-4 p-4 bg-emerald-50 rounded-xl flex flex-wrap items-center justify-between gap-3">
              <div>
                <div class="text-xs text-emerald-600 font-semibold uppercase">Shopping total</div>
                <div class="text-2xl font-bold text-slate-800">$${listTotal.toFixed(2)}</div>
                <div class="text-xs text-slate-500">${unchecked.length} items remaining · $${uncheckedTotal.toFixed(2)} left to buy</div>
              </div>
              ${g.lastPriceUpdate ? `<div class="text-xs text-slate-400">Updated ${new Date(g.lastPriceUpdate).toLocaleString()}</div>` : ''}
            </div>
          ` : ''}
        </div>

        <div class="card p-4">
          <form onsubmit="event.preventDefault(); App.addManualFromInput()" class="flex gap-2">
            <input id="grocery-input" type="text" placeholder="Add item (e.g. Almond milk)" class="flex-1 px-4 py-3 border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-emerald-400"/>
            <button type="submit" class="btn-primary">Add</button>
          </form>
        </div>

        ${sharedItems.length ? `
          <div>
            <h3 class="text-sm font-semibold text-emerald-600 uppercase tracking-wide mb-3">
              <i class="fa-solid fa-recycle mr-1"></i> Shared staples — buy once, use ${sharedItems[0]?.mealUses || 2}+×
            </h3>
            <div class="space-y-2">
              ${sharedItems.map((item) => renderGroceryItem(item)).join('')}
            </div>
          </div>` : ''}

        ${singleItems.length ? `
          <div>
            <h3 class="text-sm font-semibold text-slate-500 uppercase tracking-wide mb-3">${sharedItems.length ? 'One-time items' : 'From meal plan'}</h3>
            <div class="space-y-2">
              ${singleItems.map((item) => renderGroceryItem(item)).join('')}
            </div>
          </div>` : ''}

        ${manualItems.length ? `
          <div>
            <h3 class="text-sm font-semibold text-slate-500 uppercase tracking-wide mb-3">Manual items</h3>
            <div class="space-y-2">
              ${manualItems.map((item) => renderGroceryItem(item)).join('')}
            </div>
          </div>` : ''}

        ${!unchecked.length ? `
          <div class="card p-12 text-center">
            <i class="fa-solid fa-cart-shopping text-4xl text-slate-200 mb-4"></i>
            <p class="text-slate-500">Your grocery list is empty.</p>
            <p class="text-sm text-slate-400 mt-1">Plan meals above, then tap <strong>Grocery list</strong> to generate.</p>
          </div>` : ''}

        ${checked.length ? `
          <div>
            <h3 class="text-sm font-semibold text-slate-400 uppercase tracking-wide mb-3">Checked off (${checked.length})</h3>
            <div class="space-y-2 opacity-60">
              ${checked.map((item) => renderGroceryItem(item)).join('')}
            </div>
          </div>` : ''}
      </section>`;
  }

  function renderGroceryItem(item) {
    const qty = item.purchaseLabel
      || (item.quantity !== 1 || item.unit !== 'item' ? `${item.quantity} ${item.unit}` : '');
    const containerMeta = typeof GroceryUnits !== 'undefined' && item.retailContainer
      ? GroceryUnits.getContainerMeta(item.retailContainer)
      : null;
    const containerBadge = containerMeta && item.retailContainer !== 'each' && !item.checked
      ? `<span class="retail-container-badge" title="Sold as ${containerMeta.label}"><i class="fa-solid ${containerMeta.icon}"></i> ${containerMeta.label}</span>`
      : '';
    const neededHint = item.neededQuantity != null && item.packSize
      ? `<div class="text-[10px] text-slate-400">${item.neededQuantity} ${item.neededUnit} needed for recipes</div>`
      : '';
    const priceBadge = item.lineTotal
      ? `<span class="grocery-price ${getPriceBadgeClass(item.priceSource)}" title="${getPriceSourceLabel(item.priceSource)}">$${item.lineTotal.toFixed(2)}</span>`
      : '';
    const productHint = item.productName && !item.checked
      ? `<div class="text-[10px] text-slate-400 truncate">${item.productName}</div>` : '';
    const useBadge = item.mealUses && !item.checked
      ? `<span class="shop-use-badge ${item.shopStatus === 'overused' ? 'over' : item.isShared ? 'shared' : ''}">${item.mealUses}× meals</span>`
      : '';
    const recipeHint = item.usedInRecipes?.length && !item.checked && item.isShared
      ? `<div class="text-[10px] text-slate-400 truncate">${item.usedInRecipes.slice(0, 2).join(', ')}${item.usedInRecipes.length > 2 ? '…' : ''}</div>`
      : '';
    return `
      <div class="grocery-item ${item.checked ? 'checked' : ''}" onclick="App.toggleGroceryItem('${item.id}')">
        <div class="checkbox ${item.checked ? 'checked' : ''}">
          ${item.checked ? '<i class="fa-solid fa-check text-xs"></i>' : ''}
        </div>
        <div class="flex-1 min-w-0">
          <div class="flex items-center gap-2 flex-wrap">
            <span class="${item.checked ? 'line-through text-slate-400' : 'text-slate-700 font-medium'}">${item.name}</span>
            ${qty ? `<span class="text-sm text-slate-400">${qty}</span>` : ''}
            ${containerBadge}
            ${useBadge}
          </div>
          ${recipeHint}
          ${neededHint}
          ${productHint}
          ${item.unitPrice && !item.checked ? `<div class="text-[10px] text-slate-400">$${item.unitPrice.toFixed(2)} per ${item.unit || 'item'}${item.priceSource === 'estimate' ? ' (est.)' : ''}</div>` : ''}
        </div>
        ${priceBadge}
        <button onclick="event.stopPropagation(); App.removeGroceryItem('${item.id}')" class="text-slate-300 hover:text-red-400 px-2">
          <i class="fa-solid fa-xmark"></i>
        </button>
      </div>`;
  }

  function saveGroceryStore() {
    const zip = document.getElementById('grocery-zip')?.value.trim();
    const store = document.getElementById('grocery-store')?.value || 'auto';
    if (zip && !/^\d{5}$/.test(zip)) {
      alert('Please enter a valid 5-digit US zip code');
      return;
    }
    state.settings.grocery = {
      ...getGrocerySettings(),
      zipCode: zip,
      favoriteStore: store,
      storeName: GROCERY_STORES.find((s) => s.id === store)?.name,
    };
    applyQuickPriceEstimates();
    saveState();
    render();
  }

  function openOrderModal() {
    const g = getGrocerySettings();
    const zip = document.getElementById('grocery-zip')?.value.trim() || g.zipCode;
    if (!zip || !/^\d{5}$/.test(zip)) {
      alert('Enter and save a valid 5-digit zip code first.');
      return;
    }
    const unchecked = state.groceryList.filter((i) => !i.checked);
    if (!unchecked.length) {
      alert('No items to order — add groceries to your list first.');
      return;
    }
    const store = GROCERY_STORES.find((s) => s.id === (g.favoriteStore || 'auto'));
    showModal(`
      <h3 class="text-lg font-bold text-slate-800 mb-1">Order Groceries</h3>
      <p class="text-sm text-slate-500 mb-4">${unchecked.length} items near <strong>${zip}</strong> · ${store?.name || 'Your store'}</p>
      <p class="text-xs text-slate-400 mb-4">Opens your store for checkout. Live APIs (Kroger, Target, Walmart) add direct product links.</p>
      <div class="grid grid-cols-2 gap-3 mb-4">
        <button onclick="App.placeGroceryOrder('pickup')" class="order-mode-btn p-4 rounded-xl border-2 border-slate-200 hover:border-emerald-400 hover:bg-emerald-50 text-left transition">
          <i class="fa-solid fa-store text-2xl text-emerald-500 mb-2"></i>
          <div class="font-semibold text-slate-800">Pickup</div>
          <div class="text-xs text-slate-500">Curbside or in-store pickup</div>
        </button>
        <button onclick="App.placeGroceryOrder('delivery')" class="order-mode-btn p-4 rounded-xl border-2 border-slate-200 hover:border-emerald-400 hover:bg-emerald-50 text-left transition">
          <i class="fa-solid fa-truck text-2xl text-blue-500 mb-2"></i>
          <div class="font-semibold text-slate-800">Delivery</div>
          <div class="text-xs text-slate-500">Delivered to your door</div>
        </button>
      </div>
      <button onclick="App.closeModal()" class="btn-ghost w-full">Cancel</button>
    `, 'modal-lg');
  }

  async function placeGroceryOrder(mode) {
    const g = getGrocerySettings();
    const zip = document.getElementById('grocery-zip')?.value.trim() || g.zipCode;
    const store = document.getElementById('grocery-store')?.value || g.favoriteStore;
    state.settings.grocery = { ...g, zipCode: zip, favoriteStore: store };
    const unchecked = state.groceryList.filter((i) => !i.checked);

    closeModal();
    showModal(`
      <div class="text-center py-8">
        <i class="fa-solid fa-spinner fa-spin text-3xl text-emerald-500 mb-4"></i>
        <p class="text-slate-600">Preparing your ${mode} order…</p>
        <p class="text-xs text-slate-400 mt-2">Finding products at your local store</p>
      </div>
    `, 'modal-lg');

    try {
      const order = await GroceryOrder.prepareOrder(unchecked, state.settings.grocery, mode);
      await GroceryOrder.copyList(unchecked, order.zip, order.storeName, mode, order.total);

      const linkRows = order.productLinks.map((p) => {
        const qty = p.purchaseLabel ? `${p.purchaseLabel} · ` : (p.quantity && p.unit !== 'item' ? `${p.quantity} ${p.unit} · ` : '');
        const price = p.price ? `$${Number(p.price).toFixed(2)}` : '';
        const label = p.productName || p.name;
        return `
          <a href="${p.url}" target="_blank" rel="noopener"
            class="flex items-center justify-between p-3 rounded-xl border border-slate-100 hover:bg-emerald-50 hover:border-emerald-200 transition">
            <div class="min-w-0 flex-1">
              <div class="font-medium text-slate-700 text-sm truncate">${label}</div>
              <div class="text-xs text-slate-400">${qty}${p.name !== label ? p.name : 'Tap to add to cart'}</div>
            </div>
            ${price ? `<span class="text-sm font-semibold text-emerald-600 ml-2">${price}</span>` : '<i class="fa-solid fa-external-link text-slate-300 ml-2"></i>'}
          </a>`;
      }).join('');

      window._lastOrder = order;
      GroceryOrder.openUrl(order.portalUrl);

      showModal(`
        <h3 class="text-lg font-bold text-slate-800 mb-1 capitalize">
          <i class="fa-solid fa-check-circle text-emerald-500 mr-1"></i> ${mode} Order Ready
        </h3>
        <p class="text-sm text-slate-500 mb-3">
          Store opened in a new tab · List copied to clipboard
          ${order.hasLiveLinks ? ` · <span class="text-emerald-600">${StoreAPIs.API_LABELS[order.provider] || 'Live'} product links</span>` : ''}
        </p>
        ${order.total ? `<div class="p-3 bg-emerald-50 rounded-xl mb-4 text-sm"><strong>Est. total:</strong> $${order.total.toFixed(2)} · ${unchecked.length} items</div>` : ''}
        <div class="flex gap-2 mb-4">
          <button onclick="App.reopenOrderPortal('store')" class="btn-primary flex-1 text-sm">
            <i class="fa-solid fa-external-link"></i> Open ${order.storeName}
          </button>
          ${mode === 'delivery' ? `<button onclick="App.reopenOrderPortal('instacart')" class="btn-secondary flex-1 text-sm">
            <i class="fa-solid fa-truck"></i> Instacart
          </button>` : ''}
        </div>
        <p class="text-xs font-semibold text-slate-500 uppercase mb-2">Add each item (${order.productLinks.length})</p>
        <div class="space-y-2 max-h-52 overflow-y-auto mb-3">${linkRows}</div>
        <p class="text-xs text-slate-400">Paste your list (already copied) into the store app, or tap items above to add them individually.</p>
        <button onclick="App.closeModal()" class="btn-ghost w-full mt-3">Done</button>
      `, 'modal-lg');
    } catch (e) {
      showModal(`
        <h3 class="text-lg font-bold text-red-600 mb-2">Order failed</h3>
        <p class="text-sm text-slate-600 mb-4">${e.message}</p>
        <button onclick="App.closeModal()" class="btn-primary w-full">OK</button>
      `);
    }
  }

  function reopenOrderPortal(which) {
    const order = window._lastOrder;
    if (!order) return;
    GroceryOrder.openUrl(which === 'instacart' ? order.instacartUrl : order.portalUrl);
  }

  async function fetchGroceryPrices() {
    const g = getGrocerySettings();
    const zip = document.getElementById('grocery-zip')?.value.trim() || g.zipCode;
    const store = document.getElementById('grocery-store')?.value || g.favoriteStore;
    if (!zip || !/^\d{5}$/.test(zip)) {
      alert('Save a valid 5-digit zip code first');
      return;
    }
    state.settings.grocery = { ...g, zipCode: zip, favoriteStore: store };
    if (!state.groceryList.length) {
      alert('Add items to your list first');
      return;
    }

    priceLoading = true;
    render();
    try {
      const result = await GroceryPrices.fetchAllPrices(state.groceryList, state.settings.grocery);
      state.groceryList = GroceryPrices.applyPricesToList(state.groceryList, result);
      state.settings.grocery = {
        ...state.settings.grocery,
        storeName: result.location?.name || GROCERY_STORES.find((s) => s.id === store)?.name,
        locationId: result.location?.locationId || '',
        lastPriceUpdate: new Date().toISOString(),
        priceSource: result.source,
      };
      saveState();
    } catch (e) {
      alert('Price lookup failed: ' + e.message);
    }
    priceLoading = false;
    render();
  }

  function renderRecipeDetailCard(detail) {
    if (!detail) {
      return `
        <div class="card p-12 text-center text-slate-400">
          <i class="fa-solid fa-book-open text-4xl mb-4 text-slate-200"></i>
          <p>Select a recipe to view details</p>
        </div>`;
    }
    return `
      <div class="card p-6">
        <div class="flex justify-between items-start mb-4 gap-3">
          <div>
            <h3 class="text-xl font-bold text-slate-800">${escapeHtml(detail.name)}</h3>
            <p class="text-slate-500 text-sm mt-1">${detail.servings} serving(s) · ${detail.prepTime} min prep</p>
          </div>
          <div class="flex items-center gap-2 flex-shrink-0">
            <button type="button" onclick="App.openRecipeModal('${detail.id}')" class="btn-secondary text-sm py-1.5 px-3">
              <i class="fa-solid fa-book-open"></i> Cook
            </button>
            <button type="button" onclick="App.deleteRecipe('${detail.id}')" class="text-slate-400 hover:text-red-500 p-1">
              <i class="fa-solid fa-trash-can"></i>
            </button>
          </div>
        </div>
        <div class="grid grid-cols-4 gap-3 mb-6">
          <div class="nutrition-pill"><div class="text-lg font-bold text-orange-600">${detail.calories}</div><div class="text-xs text-slate-400">Calories</div></div>
          <div class="nutrition-pill"><div class="text-lg font-bold text-blue-600">${detail.protein}g</div><div class="text-xs text-slate-400">Protein</div></div>
          <div class="nutrition-pill"><div class="text-lg font-bold text-amber-600">${detail.carbs}g</div><div class="text-xs text-slate-400">Carbs</div></div>
          <div class="nutrition-pill"><div class="text-lg font-bold text-rose-600">${detail.fat}g</div><div class="text-xs text-slate-400">Fat</div></div>
        </div>
        <div class="grid md:grid-cols-2 gap-6">
          <div>
            <h4 class="font-semibold text-slate-700 mb-3">Ingredients</h4>
            <ul class="space-y-2">
              ${detail.ingredients.map((ing) => `
                <li class="flex items-center gap-2 text-sm text-slate-600">
                  <i class="fa-solid fa-circle text-[4px] text-emerald-400"></i>
                  ${ing.quantity} ${ing.unit} ${ing.name}
                </li>
              `).join('')}
            </ul>
          </div>
          <div>
            <h4 class="font-semibold text-slate-700 mb-3 flex items-center gap-2">
              <i class="fa-solid fa-shoe-prints text-orange-500"></i> Step-by-step instructions
            </h4>
            ${formatInstructions(detail.instructions, detail)}
          </div>
        </div>
      </div>`;
  }

  function renderRecipeLibraryPanel(opts = {}) {
    const compact = opts.compact;
    const filtered = filterAllowedRecipes(state.recipes);
    const detail = selectedRecipeId ? getRecipe(selectedRecipeId) : null;
    const visibleCount = recipeLibraryCategory === 'all'
      ? filtered.length
      : filtered.filter((r) => recipeInLibraryCategory(r, recipeLibraryCategory)).length;

    return `
      <div class="space-y-4 recipe-library-panel" onclick="event.stopPropagation()">
        <div class="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          ${renderRecipeCategoryBar(filtered)}
          <button type="button" onclick="App.openAddRecipeModal()" class="btn-primary text-sm flex-shrink-0 self-end sm:self-auto">
            <i class="fa-solid fa-plus"></i> Add recipe
          </button>
        </div>

        <div class="grid ${compact ? 'grid-cols-1 gap-4' : 'lg:grid-cols-3 gap-6'}">
          <div class="${compact ? '' : 'lg:col-span-1 '}space-y-4 max-h-[55vh] overflow-y-auto pr-1">
            <p class="text-xs text-slate-400 sticky top-0 bg-white/95 backdrop-blur-sm py-1 z-10">
              Showing ${visibleCount} recipe${visibleCount === 1 ? '' : 's'}${recipeLibraryCategory !== 'all' ? ` in <span class="capitalize font-medium text-slate-600">${recipeLibraryCategory}</span>` : ''}
            </p>
            ${renderRecipeListContent(filtered)}
          </div>

          <div class="${compact ? '' : 'lg:col-span-2 '}min-w-0">
            ${renderRecipeDetailCard(detail)}
          </div>
        </div>
      </div>`;
  }

  function getProfile() {
    return { ...NutritionCalc.DEFAULT_PROFILE, ...state.settings.profile };
  }

  function getFamily() {
    return FamilySettings.normalize(state.settings.family);
  }

  function getFamilyMultiplier() {
    return FamilySettings.getMultiplier(getFamily());
  }

  function renderFamilyBadge() {
    const summary = FamilySettings.getSummary(getFamily());
    if (summary.multiplier <= 1) return '';
    return `<span class="family-badge" title="${escapeHtml(summary.label)}"><i class="fa-solid fa-users"></i> ${escapeHtml(summary.detail)}</span>`;
  }

  function previewFamilySettings() {
    const family = FamilySettings.readFromForm();
    const adults = Number(document.getElementById('family-adults')?.value) || 0;
    const kids = Number(document.getElementById('family-kids')?.value) || 0;
    const presetEl = document.getElementById('family-preset');
    const currentPreset = FamilySettings.PRESETS.find((p) => p.id === presetEl?.value);
    if (currentPreset && currentPreset.id !== 'custom'
      && (currentPreset.adults !== adults || currentPreset.kids !== kids)) {
      if (presetEl) presetEl.value = 'custom';
      document.querySelectorAll('.family-preset-btn').forEach((btn) => {
        btn.classList.toggle('active', btn.dataset.preset === 'custom');
      });
    }
    const summary = FamilySettings.getSummary(family);
    const el = document.getElementById('family-preview');
    if (!el) return;
    if (!family.enabled) {
      el.innerHTML = '<p class="text-sm text-slate-500">Family mode off — recipes and groceries are for 1 person.</p>';
      return;
    }
    el.innerHTML = `
      <div class="p-3 bg-violet-50 rounded-xl border border-violet-100">
        <div class="text-sm font-semibold text-violet-800">${escapeHtml(summary.label)}</div>
        <div class="text-lg font-bold text-slate-800 mt-1">${escapeHtml(summary.detail)}</div>
        <p class="text-xs text-slate-500 mt-1">Grocery amounts & recipe ingredients scale automatically. Calorie log stays per-person.</p>
      </div>`;
  }

  function saveFamilySettings() {
    updateSettings({ family: FamilySettings.readFromForm() });
    syncGroceryFromMealPlan(0);
  }

  function renderBanChip(term, kind) {
    const cls = kind === 'allergy' ? 'ban-chip-allergy' : 'ban-chip-dislike';
    const attr = kind === 'allergy' ? 'data-ban-allergy' : 'data-ban-dislike';
    return `<span class="ban-chip ${cls}" ${attr}="${escapeHtml(term)}">
      ${escapeHtml(term)}
      <button type="button" data-ban-kind="${kind}" data-ban-term="${escapeHtml(term)}"
        onclick="App.removeBanItem(this.dataset.banKind, this.dataset.banTerm)" aria-label="Remove">
        <i class="fa-solid fa-xmark text-xs"></i>
      </button>
    </span>`;
  }

  function previewBanList() {
    const el = document.getElementById('ban-preview');
    if (!el) return;
    const ban = BanList.readFromForm();
    const hidden = BanList.countBanned(state.recipes, ban);
    const allergyCount = ban.allergies.length;
    const dislikeCount = ban.dislikes.length;
    if (!allergyCount && !dislikeCount) {
      el.innerHTML = '<p class="text-sm text-slate-500">No banned foods yet — all recipes are available.</p>';
      return;
    }
    el.innerHTML = `
      <div class="p-3 bg-amber-50 rounded-xl border border-amber-100">
        <div class="text-sm font-semibold text-amber-800">${hidden} recipe${hidden !== 1 ? 's' : ''} will be hidden</div>
        <p class="text-xs text-slate-500 mt-1">${allergyCount} allerg${allergyCount === 1 ? 'y' : 'ies'} · ${dislikeCount} dislike${dislikeCount !== 1 ? 's' : ''} — auto-fill and meal picker skip matching recipes.</p>
      </div>`;
  }

  function addBanItem(kind) {
    const inputId = kind === 'allergy' ? 'ban-allergy-input' : 'ban-dislike-input';
    const raw = document.getElementById(inputId)?.value || '';
    const terms = BanList.parseInput(raw);
    if (!terms.length) return;
    const ban = getBanList();
    const list = kind === 'allergy' ? ban.allergies : ban.dislikes;
    terms.forEach((t) => { if (!list.some((x) => x.toLowerCase() === t.toLowerCase())) list.push(t); });
    state.settings.banList = ban;
    saveState();
    render();
  }

  function quickAddBan(kind, term) {
    const ban = getBanList();
    const list = kind === 'allergy' ? ban.allergies : ban.dislikes;
    const suggestion = (kind === 'allergy' ? BanList.ALLERGY_SUGGESTIONS : BanList.DISLIKE_SUGGESTIONS)
      .find((s) => s.id === term);
    const label = suggestion?.label || term;
    if (!list.some((x) => x.toLowerCase() === label.toLowerCase())) list.push(label);
    state.settings.banList = ban;
    saveState();
    render();
  }

  function removeBanItem(kind, term) {
    const ban = getBanList();
    const list = kind === 'allergy' ? ban.allergies : ban.dislikes;
    const idx = list.findIndex((x) => x === term);
    if (idx >= 0) list.splice(idx, 1);
    state.settings.banList = ban;
    saveState();
    render();
  }

  function scrubBannedMealsFromPlan() {
    const ban = getBanList();
    let removed = 0;
    Object.keys(state.mealPlan).forEach((date) => {
      MEAL_TYPES.forEach((meal) => {
        const slot = state.mealPlan[date]?.[meal];
        if (!slot?.recipeId) return;
        const recipe = getRecipe(slot.recipeId);
        if (recipe && BanList.isRecipeBanned(recipe, ban)) {
          delete state.mealPlan[date][meal];
          removed += 1;
        }
      });
    });
    return removed;
  }

  function saveBanListSettings() {
    const ban = BanList.readFromForm();
    const prevHidden = BanList.countBanned(state.recipes, getBanList());
    state.settings.banList = ban;
    const newHidden = BanList.countBanned(state.recipes, ban);
    const removed = scrubBannedMealsFromPlan();
    saveState();
    syncGroceryFromMealPlan(0);
    if (removed > 0) {
      alert(`Ban list saved.\n\n${removed} planned meal${removed !== 1 ? 's' : ''} with banned ingredients were removed from your meal plan.`);
    } else if (newHidden > prevHidden) {
      alert(`Ban list saved.\n\n${newHidden} recipe${newHidden !== 1 ? 's' : ''} are now hidden from auto-fill and meal picker.`);
    }
    render();
  }

  function selectFamilyPreset(presetId) {
    const p = FamilySettings.PRESETS.find((x) => x.id === presetId);
    const enabled = document.getElementById('family-enabled');
    if (enabled) enabled.checked = true;
    if (p && presetId !== 'custom') {
      const adults = document.getElementById('family-adults');
      const kids = document.getElementById('family-kids');
      if (adults) adults.value = p.adults;
      if (kids) kids.value = p.kids;
    }
    const presetEl = document.getElementById('family-preset');
    if (presetEl) presetEl.value = presetId;
    document.querySelectorAll('.family-preset-btn').forEach((btn) => {
      btn.classList.toggle('active', btn.dataset.preset === presetId);
    });
    previewFamilySettings();
  }

  function addFamilyMember() {
    const f = getFamily();
    f.members = f.members || [];
    f.members.push({ id: uid(), name: '', type: 'adult', portion: 1 });
    f.enabled = true;
    state.settings.family = f;
    saveState();
    render();
  }

  function removeFamilyMember(id) {
    const f = getFamily();
    f.members = (f.members || []).filter((m) => m.id !== id);
    state.settings.family = f;
    saveState();
    render();
  }

  function previewNutritionGoals(presetId) {
    const profile = NutritionCalc.readProfileFromForm();
    const calc = NutritionCalc.calculate(profile, presetId || profile.goalPreset);
    const el = document.getElementById('nutrition-preview');
    if (!el) return calc;
    el.innerHTML = `
      <div class="grid grid-cols-2 gap-2 text-sm">
        <div class="p-2 bg-slate-50 rounded-lg"><span class="text-slate-400 text-xs">BMR</span><div class="font-bold text-slate-700">${calc.bmr} kcal</div></div>
        <div class="p-2 bg-slate-50 rounded-lg"><span class="text-slate-400 text-xs">Maintenance (TDEE)</span><div class="font-bold text-slate-700">${calc.tdee} kcal</div></div>
      </div>
      <div class="mt-3 p-3 bg-emerald-50 rounded-xl border border-emerald-100">
        <div class="text-xs font-semibold text-emerald-700 uppercase mb-1">${calc.preset?.label || 'Your goal'}</div>
        <div class="text-2xl font-bold text-slate-800">${calc.calories} <span class="text-sm font-normal text-slate-500">kcal/day</span></div>
        <div class="flex flex-wrap gap-3 mt-2 text-sm text-slate-600">
          <span><strong class="text-blue-600">${calc.protein}g</strong> protein</span>
          <span><strong class="text-amber-600">${calc.carbs}g</strong> carbs</span>
          <span><strong class="text-rose-600">${calc.fat}g</strong> fat</span>
        </div>
        <div class="text-[10px] text-slate-400 mt-1">${calc.proteinPct}% protein · ${calc.carbsPct}% carbs · ${calc.fatPct}% fat</div>
      </div>`;
    return calc;
  }

  function selectNutritionPreset(presetId) {
    const hidden = document.getElementById('set-goal-preset');
    if (hidden) hidden.value = presetId;
    document.querySelectorAll('.goal-preset-btn').forEach((btn) => {
      btn.classList.toggle('active', btn.dataset.preset === presetId);
    });
    previewNutritionGoals(presetId);
  }

  function applyNutritionPreset() {
    const profile = NutritionCalc.readProfileFromForm();
    const presetId = document.getElementById('set-goal-preset')?.value || profile.goalPreset;
    const calc = NutritionCalc.calculate(profile, presetId);
    const cal = document.getElementById('set-calories');
    const pro = document.getElementById('set-protein');
    const carb = document.getElementById('set-carbs');
    const fat = document.getElementById('set-fat');
    if (cal) cal.value = calc.calories;
    if (pro) pro.value = calc.protein;
    if (carb) carb.value = calc.carbs;
    if (fat) fat.value = calc.fat;
    state.settings.profile = { ...profile, goalPreset: presetId };
    previewNutritionGoals(presetId);
  }

  function renderSettings() {
    const s = state.settings;
    const profile = getProfile();
    const calc = NutritionCalc.calculate(profile, profile.goalPreset);
    const session = typeof Auth !== 'undefined' ? Auth.getSession() : null;
    const cloudEnabled = typeof Auth !== 'undefined' && Auth.isCloudEnabled();
    return `
      <div class="view-enter space-y-6 max-w-lg">
        <div>
          <h2 class="text-2xl font-bold text-slate-800">Settings</h2>
          <p class="text-slate-500 mt-1">Account, goals & sync</p>
        </div>

        <div class="card p-6 space-y-4">
          <h3 class="font-semibold text-slate-800 flex items-center gap-2">
            <i class="fa-solid fa-user text-emerald-500"></i> Account
          </h3>
          ${session ? `
            <div class="flex items-center gap-3 p-3 bg-emerald-50 rounded-xl">
              <div class="w-10 h-10 rounded-full bg-emerald-500 text-white flex items-center justify-center font-bold">
                ${(session.name || session.email || '?')[0].toUpperCase()}
              </div>
              <div class="flex-1 min-w-0">
                <div class="font-medium text-slate-800 truncate">${session.name || 'User'}</div>
                <div class="text-xs text-slate-500 truncate">${session.email}</div>
              </div>
            </div>
            <div class="flex items-center gap-2 text-xs text-slate-500">
              <i class="fa-solid fa-cloud${session.cloud ? '' : '-arrow-up'}"></i>
              ${typeof Auth !== 'undefined' ? Auth.getSyncStatusLabel() : 'Local'}
            </div>
            <button onclick="App.signOutUser()" class="btn-ghost w-full text-red-500">Sign out</button>
          ` : `
            <p class="text-sm text-slate-500">Sign in to sync across devices${cloudEnabled ? ' (cloud enabled)' : ''}.</p>
            <button onclick="App.openAuthModal('signin')" class="btn-primary w-full">Sign in</button>
            <button onclick="App.openAuthModal('signup')" class="btn-secondary w-full">Create account</button>
          `}
        </div>

        <div class="card p-6 space-y-3">
          <h3 class="font-semibold text-slate-800 flex items-center gap-2">
            <i class="fa-solid fa-arrows-rotate text-blue-500"></i> Backup & Sync
          </h3>
          <button onclick="App.exportBackup()" class="btn-secondary w-full">
            <i class="fa-solid fa-download"></i> Export backup
          </button>
          <label class="btn-secondary w-full cursor-pointer text-center">
            <i class="fa-solid fa-upload"></i> Import backup
            <input type="file" accept=".json" class="hidden" onchange="App.importBackup(event)"/>
          </label>
          ${session?.cloud ? `<button onclick="App.syncNow()" class="btn-ghost w-full text-sm"><i class="fa-solid fa-cloud"></i> Sync now</button>` : ''}
          ${!cloudEnabled ? `<p class="text-xs text-slate-400">Enable Firebase in config.local.js for cloud accounts.</p>` : ''}
          ${cloudEnabled && typeof Billing !== 'undefined' && !Billing.isPro() ? `<p class="text-xs text-amber-600">Cloud sync requires PlatePlanr Pro.</p>` : ''}
        </div>

        ${typeof Billing !== 'undefined' ? (() => {
          const isPro = Billing.isPro();
          const stripeOn = Billing.isStripeEnabled();
          const features = (APP_CONFIG.proFeatures || []).map((f) => `<li class="flex items-start gap-2"><i class="fa-solid fa-check text-emerald-500 mt-0.5 text-xs"></i><span>${f}</span></li>`).join('');
          return `
        <div class="card p-6 space-y-4 border-2 ${isPro ? 'border-emerald-200 bg-emerald-50/30' : 'border-slate-100'}">
          <div class="flex items-center justify-between gap-2">
            <h3 class="font-semibold text-slate-800 flex items-center gap-2">
              <i class="fa-solid fa-crown text-amber-500"></i> PlatePlanr Pro
            </h3>
            <span class="text-xs font-bold uppercase tracking-wide px-2.5 py-1 rounded-full ${isPro ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-100 text-slate-500'}">${Billing.getPlanLabel()}</span>
          </div>
          <ul class="text-sm text-slate-600 space-y-1.5">${features}</ul>
          ${isPro ? `
            <button type="button" onclick="App.manageSubscription()" class="btn-secondary w-full">
              <i class="fa-solid fa-credit-card"></i> Manage subscription
            </button>
          ` : `
            <p class="text-xs text-slate-500">Sign in with a cloud account, then upgrade. Meal planning stays free.</p>
            <button type="button" onclick="App.upgradeToPro()" class="btn-primary w-full" ${!stripeOn ? 'disabled title="Add Stripe price ID in config"' : ''}>
              <i class="fa-solid fa-bolt"></i> Upgrade to Pro${stripeOn && APP_CONFIG.stripe?.proPriceLabel ? ` — ${APP_CONFIG.stripe.proPriceLabel}` : ''}
            </button>
            ${!stripeOn ? '<p class="text-xs text-slate-400">Add stripe.priceId in config.local.js (or Netlify env vars).</p>' : ''}
          `}
        </div>`;
        })() : ''}

        <div class="card p-6 space-y-4">
          <h3 class="font-semibold text-slate-800 flex items-center gap-2">
            <i class="fa-solid fa-bullseye text-emerald-500"></i> Nutrition Goals
          </h3>
          <div>
            <label class="label">Display name</label>
            <input id="set-name" type="text" value="${escapeHtml(s.name)}" class="input"/>
          </div>

          <div class="p-4 bg-slate-50 rounded-xl space-y-3 border border-slate-100">
            <div class="text-xs font-semibold text-slate-500 uppercase tracking-wide">Your info — for calculated presets</div>
            <div class="grid grid-cols-2 gap-3">
              <div>
                <label class="label">Sex</label>
                <select id="set-sex" class="input" onchange="App.previewNutritionGoals()">
                  <option value="female" ${profile.sex === 'female' ? 'selected' : ''}>Female</option>
                  <option value="male" ${profile.sex === 'male' ? 'selected' : ''}>Male</option>
                </select>
              </div>
              <div>
                <label class="label">Age</label>
                <input id="set-age" type="number" min="14" max="99" value="${profile.age}" class="input" oninput="App.previewNutritionGoals()"/>
              </div>
            </div>
            <div class="grid grid-cols-2 gap-3">
              <div>
                <label class="label">Weight (lbs)</label>
                <input id="set-weight" type="number" min="80" max="500" value="${profile.weightLbs}" class="input" oninput="App.previewNutritionGoals()"/>
              </div>
              <div>
                <label class="label">Height</label>
                <div class="flex gap-2">
                  <input id="set-height-ft" type="number" min="4" max="7" value="${profile.heightFt}" class="input w-16" oninput="App.previewNutritionGoals()"/>
                  <span class="self-center text-slate-400 text-sm">ft</span>
                  <input id="set-height-in" type="number" min="0" max="11" value="${profile.heightIn}" class="input w-16" oninput="App.previewNutritionGoals()"/>
                  <span class="self-center text-slate-400 text-sm">in</span>
                </div>
              </div>
            </div>
            <div>
              <label class="label">Activity level</label>
              <select id="set-activity" class="input" onchange="App.previewNutritionGoals()">
                ${NutritionCalc.ACTIVITY_LEVELS.map((a) => `
                  <option value="${a.id}" ${profile.activity === a.id ? 'selected' : ''}>${a.label} — ${a.desc}</option>
                `).join('')}
              </select>
            </div>
            <input type="hidden" id="set-goal-preset" value="${profile.goalPreset}"/>
          </div>

          <div>
            <div class="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-2">Goal preset</div>
            <div class="grid grid-cols-2 sm:grid-cols-3 gap-2">
              ${NutritionCalc.GOAL_PRESETS.map((g) => `
                <button type="button" data-preset="${g.id}" onclick="App.selectNutritionPreset('${g.id}')"
                  class="goal-preset-btn text-left p-2.5 rounded-xl border border-slate-200 hover:border-emerald-300 transition ${profile.goalPreset === g.id ? 'active' : ''}">
                  <i class="fa-solid ${g.icon} text-emerald-500 text-sm"></i>
                  <div class="font-semibold text-slate-800 text-sm mt-1">${g.label}</div>
                  <div class="text-[10px] text-slate-400 leading-tight">${g.desc}</div>
                </button>
              `).join('')}
            </div>
          </div>

          <div id="nutrition-preview">
            <div class="grid grid-cols-2 gap-2 text-sm">
              <div class="p-2 bg-slate-50 rounded-lg"><span class="text-slate-400 text-xs">BMR</span><div class="font-bold text-slate-700">${calc.bmr} kcal</div></div>
              <div class="p-2 bg-slate-50 rounded-lg"><span class="text-slate-400 text-xs">Maintenance (TDEE)</span><div class="font-bold text-slate-700">${calc.tdee} kcal</div></div>
            </div>
            <div class="mt-3 p-3 bg-emerald-50 rounded-xl border border-emerald-100">
              <div class="text-xs font-semibold text-emerald-700 uppercase mb-1">${calc.preset?.label || 'Your goal'}</div>
              <div class="text-2xl font-bold text-slate-800">${calc.calories} <span class="text-sm font-normal text-slate-500">kcal/day</span></div>
              <div class="flex flex-wrap gap-3 mt-2 text-sm text-slate-600">
                <span><strong class="text-blue-600">${calc.protein}g</strong> protein</span>
                <span><strong class="text-amber-600">${calc.carbs}g</strong> carbs</span>
                <span><strong class="text-rose-600">${calc.fat}g</strong> fat</span>
              </div>
              <div class="text-[10px] text-slate-400 mt-1">${calc.proteinPct}% protein · ${calc.carbsPct}% carbs · ${calc.fatPct}% fat</div>
            </div>
          </div>

          <button type="button" onclick="App.applyNutritionPreset()" class="btn-secondary w-full">
            <i class="fa-solid fa-calculator"></i> Apply preset to goals below
          </button>

          <div class="border-t border-slate-100 pt-4 space-y-3">
            <div class="text-xs font-semibold text-slate-500 uppercase tracking-wide">Daily targets (editable)</div>
            <div>
              <label class="label">Daily calorie goal</label>
              <input id="set-calories" type="number" value="${s.calorieGoal}" class="input"/>
            </div>
            <div class="grid grid-cols-3 gap-3">
              <div>
                <label class="label">Protein (g)</label>
                <input id="set-protein" type="number" value="${s.proteinGoal}" class="input"/>
              </div>
              <div>
                <label class="label">Carbs (g)</label>
                <input id="set-carbs" type="number" value="${s.carbsGoal}" class="input"/>
              </div>
              <div>
                <label class="label">Fat (g)</label>
                <input id="set-fat" type="number" value="${s.fatGoal}" class="input"/>
              </div>
            </div>
          </div>

          <button onclick="App.saveSettingsFromForm()" class="btn-primary w-full">Save goals</button>
        </div>

        ${(() => {
          const fam = getFamily();
          const summary = FamilySettings.getSummary(fam);
          return `
        <div class="card p-6 space-y-4">
          <h3 class="font-semibold text-slate-800 flex items-center gap-2">
            <i class="fa-solid fa-users text-violet-500"></i> Family & Household
          </h3>
          <p class="text-sm text-slate-500">Scale groceries and recipe amounts for everyone at the table. Your calorie log stays personal.</p>

          <label class="flex items-center gap-3 p-3 rounded-xl border border-slate-200 cursor-pointer hover:bg-violet-50 transition">
            <input type="checkbox" id="family-enabled" class="w-5 h-5 rounded accent-violet-600"
              ${fam.enabled ? 'checked' : ''} onchange="App.previewFamilySettings()"/>
            <div>
              <div class="font-medium text-slate-800">Plan meals for my household</div>
              <div class="text-xs text-slate-400">Auto-scale ingredients on grocery list & recipes</div>
            </div>
          </label>

          <div>
            <div class="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-2">Quick presets</div>
            <div class="grid grid-cols-2 sm:grid-cols-3 gap-2">
              ${FamilySettings.PRESETS.map((p) => `
                <button type="button" data-preset="${p.id}" onclick="App.selectFamilyPreset('${p.id}')"
                  class="family-preset-btn text-left p-2.5 rounded-xl border border-slate-200 hover:border-violet-300 transition ${fam.preset === p.id && fam.enabled ? 'active' : ''}">
                  <i class="fa-solid ${p.icon} text-violet-500 text-sm"></i>
                  <div class="font-semibold text-slate-800 text-sm mt-1">${p.label}</div>
                </button>
              `).join('')}
            </div>
            <input type="hidden" id="family-preset" value="${fam.preset}"/>
          </div>

          <div class="grid grid-cols-2 gap-3">
            <div>
              <label class="label">Adults</label>
              <input id="family-adults" type="number" min="1" max="8" value="${fam.adults}" class="input" oninput="App.previewFamilySettings()"/>
            </div>
            <div>
              <label class="label">Kids</label>
              <input id="family-kids" type="number" min="0" max="8" value="${fam.kids}" class="input" oninput="App.previewFamilySettings()"/>
            </div>
          </div>
          <div>
            <label class="label">Kid portion size</label>
            <select id="family-kid-portion" class="input" onchange="App.previewFamilySettings()">
              ${FamilySettings.KID_PORTION_OPTIONS.map((o) => `
                <option value="${o.value}" ${fam.kidPortion === o.value ? 'selected' : ''}>${o.label}</option>
              `).join('')}
            </select>
          </div>

          <div>
            <div class="flex items-center justify-between mb-2">
              <label class="label mb-0">Named members (optional)</label>
              <button type="button" onclick="App.addFamilyMember()" class="text-xs text-violet-600 hover:underline">+ Add</button>
            </div>
            ${(fam.members || []).length ? `
              <div class="space-y-2">
                ${fam.members.map((m) => `
                  <div class="flex gap-2 items-center" data-family-member="${m.id}">
                    <input class="family-member-name input flex-1 text-sm" placeholder="Name" value="${escapeHtml(m.name || '')}" oninput="App.previewFamilySettings()"/>
                    <select class="family-member-type input w-24 text-sm" onchange="App.previewFamilySettings()">
                      <option value="adult" ${m.type === 'adult' ? 'selected' : ''}>Adult</option>
                      <option value="teen" ${m.type === 'teen' ? 'selected' : ''}>Teen</option>
                      <option value="kid" ${m.type === 'kid' ? 'selected' : ''}>Kid</option>
                    </select>
                    <button type="button" onclick="App.removeFamilyMember('${m.id}')" class="text-slate-400 hover:text-red-500 p-1"><i class="fa-solid fa-xmark"></i></button>
                  </div>
                `).join('')}
              </div>
              <p class="text-[10px] text-slate-400 mt-1">Named members override adult/kid counts when listed.</p>
            ` : '<p class="text-xs text-slate-400">Add names to personalize, or use adult/kid counts above.</p>'}
          </div>

          <div id="family-preview">
            ${fam.enabled ? `
              <div class="p-3 bg-violet-50 rounded-xl border border-violet-100">
                <div class="text-sm font-semibold text-violet-800">${escapeHtml(summary.label)}</div>
                <div class="text-lg font-bold text-slate-800 mt-1">${escapeHtml(summary.detail)}</div>
                <p class="text-xs text-slate-500 mt-1">Grocery amounts & recipe ingredients scale automatically.</p>
              </div>` : '<p class="text-sm text-slate-500">Family mode off — recipes and groceries are for 1 person.</p>'}
          </div>

          <button type="button" onclick="App.saveFamilySettings()" class="btn-primary w-full">Save family settings</button>
        </div>`;
        })()}

        ${(() => {
          const ban = getBanList();
          const hidden = BanList.countBanned(state.recipes, ban);
          return `
        <div class="card p-6 space-y-4">
          <h3 class="font-semibold text-slate-800 flex items-center gap-2">
            <i class="fa-solid fa-ban text-red-500"></i> Allergies & Food Dislikes
          </h3>
          <p class="text-sm text-slate-500">Recipes with banned ingredients are hidden from auto-fill, meal picker, and the recipe library. Planned meals with banned items are removed when you save.</p>

          <div class="space-y-3">
            <div>
              <label class="label text-red-700"><i class="fa-solid fa-triangle-exclamation mr-1"></i> Allergies</label>
              <div class="flex flex-wrap gap-2 mb-2 min-h-[1.5rem]">
                ${ban.allergies.length ? ban.allergies.map((t) => renderBanChip(t, 'allergy')).join('') : '<span class="text-xs text-slate-400">None added</span>'}
              </div>
              <div class="flex gap-2">
                <input id="ban-allergy-input" type="text" class="input flex-1" placeholder="e.g. peanuts, dairy, shellfish"
                  onkeydown="if(event.key==='Enter'){event.preventDefault();App.addBanItem('allergy')}"/>
                <button type="button" onclick="App.addBanItem('allergy')" class="btn-secondary whitespace-nowrap">Add</button>
              </div>
              <div class="flex flex-wrap gap-1.5 mt-2">
                ${BanList.ALLERGY_SUGGESTIONS.map((s) => `
                  <button type="button" onclick="App.quickAddBan('allergy','${s.id}')"
                    class="ban-suggest-btn ${ban.allergies.some((x) => x.toLowerCase() === s.label.toLowerCase()) ? 'added' : ''}">${s.label}</button>
                `).join('')}
              </div>
            </div>

            <div class="border-t border-slate-100 pt-3">
              <label class="label text-amber-700"><i class="fa-solid fa-face-frown mr-1"></i> Food dislikes</label>
              <div class="flex flex-wrap gap-2 mb-2 min-h-[1.5rem]">
                ${ban.dislikes.length ? ban.dislikes.map((t) => renderBanChip(t, 'dislike')).join('') : '<span class="text-xs text-slate-400">None added</span>'}
              </div>
              <div class="flex gap-2">
                <input id="ban-dislike-input" type="text" class="input flex-1" placeholder="e.g. cilantro, mushrooms, spicy"
                  onkeydown="if(event.key==='Enter'){event.preventDefault();App.addBanItem('dislike')}"/>
                <button type="button" onclick="App.addBanItem('dislike')" class="btn-secondary whitespace-nowrap">Add</button>
              </div>
              <div class="flex flex-wrap gap-1.5 mt-2">
                ${BanList.DISLIKE_SUGGESTIONS.map((s) => `
                  <button type="button" onclick="App.quickAddBan('dislike','${s.id}')"
                    class="ban-suggest-btn ${ban.dislikes.some((x) => x.toLowerCase() === s.label.toLowerCase()) ? 'added' : ''}">${s.label}</button>
                `).join('')}
              </div>
            </div>
          </div>

          <div id="ban-preview">
            ${ban.allergies.length || ban.dislikes.length ? `
              <div class="p-3 bg-amber-50 rounded-xl border border-amber-100">
                <div class="text-sm font-semibold text-amber-800">${hidden} recipe${hidden !== 1 ? 's' : ''} will be hidden</div>
                <p class="text-xs text-slate-500 mt-1">${ban.allergies.length} allerg${ban.allergies.length === 1 ? 'y' : 'ies'} · ${ban.dislikes.length} dislike${ban.dislikes.length !== 1 ? 's' : ''}</p>
              </div>` : '<p class="text-sm text-slate-500">No banned foods yet — all recipes are available.</p>'}
          </div>

          <button type="button" onclick="App.saveBanListSettings()" class="btn-primary w-full">Save ban list</button>
        </div>`;
        })()}

        ${(() => {
          const defaultStyle = 'smart-shop';
          const weekOpts = [-1, 0, 1, 2].map((off) => {
            const { name, range } = getWeekRangeLabel(off);
            return { off, name, range };
          });
          const monthOpts = [-1, 0, 1, 2].map((off) => {
            const { name, range } = getMonthRangeLabel(off);
            return { off, name, range };
          });
          return `
        <div class="card p-6 space-y-4">
          <h3 class="font-semibold text-slate-800 flex items-center gap-2">
            <i class="fa-solid fa-calendar-week text-emerald-500"></i> Auto-fill Planning
          </h3>
          <p class="text-sm text-slate-500">Plan a full week or month from Settings. Grocery list auto-syncs for this week.</p>

          <div>
            <label class="label">Fill range</label>
            <input type="hidden" id="settings-autofill-scope" value="week"/>
            <div class="reuse-toggle flex gap-1 p-1 bg-slate-100 rounded-xl">
              <button type="button" data-scope="week" onclick="App.setAutofillScope('week')"
                class="settings-autofill-scope-btn reuse-toggle-btn flex-1 text-sm py-2 px-3 rounded-lg transition active">Week</button>
              <button type="button" data-scope="month" onclick="App.setAutofillScope('month')"
                class="settings-autofill-scope-btn reuse-toggle-btn flex-1 text-sm py-2 px-3 rounded-lg transition">Month</button>
            </div>
          </div>

          <div id="settings-autofill-week-wrap">
            <label class="label">Which week</label>
            <select id="settings-autofill-week" class="input">
              ${weekOpts.map((w) => `
                <option value="${w.off}" ${w.off === 0 ? 'selected' : ''}>${w.name} (${w.range})</option>
              `).join('')}
            </select>
          </div>

          <div id="settings-autofill-month-wrap" class="hidden">
            <label class="label">Which month</label>
            <select id="settings-autofill-month" class="input">
              ${monthOpts.map((m) => `
                <option value="${m.off}" ${m.off === 0 ? 'selected' : ''}>${m.name} (${m.range})</option>
              `).join('')}
            </select>
          </div>

          <div>
            <div class="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-2">Meal style</div>
            <input type="hidden" id="settings-autofill-style" value="${defaultStyle}"/>
            <div class="grid grid-cols-2 gap-2">
              ${MEAL_PLAN_STYLES.map((s) => `
                <button type="button" data-style="${s.id}" onclick="App.selectAutoFillStyle('${s.id}')"
                  class="autofill-style-btn text-left p-2.5 rounded-xl border border-slate-200 hover:border-emerald-300 transition ${s.id === defaultStyle ? 'active' : ''}">
                  <i class="fa-solid ${s.icon} text-emerald-500 text-sm"></i>
                  <div class="font-semibold text-slate-800 text-sm mt-1">${s.name}</div>
                  <div class="text-[10px] text-slate-400 leading-tight">${s.desc}</div>
                </button>
              `).join('')}
            </div>
          </div>

          <div>
            <div id="settings-autofill-mode-label" class="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-2">If week already has meals</div>
            <div class="space-y-2">
              <label class="flex items-center gap-2 text-sm text-slate-600 cursor-pointer">
                <input type="radio" name="settings-autofill-mode" value="replace" checked class="accent-emerald-600"/>
                Replace all meals
              </label>
              <label class="flex items-center gap-2 text-sm text-slate-600 cursor-pointer">
                <input type="radio" name="settings-autofill-mode" value="fill-empty" class="accent-emerald-600"/>
                Only fill empty slots
              </label>
            </div>
          </div>

          <div id="settings-autofill-info" class="p-3 bg-slate-50 rounded-xl border border-slate-100 text-xs text-slate-500">
            <i class="fa-solid fa-circle-info text-emerald-500 mr-1"></i>
            Plans ${MEAL_TYPES.length} meals × 7 days · target ${s.calorieGoal} kcal/day · respects allergies &amp; ban list
          </div>

          <button type="button" id="settings-autofill-run-btn" onclick="App.runAutoFillFromSettings()" class="btn-primary w-full">
            <i class="fa-solid fa-wand-magic-sparkles"></i> Auto-fill week
          </button>
          <button type="button" id="settings-autofill-clear-btn" onclick="App.clearPlanFromSettings()" class="btn-ghost w-full text-red-500 text-sm">
            Clear selected week
          </button>
        </div>`;
        })()}

        <div class="card p-6">
          <button onclick="App.resetData()" class="btn-ghost w-full text-red-500 mb-4">Reset all data</button>
          <h3 class="font-semibold text-slate-800 mb-2 flex items-center gap-2">
            <i class="fa-solid fa-mobile-screen text-violet-500"></i> Install App
          </h3>
          <p class="text-sm text-slate-500 mb-3">Add ${APP_BRAND.name} to your home screen for a native app experience.</p>
          <button id="pwa-install-btn" onclick="App.installPWA()" class="btn-secondary w-full hidden">
            <i class="fa-solid fa-download"></i> Install ${APP_BRAND.name}
          </button>
          <p class="text-xs text-slate-400 mt-2">On iPhone: Share → Add to Home Screen</p>
        </div>
      </div>`;
  }

  function renderNav() {
    const views = [
      { id: 'dashboard', icon: 'fa-house', label: 'Home' },
      { id: 'planner', icon: 'fa-calendar-week', label: 'Meal Prep' },
      { id: 'settings', icon: 'fa-gear', label: 'Settings' },
    ];
    return views.map((v) => `
      <button onclick="App.switchView('${v.id}')" class="nav-btn hidden md:flex ${activeView === v.id ? 'active' : ''}" data-nav="${v.id}">
        <i class="fa-solid ${v.icon}"></i>
        <span>${v.label}</span>
      </button>
    `).join('');
  }

  function renderMobileNav() {
    const views = [
      { id: 'dashboard', icon: 'fa-house', label: 'Home' },
      { id: 'planner', icon: 'fa-calendar-week', label: 'Prep' },
      { id: 'settings', icon: 'fa-gear', label: 'More' },
    ];
    return views.map((v) => `
      <button onclick="App.switchView('${v.id}')" class="mobile-nav-btn ${activeView === v.id ? 'active' : ''}" data-nav="${v.id}">
        <i class="fa-solid ${v.icon}"></i>
        <span>${v.label}</span>
      </button>
    `).join('');
  }

  async function loadPhotoThumbnails() {
    document.querySelectorAll('[data-photo-id]').forEach(async (img) => {
      const id = img.dataset.photoId;
      if (img.src) return;
      const url = await PhotoLog.getPhoto(id);
      if (url) img.src = url;
    });
  }

  let deferredInstallPrompt = null;

  function updatePWAInstallButton() {
    const btn = document.getElementById('pwa-install-btn');
    if (btn) btn.classList.toggle('hidden', !deferredInstallPrompt);
  }

  async function installPWA() {
    if (!deferredInstallPrompt) return;
    deferredInstallPrompt.prompt();
    await deferredInstallPrompt.userChoice;
    deferredInstallPrompt = null;
    updatePWAInstallButton();
  }

  function render() {
    const main = document.getElementById('main-content');
    const nav = document.getElementById('nav-buttons');
    if (!main) return;

    const views = {
      dashboard: renderDashboard,
      planner: renderPlanner,
      settings: renderSettings,
    };

    main.innerHTML = (views[activeView] || renderDashboard)();
    if (nav) nav.innerHTML = renderNav();
    const mobileNav = document.getElementById('mobile-nav');
    if (mobileNav) mobileNav.innerHTML = renderMobileNav();
    loadPhotoThumbnails();
    updatePWAInstallButton();
    updateHeaderAuth();

    const syncLabel = document.getElementById('sync-label');
    if (syncLabel && typeof Auth !== 'undefined') {
      const session = Auth.getSession();
      syncLabel.textContent = session ? Auth.getSyncStatusLabel() : 'Local storage';
    }

    const badge = state.groceryList.filter((i) => !i.checked).length;
    document.querySelectorAll('[data-nav="planner"]').forEach((plannerNav) => {
      const b = plannerNav.querySelector('.badge');
      if (b) {
        if (badge) b.textContent = badge;
        else b.remove();
      } else if (badge) {
        plannerNav.insertAdjacentHTML('beforeend', `<span class="badge">${badge}</span>`);
      }
    });
  }

  // Modal helpers
  function showModal(html, size) {
    const overlay = document.getElementById('modal-overlay');
    const sizeClass = size === 'modal-lg' ? 'modal-content-lg' : '';
    overlay.innerHTML = `<div class="modal-backdrop" onclick="App.closeModal(event)">
      <div class="modal-content ${sizeClass}" onclick="event.stopPropagation()">${html}</div>
    </div>`;
    overlay.classList.remove('hidden');
  }

  function closeModal(e) {
    if (e && e.target !== e.currentTarget) return;
    if (typeof BarcodeScanner !== 'undefined') BarcodeScanner.stopScanning();
    if (typeof PhotoLog !== 'undefined') PhotoLog.stopCamera();
    document.getElementById('modal-overlay').classList.add('hidden');
  }

  function updateHeaderAuth() {
    const btn = document.getElementById('auth-header-btn');
    if (!btn || typeof Auth === 'undefined') return;
    const session = Auth.getSession();
    if (session) {
      btn.innerHTML = (session.name || session.email || '?')[0].toUpperCase();
      btn.onclick = () => App.switchView('settings');
    } else {
      btn.innerHTML = '<i class="fa-solid fa-user"></i>';
      btn.onclick = () => App.openAuthModal('signin');
    }
  }

  function openAutoFillModal() {
    showModal(`
      <h3 class="text-lg font-bold text-slate-800 mb-1">Meal Style</h3>
      <p class="text-sm text-slate-500 mb-4">Choose how to plan this week — ${MEAL_TYPES.length} meals × 7 days · ${state.settings.calorieGoal} kcal/day target</p>
      <div class="space-y-2">
        ${MEAL_PLAN_STYLES.map((s) => `
          <button onclick="App.runAutoFill('${s.id}')" class="w-full text-left p-3 rounded-xl border border-slate-100 hover:bg-emerald-50 hover:border-emerald-200 transition flex items-center gap-3">
            <div class="w-9 h-9 rounded-lg bg-emerald-100 flex items-center justify-center flex-shrink-0">
              <i class="fa-solid ${s.icon} text-emerald-600"></i>
            </div>
            <div>
              <div class="font-semibold text-slate-800">${s.name}</div>
              <div class="text-xs text-slate-500">${s.desc}</div>
            </div>
          </button>
        `).join('')}
      </div>
      <button onclick="App.closeModal()" class="btn-ghost w-full mt-3">Cancel</button>
    `, 'modal-lg');
  }

  function runAutoFillWithOptions(style, offset, replaceExisting, options = {}) {
    const off = offset ?? weekOffset;
    let replace = replaceExisting;
    const hasExisting = getWeekDates(off).some((date) =>
      MEAL_TYPES.some((m) => getMealSlot(date, m))
    );
    if (replace === 'ask') {
      replace = !hasExisting || confirm(
        'This week already has meals.\n\nOK = Replace all meals\nCancel = Only fill empty slots'
      );
    }
    if (options.closeModal) closeModal();
    autoPopulateWeek(off, style, replace);
    if (options.goToPlanner) {
      weekOffset = off;
      switchView('planner');
    }
  }

  function runAutoFill(style) {
    runAutoFillWithOptions(style, weekOffset, 'ask', { closeModal: true });
  }

  function selectAutoFillStyle(styleId) {
    const el = document.getElementById('settings-autofill-style');
    if (el) el.value = styleId;
    document.querySelectorAll('.autofill-style-btn').forEach((btn) => {
      btn.classList.toggle('active', btn.dataset.style === styleId);
    });
  }

  function setAutofillScope(scope) {
    const el = document.getElementById('settings-autofill-scope');
    if (el) el.value = scope;
    document.getElementById('settings-autofill-week-wrap')?.classList.toggle('hidden', scope !== 'week');
    document.getElementById('settings-autofill-month-wrap')?.classList.toggle('hidden', scope !== 'month');
    const modeLabel = document.getElementById('settings-autofill-mode-label');
    if (modeLabel) {
      modeLabel.textContent = scope === 'month' ? 'If month already has meals' : 'If week already has meals';
    }
    const info = document.getElementById('settings-autofill-info');
    if (info) {
      const cal = state.settings.calorieGoal || 2000;
      info.innerHTML = scope === 'month'
        ? `<i class="fa-solid fa-circle-info text-emerald-500 mr-1"></i> Plans ${MEAL_TYPES.length} meals × full month · target ${cal} kcal/day · respects allergies &amp; ban list`
        : `<i class="fa-solid fa-circle-info text-emerald-500 mr-1"></i> Plans ${MEAL_TYPES.length} meals × 7 days · target ${cal} kcal/day · respects allergies &amp; ban list`;
    }
    const runBtn = document.getElementById('settings-autofill-run-btn');
    if (runBtn) {
      runBtn.innerHTML = scope === 'month'
        ? '<i class="fa-solid fa-wand-magic-sparkles"></i> Auto-fill month'
        : '<i class="fa-solid fa-wand-magic-sparkles"></i> Auto-fill week';
    }
    const clearBtn = document.getElementById('settings-autofill-clear-btn');
    if (clearBtn) {
      clearBtn.textContent = scope === 'month' ? 'Clear selected month' : 'Clear selected week';
    }
    document.querySelectorAll('.settings-autofill-scope-btn').forEach((btn) => {
      btn.classList.toggle('active', btn.dataset.scope === scope);
    });
  }

  function runAutoFillFromSettings() {
    const scope = document.getElementById('settings-autofill-scope')?.value || 'week';
    const style = document.getElementById('settings-autofill-style')?.value || 'smart-shop';
    const mode = document.querySelector('input[name="settings-autofill-mode"]:checked')?.value || 'replace';
    const replaceExisting = mode !== 'fill-empty';

    if (scope === 'month') {
      const monthOffset = Number(document.getElementById('settings-autofill-month')?.value) || 0;
      const dates = getMonthDates(monthOffset);
      autoPopulateDates(dates, style, replaceExisting, true);
      const today = todayStr();
      const navDate = dates.includes(today) ? today : dates[0];
      weekOffset = getWeekOffsetForDate(navDate);
      switchView('planner');
      return;
    }

    const offset = Number(document.getElementById('settings-autofill-week')?.value) || 0;
    runAutoFillWithOptions(style, offset, replaceExisting, { goToPlanner: true });
  }

  function clearPlanFromSettings() {
    const scope = document.getElementById('settings-autofill-scope')?.value || 'week';
    if (scope === 'month') {
      const monthOffset = Number(document.getElementById('settings-autofill-month')?.value) || 0;
      const { name, range } = getMonthRangeLabel(monthOffset);
      if (!confirm(`Clear all meals for ${name} (${range})?`)) return;
      clearMonthPlan(monthOffset);
      const dates = getMonthDates(monthOffset);
      const today = todayStr();
      weekOffset = getWeekOffsetForDate(dates.includes(today) ? today : dates[0]);
    } else {
      const offset = Number(document.getElementById('settings-autofill-week')?.value) || 0;
      const { name, range } = getWeekRangeLabel(offset);
      if (!confirm(`Clear all meals for ${name} (${range})?`)) return;
      clearWeekPlan(offset);
      weekOffset = offset;
    }
    switchView('planner');
  }

  function openMealPicker(date, mealType) {
    const slot = getMealSlot(date, mealType);
    const current = slot?.recipeId;
    const currentTime = slot?.time || getSuggestedTime(mealType);
    const win = MEAL_EATING_TIMES[mealType];
    const tagged = filterAllowedRecipes(state.recipes.filter((r) => r.tags.includes(mealType)));
    let recipeList = tagged.length ? tagged : filterAllowedRecipes(state.recipes);
    if (current && !recipeList.some((r) => r.id === current)) {
      const cur = getRecipe(current);
      if (cur) recipeList = [cur, ...recipeList];
    }
    const goal = state.settings.calorieGoal || 2000;
    const targetCal = Math.round(goal * MEAL_CALORIE_SPLIT[mealType]);
    const ctx = SmartMealPlanner.createContext('smart-shop', getIngredientReuse());
    SmartMealPlanner.seedContextFromPlan(ctx, getWeekDates(weekOffset), MEAL_TYPES, (d, m) => {
      if (d === date && m === mealType) return null;
      return getWeekSlotRecipe(d, m);
    });
    const ranked = recipeList.map((r) => {
      const shared = (r.ingredients || []).filter((ing) => {
        const key = SmartMealPlanner.normalizeIngredient(ing.name);
        return ctx.pantry[key]?.meals > 0;
      }).length;
      return { r, shared, score: SmartMealPlanner.scoreRecipe(r, targetCal, ctx) };
    }).sort((a, b) => b.score - a.score);
    showModal(`
      <h3 class="text-lg font-bold text-slate-800 mb-1 capitalize">Pick ${mealType}</h3>
      <p class="text-sm text-slate-500 mb-1">${formatDisplayDate(date)} · ${recipeList.length} options</p>
      <p class="text-xs text-emerald-600 mb-3"><i class="fa-solid fa-recycle mr-1"></i>Sorted by ingredient reuse · <i class="fa-solid fa-clock mr-1"></i>${win.label}</p>
      <div class="mb-3">
        <label class="label">Meal time</label>
        <input type="time" id="picker-time" value="${currentTime}" class="input"/>
      </div>
      <div class="space-y-2 max-h-64 overflow-y-auto">
        ${ranked.length ? ranked.map(({ r, shared }) => {
          const banned = BanList.isRecipeBanned(r, getBanList());
          return `
          <div class="flex items-center gap-2 p-1 rounded-xl border border-slate-100 ${current === r.id ? 'bg-emerald-50 border-emerald-200' : ''} ${banned ? 'opacity-60' : ''}">
            <button type="button" onclick="App.pickMealWithTime('${date}','${mealType}','${r.id}')" class="flex-1 text-left p-2 rounded-lg hover:bg-emerald-50 flex justify-between items-center min-w-0 gap-2" ${banned ? 'disabled' : ''}>
              <span class="font-medium text-slate-700 truncate">${escapeHtml(r.name)}${banned ? '<span class="text-red-500 text-xs ml-1">(banned)</span>' : ''}</span>
              <span class="flex items-center gap-1.5 flex-shrink-0">
                ${shared ? `<span class="shop-use-badge shared">${shared} shared</span>` : ''}
                <span class="text-sm text-emerald-600">${r.calories} kcal</span>
              </span>
            </button>
            <button type="button" onclick="App.openRecipeModal('${r.id}','${mealType}','${date}')" class="recipe-view-btn flex-shrink-0" title="View instructions">
              <i class="fa-solid fa-book-open"></i>
            </button>
          </div>`;
        }).join('') : `
          <div class="p-4 text-center text-sm text-slate-500 bg-slate-50 rounded-xl">
            <p class="font-medium text-slate-700 mb-1">No recipes available</p>
            <p>Your ban list may be blocking all ${mealType} options.</p>
            <button type="button" onclick="App.closeModal(); App.switchView('settings')" class="text-emerald-600 hover:underline mt-2">Edit ban list in Settings</button>
          </div>`}
      </div>
      ${current ? `<button onclick="App.setPlannedMeal('${date}','${mealType}',null); App.closeModal()" class="btn-ghost w-full mt-3 text-red-500">Remove meal</button>` : ''}
      <button onclick="App.closeModal()" class="btn-ghost w-full mt-2">Cancel</button>
    `);
  }

  function pickMealWithTime(date, mealType, recipeId) {
    const time = document.getElementById('picker-time')?.value || getSuggestedTime(mealType);
    setPlannedMeal(date, mealType, recipeId, time);
    closeModal();
  }

  function openTimePicker(date, mealType) {
    const slot = getMealSlot(date, mealType);
    if (!slot) return;
    const win = MEAL_EATING_TIMES[mealType];
    showModal(`
      <h3 class="text-lg font-bold text-slate-800 mb-1 capitalize">Set ${mealType} time</h3>
      <p class="text-sm text-slate-500 mb-3">${formatDisplayDate(date)} · Recommended: ${win.label}</p>
      <input type="time" id="edit-time" value="${slot.time}" class="input mb-3"/>
      <button onclick="App.saveMealTime('${date}','${mealType}')" class="btn-primary w-full">Save time</button>
      <button onclick="App.setMealTime('${date}','${mealType}','${win.ideal}')" class="btn-ghost w-full mt-2 text-sm">Use suggested (${formatTimeDisplay(win.ideal)})</button>
    `);
  }

  function saveMealTime(date, mealType) {
    const time = document.getElementById('edit-time')?.value;
    if (time) setMealTime(date, mealType, time);
    closeModal();
  }

  function openCustomLogModal(date) {
    showModal(`
      <h3 class="text-lg font-bold text-slate-800 mb-4">Add Custom Food</h3>
      <div class="space-y-3">
        <div>
          <label class="label">Food name</label>
          <input id="custom-name" class="input" placeholder="e.g. Banana"/>
        </div>
        <div class="grid grid-cols-2 gap-3">
          <div>
            <label class="label">Calories</label>
            <input id="custom-cal" type="number" class="input" value="100"/>
          </div>
          <div>
            <label class="label">Meal</label>
            <select id="custom-meal" class="input">
              ${MEAL_TYPES.map((m) => `<option value="${m}">${m}</option>`).join('')}
            </select>
          </div>
        </div>
        <div class="grid grid-cols-3 gap-3">
          <div><label class="label">Protein (g)</label><input id="custom-protein" type="number" class="input" value="0"/></div>
          <div><label class="label">Carbs (g)</label><input id="custom-carbs" type="number" class="input" value="0"/></div>
          <div><label class="label">Fat (g)</label><input id="custom-fat" type="number" class="input" value="0"/></div>
        </div>
      </div>
      <button onclick="App.submitCustomLog('${date}')" class="btn-primary w-full mt-4">Add to log</button>
    `);
  }

  function submitCustomLog(date) {
    const name = document.getElementById('custom-name').value.trim();
    if (!name) return;
    addCustomLogEntry(date, {
      name,
      calories: Number(document.getElementById('custom-cal').value) || 0,
      protein: Number(document.getElementById('custom-protein').value) || 0,
      carbs: Number(document.getElementById('custom-carbs').value) || 0,
      fat: Number(document.getElementById('custom-fat').value) || 0,
      mealType: document.getElementById('custom-meal').value,
    });
    closeModal();
    openHomeCalorieLog(date);
  }

  function openAddRecipeModal() {
    showModal(`
      <h3 class="text-lg font-bold text-slate-800 mb-4">Add Recipe</h3>
      <div class="space-y-3 max-h-[60vh] overflow-y-auto pr-1">
        <div><label class="label">Name</label><input id="new-name" class="input"/></div>
        <div class="grid grid-cols-2 gap-3">
          <div><label class="label">Calories</label><input id="new-cal" type="number" class="input" value="300"/></div>
          <div><label class="label">Prep time (min)</label><input id="new-prep" type="number" class="input" value="20"/></div>
        </div>
        <div class="grid grid-cols-3 gap-3">
          <div><label class="label">Protein</label><input id="new-protein" type="number" class="input" value="20"/></div>
          <div><label class="label">Carbs</label><input id="new-carbs" type="number" class="input" value="30"/></div>
          <div><label class="label">Fat</label><input id="new-fat" type="number" class="input" value="10"/></div>
        </div>
        <div><label class="label">Ingredients (one per line: qty unit name)</label>
          <textarea id="new-ingredients" class="input h-24" placeholder="1 cup rice&#10;2 tbsp olive oil"></textarea>
        </div>
        <div>
          <label class="label">Instructions (one step per line works best)</label>
          <textarea id="new-instructions" class="input h-28" placeholder="Wash and chop the veggies.&#10;Heat oil in a pan on medium heat.&#10;Cook chicken 6–7 min per side until done.&#10;Serve over rice."></textarea>
        </div>
      </div>
      <button onclick="App.submitNewRecipe()" class="btn-primary w-full mt-4">Save recipe</button>
    `);
  }

  function submitNewRecipe() {
    const name = document.getElementById('new-name').value.trim();
    if (!name) return;
    const ingredients = document.getElementById('new-ingredients').value
      .split('\n')
      .filter(Boolean)
      .map((line) => {
        const parts = line.trim().split(/\s+/);
        const qty = parseFloat(parts[0]);
        if (isNaN(qty)) return { name: line.trim(), quantity: 1, unit: 'item' };
        return {
          quantity: qty,
          unit: parts[1] || 'item',
          name: parts.slice(2).join(' ') || parts.slice(1).join(' ') || line.trim(),
        };
      });
    addRecipe({
      name,
      calories: Number(document.getElementById('new-cal').value) || 0,
      protein: Number(document.getElementById('new-protein').value) || 0,
      carbs: Number(document.getElementById('new-carbs').value) || 0,
      fat: Number(document.getElementById('new-fat').value) || 0,
      servings: 1,
      prepTime: Number(document.getElementById('new-prep').value) || 15,
      tags: ['custom'],
      ingredients,
      instructions: document.getElementById('new-instructions').value || 'No instructions provided.',
    });
    closeModal();
  }

  function saveSettingsFromForm() {
    const profile = NutritionCalc.readProfileFromForm();
    updateSettings({
      name: document.getElementById('set-name').value || 'My Plan',
      calorieGoal: Number(document.getElementById('set-calories').value) || 2000,
      proteinGoal: Number(document.getElementById('set-protein').value) || 150,
      carbsGoal: Number(document.getElementById('set-carbs').value) || 200,
      fatGoal: Number(document.getElementById('set-fat').value) || 65,
      profile,
      family: FamilySettings.readFromForm(),
    });
  }

  function resetData() {
    if (confirm('Reset all data? This cannot be undone.')) {
      const key = typeof Auth !== 'undefined' ? Auth.getStorageKey() : STORAGE_KEY;
      localStorage.removeItem(key);
      localStorage.removeItem(STORAGE_KEY);
      state = defaultState();
      saveState();
      render();
    }
  }

  function changeWeek(delta) {
    weekOffset += delta;
    render();
  }

  function selectRecipe(id) {
    selectedRecipeId = id;
    render();
  }

  function setRecipeLibraryCategory(category) {
    recipeLibraryCategory = category;
    render();
  }

  function addManualFromInput() {
    const input = document.getElementById('grocery-input');
    if (input?.value.trim()) {
      addManualGroceryItem(input.value);
      input.value = '';
    }
  }

  function quickLogToday() {
    logAllScheduleToCalories();
    openHomeCalorieLog(todayStr());
  }

  // ── Auth ──
  function openAuthModal(mode = 'signin') {
    const isSignUp = mode === 'signup';
    showModal(`
      <h3 class="text-lg font-bold text-slate-800 mb-4">${isSignUp ? 'Create Account' : 'Sign In'}</h3>
      <div class="space-y-3">
        ${isSignUp ? '<div><label class="label">Name</label><input id="auth-name" class="input" placeholder="Your name"/></div>' : ''}
        <div><label class="label">Email</label><input id="auth-email" type="email" class="input" placeholder="you@email.com"/></div>
        <div><label class="label">Password</label><input id="auth-password" type="password" class="input" placeholder="6+ characters"/></div>
        <p id="auth-error" class="text-sm text-red-500 hidden"></p>
      </div>
      <button onclick="App.submitAuth('${mode}')" class="btn-primary w-full mt-4">${isSignUp ? 'Create account' : 'Sign in'}</button>
      <button onclick="App.openAuthModal('${isSignUp ? 'signin' : 'signup'}')" class="btn-ghost w-full mt-2 text-sm">
        ${isSignUp ? 'Already have an account? Sign in' : 'Need an account? Sign up'}
      </button>
    `);
  }

  async function submitAuth(mode) {
    const email = document.getElementById('auth-email').value;
    const password = document.getElementById('auth-password').value;
    const name = document.getElementById('auth-name')?.value;
    const errEl = document.getElementById('auth-error');
    try {
      if (mode === 'signup') await Auth.signUp(email, password, name);
      else await Auth.signIn(email, password);
      state = loadState();
      closeModal();
      render();
    } catch (e) {
      errEl.textContent = e.message;
      errEl.classList.remove('hidden');
    }
  }

  async function signOutUser() {
    await Auth.signOut();
    state = loadState();
    render();
  }

  function exportBackup() { Auth.exportData(state); }

  async function importBackup(event) {
    const file = event.target.files?.[0];
    if (!file) return;
    try {
      const data = await Auth.importData(file);
      state = { ...defaultState(), ...data };
      saveState();
      render();
      alert('Backup imported successfully!');
    } catch (e) { alert(e.message); }
    event.target.value = '';
  }

  async function syncNow() {
    if (typeof Billing !== 'undefined' && !Billing.isPro()) {
      alert(Billing.proGateMessage('Cloud sync'));
      switchView('settings');
      return;
    }
    await Auth.pushToCloud(state);
    const pulled = await Auth.pullFromCloud();
    if (pulled) { state = pulled; render(); }
    alert('Sync complete!');
  }

  async function upgradeToPro() {
    try {
      const session = Auth.getSession();
      if (!session) {
        openAuthModal('signup');
        return;
      }
      if (!session.cloud) {
        alert('Create a cloud account (Firebase) to subscribe.');
        return;
      }
      await Billing.startCheckout();
    } catch (e) {
      alert(e.message || 'Could not start checkout');
    }
  }

  async function manageSubscription() {
    try {
      await Billing.openCustomerPortal();
    } catch (e) {
      alert(e.message || 'Could not open billing portal');
    }
  }

  async function handleCheckoutReturn() {
    const params = new URLSearchParams(location.search);
    const checkout = params.get('checkout');
    if (!checkout) return;
    params.delete('checkout');
    const clean = `${location.pathname}${params.toString() ? `?${params}` : ''}`;
    history.replaceState({}, '', clean);
    if (checkout === 'success') {
      await Billing.refreshSubscription();
      switchView('settings');
      render();
      alert('Welcome to PlatePlanr Pro! Your plan will activate in a few seconds.');
    }
  }

  // ── Barcode ──
  let barcodeLogDate = null;

  function setBarcodeStatus(msg) {
    const el = document.getElementById('barcode-status');
    if (el) el.textContent = msg;
  }

  async function startBarcodeCamera() {
    if (typeof BarcodeScanner === 'undefined') return;
    const reader = document.getElementById('barcode-reader');
    if (reader) reader.classList.remove('hidden');
    setBarcodeStatus('Opening camera…');
    try {
      await BarcodeScanner.startScanning('barcode-reader', (code) => App.onBarcodeDetected(code));
      setBarcodeStatus('Point camera at the barcode');
    } catch (e) {
      setBarcodeStatus(e.message || 'Camera unavailable');
    }
  }

  async function onBarcodePhotoSelect(ev) {
    const file = ev.target?.files?.[0];
    if (!file || typeof BarcodeScanner === 'undefined') return;
    setBarcodeStatus('Reading barcode from photo…');
    try {
      await BarcodeScanner.scanFromFile(file, (code) => App.onBarcodeDetected(code));
    } catch (e) {
      setBarcodeStatus(e.message || 'Could not read barcode');
    }
    ev.target.value = '';
  }

  function openBarcodeModal(date) {
    barcodeLogDate = date || todayStr();
    const liveScan = typeof BarcodeScanner !== 'undefined' && BarcodeScanner.canUseLiveCamera();
    const hint = typeof BarcodeScanner !== 'undefined' ? BarcodeScanner.cameraHint() : 'Enter barcode below';
    showModal(`
      <h3 class="text-lg font-bold text-slate-800 mb-2">Scan Barcode</h3>
      <p class="text-sm text-slate-500 mb-3">${liveScan ? 'Point your camera at the product barcode' : hint}</p>
      ${liveScan ? `<button type="button" onclick="App.startBarcodeCamera()" class="btn-primary w-full mb-3"><i class="fa-solid fa-camera"></i> Open camera</button>` : ''}
      <div id="barcode-reader" class="rounded-xl overflow-hidden bg-black mb-3 hidden" style="min-height:260px"></div>
      <div id="barcode-status" class="text-sm text-slate-500 text-center mb-3">${liveScan ? 'Tap “Open camera” to start' : hint}</div>
      <label class="btn-secondary w-full mb-3 cursor-pointer justify-center">
        <i class="fa-solid fa-image"></i> Photo of barcode
        <input type="file" accept="image/*" capture="environment" class="hidden" onchange="App.onBarcodePhotoSelect(event)"/>
      </label>
      <div class="flex gap-2">
        <input id="barcode-manual" class="input flex-1" placeholder="Barcode number (8–14 digits)" inputmode="numeric"/>
        <button onclick="App.lookupManualBarcode()" class="btn-primary">Look up</button>
      </div>
      <button onclick="App.closeBarcodeModal()" class="btn-ghost w-full mt-3">Cancel</button>
    `, 'modal-lg');
  }

  async function onBarcodeDetected(code) {
    const status = document.getElementById('barcode-status');
    if (status) status.textContent = 'Looking up product…';
    try {
      const product = await BarcodeScanner.lookupBarcode(code);
      await BarcodeScanner.stopScanning();
      showBarcodeConfirm(product);
    } catch (e) {
      if (status) status.textContent = e.message;
    }
  }

  async function lookupManualBarcode() {
    const code = document.getElementById('barcode-manual')?.value.trim();
    if (!code) return;
    await BarcodeScanner.stopScanning();
    onBarcodeDetected(code);
  }

  function showBarcodeConfirm(product) {
    showModal(`
      <h3 class="text-lg font-bold text-slate-800 mb-2">Product Found</h3>
      ${product.image ? `<img src="${product.image}" class="w-full h-32 object-contain rounded-xl bg-slate-50 mb-3" alt="product"/>` : ''}
      <div class="font-semibold text-slate-800">${product.name}</div>
      ${product.brand ? `<div class="text-sm text-slate-500">${product.brand}</div>` : ''}
      <div class="text-xs text-slate-400 mt-1">Per 100g · Barcode: ${product.barcode}</div>
      <div class="grid grid-cols-4 gap-2 my-4">
        <div class="nutrition-pill"><div class="font-bold text-orange-600">${product.calories}</div><div class="text-xs text-slate-400">kcal</div></div>
        <div class="nutrition-pill"><div class="font-bold text-blue-600">${product.protein}g</div><div class="text-xs text-slate-400">Protein</div></div>
        <div class="nutrition-pill"><div class="font-bold text-amber-600">${product.carbs}g</div><div class="text-xs text-slate-400">Carbs</div></div>
        <div class="nutrition-pill"><div class="font-bold text-rose-600">${product.fat}g</div><div class="text-xs text-slate-400">Fat</div></div>
      </div>
      <div class="mb-3">
        <label class="label">Meal</label>
        <select id="barcode-meal" class="input">${MEAL_TYPES.map((m) => `<option value="${m}">${m}</option>`).join('')}</select>
      </div>
      <div class="mb-3">
        <label class="label">Serving multiplier (1 = per 100g)</label>
        <input id="barcode-serving" type="number" class="input" value="1" min="0.1" step="0.1"/>
      </div>
      <button onclick="App.logBarcodeProduct()" class="btn-primary w-full">Add to log</button>
      <button onclick="App.openBarcodeModal('${barcodeLogDate}')" class="btn-ghost w-full mt-2">Scan again</button>
    `);
    window._barcodeProduct = product;
  }

  function logBarcodeProduct() {
    const product = window._barcodeProduct;
    if (!product) return;
    const mult = Number(document.getElementById('barcode-serving')?.value) || 1;
    const mealType = document.getElementById('barcode-meal')?.value || 'snack';
    addCustomLogEntry(barcodeLogDate, {
      name: product.brand ? `${product.name} (${product.brand})` : product.name,
      calories: Math.round(product.calories * mult),
      protein: Math.round(product.protein * mult),
      carbs: Math.round(product.carbs * mult),
      fat: Math.round(product.fat * mult),
      mealType,
      barcode: product.barcode,
    });
    window._barcodeProduct = null;
    closeModal();
    openHomeCalorieLog(barcodeLogDate || todayStr());
  }

  async function closeBarcodeModal() {
    await BarcodeScanner.stopScanning();
    closeModal();
  }

  // ── Photo log ──
  let photoLogDate = null;

  function openPhotoLogModal(date) {
    photoLogDate = date || todayStr();
    pendingPhotoData = null;
    const liveCam = typeof PhotoLog !== 'undefined' && PhotoLog.canUseLiveCamera();
    const camHint = typeof PhotoLog !== 'undefined' ? PhotoLog.cameraHint() : '';
    showModal(`
      <h3 class="text-lg font-bold text-slate-800 mb-2">Scan Food</h3>
      <p class="text-sm text-slate-500 mb-4">Take a photo of your meal to log calories</p>
      ${camHint && !liveCam ? `<p class="text-xs text-amber-700 bg-amber-50 border border-amber-100 rounded-lg px-3 py-2 mb-3">${escapeHtml(camHint)}</p>` : ''}
      <div id="photo-preview-area" class="hidden mb-3">
        <img id="photo-preview" class="w-full rounded-xl max-h-56 object-cover" alt="meal preview"/>
      </div>
      <video id="photo-video" class="w-full rounded-xl bg-black max-h-56 hidden" playsinline webkit-playsinline muted autoplay></video>
      <div id="photo-placeholder" class="w-full h-44 rounded-xl bg-slate-100 flex flex-col items-center justify-center text-slate-400 mb-3 gap-2">
        <i class="fa-solid fa-bowl-food text-3xl"></i>
        <span class="text-xs">No photo yet</span>
      </div>
      <label class="btn-primary w-full cursor-pointer text-center justify-center mb-2 py-3">
        <i class="fa-solid fa-camera"></i> Take photo
        <input type="file" id="photo-file-input" accept="image/*" capture="environment" class="hidden" onchange="App.onPhotoFileSelect(event)"/>
      </label>
      ${liveCam ? `<button type="button" onclick="App.startPhotoCamera()" class="btn-secondary w-full mb-3"><i class="fa-solid fa-video"></i> Live camera preview</button>` : ''}
      <label class="btn-ghost w-full cursor-pointer text-center text-sm mb-3">
        <i class="fa-solid fa-image"></i> Choose from gallery
        <input type="file" accept="image/*" class="hidden" onchange="App.onPhotoFileSelect(event)"/>
      </label>
      <div id="photo-ai-status" class="text-sm text-slate-500 text-center mb-3 hidden"></div>
      <div id="photo-form" class="space-y-3 hidden">
        <div><label class="label">Food name</label><input id="photo-name" class="input" placeholder="e.g. Grilled chicken salad"/></div>
        <div class="grid grid-cols-2 gap-3">
          <div><label class="label">Calories</label><input id="photo-cal" type="number" class="input" value="300"/></div>
          <div><label class="label">Meal</label><select id="photo-meal" class="input">${MEAL_TYPES.map((m) => `<option value="${m}">${m}</option>`).join('')}</select></div>
        </div>
        <div class="grid grid-cols-3 gap-3">
          <div><label class="label">Protein</label><input id="photo-protein" type="number" class="input" value="0"/></div>
          <div><label class="label">Carbs</label><input id="photo-carbs" type="number" class="input" value="0"/></div>
          <div><label class="label">Fat</label><input id="photo-fat" type="number" class="input" value="0"/></div>
        </div>
      </div>
      <button id="photo-snap-btn" onclick="App.snapAndAnalyze()" class="btn-primary w-full hidden">Capture &amp; analyze</button>
      <button id="photo-save-btn" onclick="App.savePhotoLog()" class="btn-primary w-full hidden">Save to log</button>
      <button onclick="App.closePhotoModal()" class="btn-ghost w-full mt-2">Cancel</button>
    `, 'modal-lg');
  }

  async function startPhotoCamera() {
    const video = document.getElementById('photo-video');
    const placeholder = document.getElementById('photo-placeholder');
    const snapBtn = document.getElementById('photo-snap-btn');
    try {
      if (snapBtn) { snapBtn.disabled = true; snapBtn.textContent = 'Starting camera…'; }
      await PhotoLog.captureFromCamera(video);
      video.classList.remove('hidden');
      placeholder.classList.add('hidden');
      snapBtn?.classList.remove('hidden');
      if (snapBtn) { snapBtn.disabled = false; snapBtn.textContent = 'Capture & analyze'; }
    } catch (e) {
      if (snapBtn) { snapBtn.disabled = false; snapBtn.textContent = 'Capture & analyze'; }
      alert(e.message || 'Camera not available. Use Take photo instead.');
    }
  }

  async function onPhotoFileSelect(event) {
    const file = event.target.files?.[0];
    if (!file) return;
    pendingPhotoData = await PhotoLog.readFileAsDataUrl(file);
    showPhotoPreview(pendingPhotoData);
    await analyzePhoto(pendingPhotoData);
  }

  function showPhotoPreview(dataUrl) {
    const preview = document.getElementById('photo-preview');
    const area = document.getElementById('photo-preview-area');
    const placeholder = document.getElementById('photo-placeholder');
    const video = document.getElementById('photo-video');
    if (preview) preview.src = dataUrl;
    area?.classList.remove('hidden');
    placeholder?.classList.add('hidden');
    video?.classList.add('hidden');
    PhotoLog.stopCamera();
    document.getElementById('photo-form')?.classList.remove('hidden');
    document.getElementById('photo-save-btn')?.classList.remove('hidden');
    document.getElementById('photo-snap-btn')?.classList.add('hidden');
  }

  async function snapAndAnalyze() {
    const video = document.getElementById('photo-video');
    try {
      pendingPhotoData = PhotoLog.snapPhoto(video);
      PhotoLog.stopCamera();
      showPhotoPreview(pendingPhotoData);
      await analyzePhoto(pendingPhotoData);
    } catch (e) {
      alert(e.message || 'Could not capture photo');
    }
  }

  async function analyzePhoto(dataUrl) {
    const status = document.getElementById('photo-ai-status');
    const pro = typeof Billing !== 'undefined' && Billing.isPro();
    const aiEnabled = pro && APP_CONFIG?.openai?.enabled && APP_CONFIG.openai.apiKey;
    status?.classList.remove('hidden');
    if (status) {
      if (!pro) status.textContent = Billing.proGateMessage('AI photo scan');
      else if (!APP_CONFIG?.openai?.apiKey) status.textContent = 'Enter nutrition manually (add OpenAI key in config for AI estimates)';
      else status.textContent = 'AI analyzing meal…';
    }

    if (!aiEnabled) return;

    try {
      const est = await PhotoLog.estimateNutrition(dataUrl);
      if (est) {
        document.getElementById('photo-name').value = est.name || '';
        document.getElementById('photo-cal').value = est.calories || 0;
        document.getElementById('photo-protein').value = est.protein || 0;
        document.getElementById('photo-carbs').value = est.carbs || 0;
        document.getElementById('photo-fat').value = est.fat || 0;
        if (status) status.textContent = `AI estimate (${est.confidence || 'medium'} confidence) — adjust if needed`;
        window._aiConfidence = est.confidence;
      }
    } catch (e) {
      if (status) status.textContent = 'AI unavailable — enter values manually';
    }
  }

  async function savePhotoLog() {
    const name = document.getElementById('photo-name')?.value.trim();
    if (!name) { alert('Enter a food name'); return; }
    const photoId = uid();
    if (pendingPhotoData) await PhotoLog.savePhoto(photoId, pendingPhotoData);
    addCustomLogEntry(photoLogDate, {
      name,
      calories: Number(document.getElementById('photo-cal')?.value) || 0,
      protein: Number(document.getElementById('photo-protein')?.value) || 0,
      carbs: Number(document.getElementById('photo-carbs')?.value) || 0,
      fat: Number(document.getElementById('photo-fat')?.value) || 0,
      mealType: document.getElementById('photo-meal')?.value || 'snack',
      photoId: pendingPhotoData ? photoId : null,
      aiConfidence: window._aiConfidence || null,
    });
    pendingPhotoData = null;
    window._aiConfidence = null;
    closePhotoModal();
    openHomeCalorieLog(photoLogDate || todayStr());
  }

  function closePhotoModal() {
    PhotoLog.stopCamera();
    pendingPhotoData = null;
    closeModal();
  }

  function applyAppBranding() {
    if (typeof APP_BRAND === 'undefined') return;
    document.title = `${APP_BRAND.name} — ${APP_BRAND.shortTagline}`;
    const nameEl = document.getElementById('app-name');
    const taglineEl = document.getElementById('app-tagline');
    const footerEl = document.getElementById('app-footer-brand');
    if (nameEl) nameEl.textContent = APP_BRAND.name;
    if (taglineEl) taglineEl.textContent = APP_BRAND.shortTagline;
    if (footerEl) footerEl.textContent = APP_BRAND.name;
  }

  async function init() {
    applyAppBranding();
    if (typeof Auth !== 'undefined') {
      Auth.setOnAuthChange(() => { state = loadState(); render(); });
      Auth.setOnSubscriptionChange(() => render());
      await Auth.init();
    }
    await handleCheckoutReturn();
    state = loadState();
    const recipeCountBefore = state.recipes.length;
    state = mergeNewRecipes(state);
    const migrated = migrateMealPlanTimes();
    if (state.recipes.length > recipeCountBefore || migrated) saveState();
    authReady = true;

    const params = new URLSearchParams(location.search);
    const view = params.get('view');
    if (view === 'calories') {
      activeView = 'dashboard';
      homeCalorieLogOpen = true;
      homeLogDate = todayStr();
    } else if (view === 'recipes') {
      activeView = 'dashboard';
      homeRecipeLibraryOpen = true;
    } else if (view === 'grocery') {
      activeView = 'planner';
    } else if (view) {
      activeView = view;
    }

    window.addEventListener('beforeinstallprompt', (e) => {
      e.preventDefault();
      deferredInstallPrompt = e;
      updatePWAInstallButton();
    });

    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.register('./sw.js').catch(() => {});
    }

    if (getWeekDates(0).some((d) => MEAL_TYPES.some((m) => getMealSlot(d, m)))) {
      syncGroceryFromMealPlan(0);
    }

    render();

    if (view === 'grocery') {
      requestAnimationFrame(() => {
        document.getElementById('meal-prep-grocery')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
      });
    }
  }

  return {
    init, render, switchView, scrollToGroceryList, toggleHomeCalorieLog, openHomeCalorieLog, setHomeLogDate,
    toggleHomeRecipeLibrary, openHomeRecipeLibrary,
    setPlannedMeal, logFromRecipe, removeLogEntry,
    toggleGroceryItem, removeGroceryItem, generateGroceryFromWeek, clearCheckedGroceries,
    deleteRecipe, selectRecipe, setRecipeLibraryCategory, changeWeek, openMealPicker, openCustomLogModal,
    openAddRecipeModal, submitCustomLog, submitNewRecipe, saveSettingsFromForm,
    resetData, quickLogToday, addManualFromInput, closeModal,
    openAuthModal, submitAuth, signOutUser, exportBackup, importBackup, syncNow,
    upgradeToPro, manageSubscription,
    openBarcodeModal, closeBarcodeModal, startBarcodeCamera, onBarcodePhotoSelect, lookupManualBarcode, logBarcodeProduct, onBarcodeDetected,
    openPhotoLogModal, startPhotoCamera, onPhotoFileSelect, snapAndAnalyze, savePhotoLog, closePhotoModal,
    installPWA,
    openAutoFillModal, runAutoFill, runAutoFillFromSettings, clearPlanFromSettings,
    selectAutoFillStyle, setAutofillScope, clearWeekPlan, clearMonthPlan, autoPopulateWeek, autoPopulateMonth,
    pickMealWithTime, openTimePicker, saveMealTime, setMealTime,
    saveGroceryStore, fetchGroceryPrices,
    logScheduledMeal, logAllScheduleToCalories, logAllPlannedForDate,
    openOrderModal, placeGroceryOrder, reopenOrderPortal,
    openRecipeModal,

    previewNutritionGoals, selectNutritionPreset, applyNutritionPreset,
    previewFamilySettings, selectFamilyPreset, addFamilyMember, removeFamilyMember, saveFamilySettings,
    addBanItem, quickAddBan, removeBanItem, saveBanListSettings, previewBanList,
  };
})();

document.addEventListener('DOMContentLoaded', () => App.init());