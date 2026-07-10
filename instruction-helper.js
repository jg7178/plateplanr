// Turns recipe instructions into clear step-by-step guides for beginners

const InstructionHelper = (() => {
  const VERB_SPLITS = /\s+(?=then\b|next\b|finally\b|after that\b|once\b|when\b)/i;

  function capitalize(s) {
    const t = s.trim();
    if (!t) return t;
    return t.charAt(0).toUpperCase() + t.slice(1);
  }

  function ensurePeriod(s) {
    const t = s.trim();
    if (!t) return t;
    return /[.!?]$/.test(t) ? t : `${t}.`;
  }

  function parseSteps(text) {
    if (!text) return [];
    if (Array.isArray(text)) return text.map((s) => capitalize(String(s).trim())).filter(Boolean);

    let raw = String(text).trim();
    if (!raw) return [];

    raw = raw.replace(/\s+then\s+/gi, '. ');
    raw = raw.replace(/;\s*/g, '. ');
    raw = raw.replace(VERB_SPLITS, '. ');

    let parts = raw.split(/\n+|(?<=\.)\s+/).map((s) => s.trim()).filter((s) => s.length > 2);

    if (parts.length <= 1) {
      const commaParts = raw.split(/,\s+(?=[A-Z(])/).map((s) => s.trim()).filter((s) => s.length > 5);
      if (commaParts.length >= 2) parts = commaParts;
    }

    if (parts.length <= 1) {
      const actionParts = raw.split(/\.\s+(?=[A-Z])/).filter((s) => s.length > 3);
      if (actionParts.length >= 2) parts = actionParts;
    }

    return parts.map((s) => capitalize(s.replace(/\.$/, '')));
  }

  function classifyStep(step) {
    const lower = step.toLowerCase();
    if (/bake|roast|oven|broil|°f|\d{3}°/.test(lower)) {
      return { icon: 'fa-temperature-high', label: 'Bake or roast', color: 'orange' };
    }
    if (/simmer|boil|steam|reduce/.test(lower)) {
      return { icon: 'fa-fire-burner', label: 'Cook on the stove', color: 'red' };
    }
    if (/grill|pan-sear|sear|sauté|saute|stir-fry|stir fry|fry|scramble|sauté/.test(lower)) {
      return { icon: 'fa-fire-burner', label: 'Cook in a pan', color: 'red' };
    }
    if (/refrigerat|chill|overnight|ice bath|rest for|let sit|marinate/.test(lower)) {
      return { icon: 'fa-clock', label: 'Wait or chill', color: 'blue' };
    }
    if (/serve|top with|plate|arrange|drizzle|garnish|enjoy/.test(lower)) {
      return { icon: 'fa-utensils', label: 'Serve it up', color: 'emerald' };
    }
    if (/mix|combine|stir|toss|whisk|blend|layer|spread|fill|fold|pour/.test(lower)) {
      return { icon: 'fa-blender', label: 'Mix & assemble', color: 'purple' };
    }
    if (/chop|dice|slice|cut|mince|peel|wash|drain|shred|crumble|spiralize|mash/.test(lower)) {
      return { icon: 'fa-carrot', label: 'Prep your food', color: 'amber' };
    }
    if (/toast|warm|heat|microwave|grill in/.test(lower)) {
      return { icon: 'fa-bread-slice', label: 'Heat it up', color: 'amber' };
    }
    return { icon: 'fa-hand-pointer', label: 'Follow this step', color: 'slate' };
  }

  function extractTips(step) {
    const tips = [];
    const lower = step.toLowerCase();

    const temp = step.match(/(\d{3})\s*°?\s*F/i);
    if (temp) tips.push({ icon: 'fa-temperature-half', text: `Set oven to ${temp[1]}°F` });

    const rangeMin = step.match(/(\d+)\s*(?:–|-|to)\s*(\d+)\s*min/i);
    const singleMin = step.match(/(\d+)\s*min(?:ute)?s?/i);
    if (rangeMin) tips.push({ icon: 'fa-clock', text: `About ${rangeMin[1]}–${rangeMin[2]} minutes` });
    else if (singleMin) tips.push({ icon: 'fa-clock', text: `About ${singleMin[1]} minutes` });

    const hours = step.match(/(\d+)\s*(?:\+?\s*)?hours?/i);
    if (hours) tips.push({ icon: 'fa-clock', text: `At least ${hours[1]} hour(s)` });

    if (/until golden|until brown|until crispy/.test(lower)) {
      tips.push({ icon: 'fa-eye', text: 'Done when golden brown' });
    }
    if (/until tender|until soft|until cooked through/.test(lower)) {
      tips.push({ icon: 'fa-eye', text: 'Done when fork-tender' });
    }
    if (/until set|until firm/.test(lower)) {
      tips.push({ icon: 'fa-eye', text: 'Done when set in the center' });
    }
    if (/internal temp|165|145|160/.test(lower)) {
      tips.push({ icon: 'fa-thermometer', text: 'Use a meat thermometer if unsure' });
    }
    if (/season|salt and pepper/.test(lower)) {
      tips.push({ icon: 'fa-pepper-hot', text: 'Taste and adjust seasoning' });
    }

    return tips;
  }

  function newbieHints(step, stepIndex, total) {
    const hints = [];
    const lower = step.toLowerCase();

    if (stepIndex === 0 && /chicken|beef|steak|pork|fish|salmon|shrimp|turkey/.test(lower)) {
      hints.push('Pat meat dry with a paper towel for better browning.');
    }
    if (/oil|butter/.test(lower) && /pan|skillet|sauté|saute|fry/.test(lower)) {
      hints.push('Heat the pan first, then add oil — it should shimmer lightly.');
    }
    if (/rice|quinoa|pasta|noodles/.test(lower) && /cook|simmer|boil/.test(lower)) {
      hints.push('Use plenty of water and stir occasionally so nothing sticks.');
    }
    if (stepIndex === total - 1 && /serve|top|plate|drizzle/.test(lower)) {
      hints.push('Let hot food cool 1–2 minutes before eating.');
    }

    return hints;
  }

  function buildSteps(text, recipe) {
    const parsed = parseSteps(text);
    return parsed.map((step, i) => ({
      step,
      meta: classifyStep(step),
      tips: extractTips(step),
      hints: newbieHints(step, i, parsed.length),
      number: i + 1,
    }));
  }

  function renderHtml(text, recipe, escapeFn) {
    const steps = buildSteps(text, recipe);
    if (!steps.length) {
      return '<p class="text-sm text-slate-400 italic">No cooking instructions yet.</p>';
    }

    const prepTime = recipe?.prepTime ? `~${recipe.prepTime} min total` : null;
    const beforeYouStart = {
      step: 'Read through all steps first. Gather every ingredient, grab a cutting board, and wash your hands.',
      meta: { icon: 'fa-list-check', label: 'Before you start', color: 'emerald' },
      tips: prepTime ? [{ icon: 'fa-clock', text: prepTime }] : [],
      hints: ['It\'s OK to go slow — cooking is easier one step at a time.'],
      number: 0,
      isPrep: true,
    };

    const allSteps = [beforeYouStart, ...steps];

    return `
      <div class="recipe-steps-newbie">
        <p class="text-xs text-slate-500 mb-3 flex items-center gap-1.5">
          <i class="fa-solid fa-graduation-cap text-emerald-500"></i>
          ${allSteps.length - 1} cooking step${steps.length === 1 ? '' : 's'} — follow in order
        </p>
        ${allSteps.map((s, idx) => `
          <div class="recipe-step-card ${s.isPrep ? 'recipe-step-prep' : ''}">
            <div class="recipe-step-num ${s.isPrep ? 'prep' : ''}">${s.isPrep ? '✓' : s.number}</div>
            <div class="recipe-step-body">
              <div class="recipe-step-label label-${s.meta.color}">
                <i class="fa-solid ${s.meta.icon}"></i> ${s.meta.label}
              </div>
              <p class="recipe-step-text">${escapeFn(ensurePeriod(s.step))}</p>
              ${s.tips.length ? `
                <div class="recipe-step-tips">
                  ${s.tips.map((t) => `<span><i class="fa-solid ${t.icon}"></i> ${escapeFn(t.text)}</span>`).join('')}
                </div>` : ''}
              ${s.hints.length ? `
                <div class="recipe-step-hints">
                  <i class="fa-solid fa-lightbulb"></i>
                  ${s.hints.map((h) => escapeFn(h)).join(' · ')}
                </div>` : ''}
            </div>
          </div>
        `).join('')}
      </div>`;
  }

  return { parseSteps, buildSteps, renderHtml, classifyStep };
})();