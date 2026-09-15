/**
 * mQuickCalc Health MCP Server — v3 (14 tools, AI-high-frequency)
 * Prioritizes: BMI/BMR/TDEE/Calorie/Macro (AI agents call these most)
 * Dropped: rare tools (BAC, ovulation, pregnancy, blood sugar, MAP, BSA)
 */
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { CallToolRequestSchema, ListToolsRequestSchema } from '@modelcontextprotocol/sdk/types.js';

const r2 = n => Math.round(n * 100) / 100;
const r1 = n => Math.round(n * 10) / 10;
const pos = (v, n) => { const x = parseFloat(v); if (isNaN(x) || x < 0) throw new Error(`${n} must be positive`); return x; };

// ─── Core Health ───────────────────────────────────────────────────────────

function bmiCalc({ weightKg, heightCm }) {
  const w = pos(weightKg, 'weightKg'); const h = pos(heightCm, 'heightCm') / 100;
  const bmi = w / (h * h);
  const who = bmi < 18.5 ? 'Underweight' : bmi < 25 ? 'Normal' : bmi < 30 ? 'Overweight' : 'Obese';
  const asian = bmi < 18.5 ? 'Underweight' : bmi < 23 ? 'Normal' : bmi < 25 ? 'Overweight' : 'Obese';
  return { bmi: r2(bmi), whoCategory: who, asianCategory: asian, healthyWeightRangeKg: { whoMin: r2(18.5 * h * h), whoMax: r2(24.9 * h * h), asianMax: r2(22.9 * h * h) }, formula: 'weight(kg) / height(m)²', source: 'WHO / Asian-Pacific Standard' };
}

function bmrCalc({ weightKg, heightCm, age, sex }) {
  const w = pos(weightKg, 'weightKg'); const h = pos(heightCm, 'heightCm');
  const a = parseInt(age); const s = (sex || '').toLowerCase();
  if (!a || a < 1 || a > 120) throw new Error('age must be 1-120');
  if (s !== 'male' && s !== 'female') throw new Error('sex must be male or female');
  const bmr = s === 'male' ? 10 * w + 6.25 * h - 5 * a + 5 : 10 * w + 6.25 * h - 5 * a - 161;
  return { bmrKcal: r1(bmr), formula: s === 'male' ? '10w + 6.25h − 5a + 5' : '10w + 6.25h − 5a − 161', source: 'Mifflin-St Jeor (1990)' };
}

function tdeeCalc({ weightKg, heightCm, age, sex, activityLevel = 'sedentary' }) {
  const w = pos(weightKg, 'weightKg'); const h = pos(heightCm, 'heightCm');
  const a = parseInt(age); const s = (sex || '').toLowerCase();
  const level = (activityLevel || 'sedentary').toLowerCase().replace(' ', '');
  const mults = { sedentary: 1.2, lightlyactive: 1.375, moderatelyactive: 1.55, veryactive: 1.725, extraactive: 1.9 };
  const mult = mults[level] || 1.2;
  const bmr = s === 'male' ? 10 * w + 6.25 * h - 5 * a + 5 : 10 * w + 6.25 * h - 5 * a - 161;
  const tdee = bmr * mult;
  return { bmrKcal: r1(bmr), tdeeKcal: r1(tdee), activityMultiplier: mult, activityLevel: level, weightLoss: { mild: r1(tdee - 250), moderate: r1(tdee - 500) }, weightGain: { mild: r1(tdee + 250), moderate: r1(tdee + 500) } };
}

function calorieCalc({ weightKg, heightCm, age, sex, activityLevel = 'sedentary', goal = 'maintain' }) {
  const w = pos(weightKg, 'weightKg'); const h = pos(heightCm, 'heightCm');
  const a = parseInt(age); const s = (sex || '').toLowerCase();
  const level = (activityLevel || 'sedentary').toLowerCase().replace(' ', '');
  const mults = { sedentary: 1.2, lightlyactive: 1.375, moderatelyactive: 1.55, veryactive: 1.725, extraactive: 1.9 };
  const bmr = s === 'male' ? 10 * w + 6.25 * h - 5 * a + 5 : 10 * w + 6.25 * h - 5 * a - 161;
  const tdee = bmr * (mults[level] || 1.2);
  const adj = goal === 'lose' ? -500 : goal === 'gain' ? 300 : 0;
  return { bmrKcal: r1(bmr), tdeeKcal: r1(tdee), targetKcal: r1(tdee + adj), goal };
}

function macroCalc({ targetCalories, proteinPercent = 30, carbsPercent = 40, fatPercent = 30 }) {
  const c = pos(targetCalories, 'targetCalories');
  const pp = parseFloat(proteinPercent), cp = parseFloat(carbsPercent), fp = parseFloat(fatPercent);
  if (Math.abs(pp + cp + fp - 100) > 2) throw new Error('Percentages must sum to ~100');
  return { targetCalories: r1(c), grams: { protein: r1(c * pp / 100 / 4), carbs: r1(c * cp / 100 / 4), fat: r1(c * fp / 100 / 9) }, percentages: { protein: pp, carbs: cp, fat: fp }, presets: { balanced: [30, 40, 30], keto: [25, 5, 70], lowCarb: [35, 5, 60], highProtein: [40, 35, 25] } };
}

function bodyFatCalc({ weightKg, heightCm, age, sex, waistCm, neckCm, hipCm }) {
  const w = pos(weightKg, 'weightKg'); const h = pos(heightCm, 'heightCm');
  const s = (sex || '').toLowerCase();
  if (s !== 'male' && s !== 'female') throw new Error('sex must be male or female');
  if (!waistCm || !neckCm) throw new Error('waistCm and neckCm are required');
  const waist = parseFloat(waistCm), neck = parseFloat(neckCm);
  let bf;
  if (s === 'male') bf = 495 / (1.0324 - 0.19077 * Math.log10(waist - neck) + 0.15456 * Math.log10(h)) - 450;
  else { const hip = parseFloat(hipCm); bf = 495 / (1.29579 - 0.35004 * Math.log10(waist + hip - neck) + 0.22100 * Math.log10(h)) - 450; }
  const bfClamped = Math.max(1, Math.min(59, bf));
  const cats = s === 'male' ? { essential: '2-5%', athletes: '6-13%', fitness: '14-17%', average: '18-24%', obese: '>25%' } : { essential: '10-13%', athletes: '14-20%', fitness: '21-24%', average: '25-31%', obese: '>32%' };
  return { bodyFatPercent: r1(bfClamped), category: cats, formula: 'US Navy Method', leanMassKg: r2(w * (1 - bfClamped / 100)) };
}

// ─── Fitness ────────────────────────────────────────────────────────────────

function oneRepMaxCalc({ weight, reps, formula = 'brzycki' }) {
  const w = pos(weight, 'weight'); const r = parseInt(reps);
  if (r < 1 || r > 30) throw new Error('reps should be 1-30 for accurate 1RM');
  const fns = { brzycki: w * 36 / (37 - r), eppley: w * (1 + r / 30) };
  const orm = r1(fns[formula] || fns.brzycki);
  return { weightUsed: w, reps: r, formula, estimated1RM: orm, trainingLoads: { '100%': orm, '90%': r1(orm * 0.90), '85%': r1(orm * 0.85), '80%': r1(orm * 0.80), '75%': r1(orm * 0.75) } };
}

function targetHeartRateCalc({ age, restingHeartRate = 70, maxHeartRate }) {
  const a = parseInt(age); if (!a || a < 1 || a > 120) throw new Error('age must be 1-120');
  const max = maxHeartRate ? parseFloat(maxHeartRate) : 220 - a;
  const rest = parseFloat(restingHeartRate) || 70;
  const reserve = max - rest;
  const zones = [
    { zone: 1, name: 'Warm-up', min: r1(rest + reserve * 0.50), max: r1(rest + reserve * 0.60) },
    { zone: 2, name: 'Fat Burn', min: r1(rest + reserve * 0.60), max: r1(rest + reserve * 0.70) },
    { zone: 3, name: 'Aerobic', min: r1(rest + reserve * 0.70), max: r1(rest + reserve * 0.80) },
    { zone: 4, name: 'Threshold', min: r1(rest + reserve * 0.80), max: r1(rest + reserve * 0.90) },
    { zone: 5, name: 'Max', min: r1(rest + reserve * 0.90), max: max },
  ];
  return { age: a, maxHeartRate: max, restingHeartRate: rest, zones };
}

function vo2MaxCalc({ age, sex = 'male', restingHeartRate = 70, maxHeartRate }) {
  const a = parseInt(age); const max = maxHeartRate ? parseFloat(maxHeartRate) : 220 - a;
  const rest = parseFloat(restingHeartRate) || 70;
  const vo2 = 15.3 * (max / rest) - (sex === 'female' ? 1 : 0);
  const cat = vo2 > 50 ? 'Excellent' : vo2 > 40 ? 'Good' : vo2 > 30 ? 'Average' : 'Below Average';
  return { vo2Max: r1(Math.max(1, vo2)), category: cat, formula: 'Uth-Sørensen-Overstand' };
}

function runningPaceCalc({ distanceKm, timeMinutes }) {
  const d = pos(distanceKm, 'distanceKm'); const t = pos(timeMinutes, 'timeMinutes');
  const pace = t / d;
  return { distanceKm: d, timeMinutes: t, pacePerKm: { min: Math.floor(pace), sec: Math.round((pace % 1) * 60) }, projectedHalfMarathon: r1(pace * 21.1), projectedMarathon: r1(pace * 42.2) };
}

// ─── Sleep / Weight ────────────────────────────────────────────────────────

function idealWeightCalc({ heightCm, sex = 'male' }) {
  const h = pos(heightCm, 'heightCm');
  const robinson = sex === 'male' ? 52 + 1.9 * (h - 152.4) / 2.54 : 49 + 1.7 * (h - 152.4) / 2.54;
  const broca = sex === 'male' ? h - 100 : h - 110;
  return { heightCm: h, sex, robinsonKg: r2(robinson), brocaKg: r2(broca) };
}

function sleepCalc({ wakeTime = '07:00', sleepHours = 8 }) {
  const [h, m] = (wakeTime || '07:00').split(':').map(Number);
  const totalMins = (h * 60 + m) - (sleepHours * 60);
  const bedH = Math.floor(totalMins / 60), bedM = ((totalMins % 60) + 60) % 60;
  return { wakeTime, sleepGoalHours: sleepHours, recommendedBedtime: `${String(Math.abs(bedH)).padStart(2,'0')}:${String(bedM).padStart(2,'0')}`, sleepCycles: Math.floor(sleepHours / 1.5) };
}

function sleepDebtCalc({ weekdaySleep = 6, weekendSleep = 9, targetSleep = 8 }) {
  const wd = parseFloat(weekdaySleep) || 6, we = parseFloat(weekendSleep) || 9, target = parseFloat(targetSleep) || 8;
  const debt = Math.max(0, target * 7 - (wd * 5 + we * 2));
  return { weekdayHours: wd, weekendHours: we, targetHours: target, weeklySleepHours: r1(wd * 5 + we * 2), sleepDebtHours: r1(debt), recoveryNights30minExtra: Math.ceil(debt / 0.5) };
}

// ─── Nutrition ────────────────────────────────────────────────────────────

function kjToCalories({ kilojoules }) {
  const kj = pos(kilojoules, 'kilojoules');
  return { kilojoules: r2(kj), kilocalories: r2(kj / 4.184), note: '1 kcal = 4.184 kJ' };
}

function proteinCalc({ weightKg, goal = 'maintain' }) {
  const w = pos(weightKg, 'weightKg');
  const gramsPerKg = { cut: 2.0, maintain: 1.6, bulk: 2.0 }[goal] || 1.6;
  return { weightKg: w, goal, proteinGramsPerKg: gramsPerKg, dailyProteinGrams: r1(w * gramsPerKg) };
}

// ─── MCP ─────────────────────────────────────────────────────────────────

const TOOLS = [
  { name: 'bmi_calculator', description: 'BMI from weight(kg) and height(cm). Returns WHO and Asian-Pacific categories with healthy weight range.', inputSchema: { type: 'object', properties: { weightKg: { type: 'number' }, heightCm: { type: 'number' } }, required: ['weightKg', 'heightCm'] } },
  { name: 'bmr_calculator', description: 'Basal Metabolic Rate via Mifflin-St Jeor. Male: 10w+6.25h−5a+5. Female: 10w+6.25h−5a−161.', inputSchema: { type: 'object', properties: { weightKg: { type: 'number' }, heightCm: { type: 'number' }, age: { type: 'number' }, sex: { type: 'string', enum: ['male', 'female'] } }, required: ['weightKg', 'heightCm', 'age', 'sex'] } },
  { name: 'tdee_calculator', description: 'Total Daily Energy Expenditure = BMR × activity multiplier. Returns weight loss/gain targets.', inputSchema: { type: 'object', properties: { weightKg: { type: 'number' }, heightCm: { type: 'number' }, age: { type: 'number' }, sex: { type: 'string', enum: ['male', 'female'] }, activityLevel: { type: 'string', enum: ['sedentary', 'lightlyActive', 'moderatelyActive', 'veryActive', 'extraActive'] } }, required: ['weightKg', 'heightCm', 'age', 'sex'] } },
  { name: 'daily_calorie_calculator', description: 'Target daily calories for maintain/lose/gain. Combines BMR + activity + goal adjustment (−500 kcal for weight loss, +300 for gain).', inputSchema: { type: 'object', properties: { weightKg: { type: 'number' }, heightCm: { type: 'number' }, age: { type: 'number' }, sex: { type: 'string', enum: ['male', 'female'] }, activityLevel: { type: 'string' }, goal: { type: 'string', enum: ['maintain', 'lose', 'gain'] } }, required: ['weightKg', 'heightCm', 'age', 'sex', 'goal'] } },
  { name: 'macro_calculator', description: 'Protein/carbs/fat grams from target calories and percentage split. Presets: balanced, keto, low-carb, high-protein.', inputSchema: { type: 'object', properties: { targetCalories: { type: 'number' }, proteinPercent: { type: 'number' }, carbsPercent: { type: 'number' }, fatPercent: { type: 'number' } }, required: ['targetCalories'] } },
  { name: 'body_fat_calculator', description: 'Body fat % via US Navy Method (waist + neck + height ± hip for females). Also returns lean body mass.', inputSchema: { type: 'object', properties: { weightKg: { type: 'number' }, heightCm: { type: 'number' }, age: { type: 'number' }, sex: { type: 'string', enum: ['male', 'female'] }, waistCm: { type: 'number' }, neckCm: { type: 'number' }, hipCm: { type: 'number' } }, required: ['weightKg', 'heightCm', 'age', 'sex', 'waistCm', 'neckCm'] } },
  { name: 'ideal_weight_calculator', description: 'Ideal body weight via Robinson and Broca formulas for a given height and sex.', inputSchema: { type: 'object', properties: { heightCm: { type: 'number' }, sex: { type: 'string', enum: ['male', 'female'] } }, required: ['heightCm'] } },
  { name: 'protein_calculator', description: 'Daily protein needs from body weight and goal (cut: 2g/kg, maintain: 1.6g/kg, bulk: 2g/kg).', inputSchema: { type: 'object', properties: { weightKg: { type: 'number' }, goal: { type: 'string', enum: ['cut', 'maintain', 'bulk'] } }, required: ['weightKg'] } },
  { name: 'kj_to_calories_converter', description: 'Convert kilojoules to kilocalories. 1 kcal = 4.184 kJ.', inputSchema: { type: 'object', properties: { kilojoules: { type: 'number' } }, required: ['kilojoules'] } },
  { name: 'one_rep_max_calculator', description: 'Estimate 1-rep max (1RM) from weight and reps. Brzycki or Epley formula. Returns training loads at 100%/90%/85%/80%/75%.', inputSchema: { type: 'object', properties: { weight: { type: 'number' }, reps: { type: 'number' }, formula: { type: 'string', enum: ['brzycki', 'eppley'] } }, required: ['weight', 'reps'] } },
  { name: 'target_heart_rate_calculator', description: '5-zone heart rate training system via Karvonen formula (age + resting HR → HR reserve → zones).', inputSchema: { type: 'object', properties: { age: { type: 'number' }, restingHeartRate: { type: 'number' }, maxHeartRate: { type: 'number' } }, required: ['age'] } },
  { name: 'vo2max_calculator', description: 'Estimate VO2 Max from max HR and resting HR. Uth-Sørensen-Overstand formula.', inputSchema: { type: 'object', properties: { age: { type: 'number' }, sex: { type: 'string', enum: ['male', 'female'] }, restingHeartRate: { type: 'number' }, maxHeartRate: { type: 'number' } }, required: ['age'] } },
  { name: 'running_pace_calculator', description: 'Calculate pace per km from distance and time. Projects equivalent half-marathon and marathon times.', inputSchema: { type: 'object', properties: { distanceKm: { type: 'number' }, timeMinutes: { type: 'number' } }, required: ['distanceKm', 'timeMinutes'] } },
  { name: 'sleep_calculator', description: 'Calculate recommended bedtime from wake time and sleep goal. Based on 90-minute sleep cycles.', inputSchema: { type: 'object', properties: { wakeTime: { type: 'string' }, sleepHours: { type: 'number' } } } },
  { name: 'sleep_debt_calculator', description: 'Calculate weekly sleep debt vs target. Shows how many extra 30-min sleep sessions needed to recover.', inputSchema: { type: 'object', properties: { weekdaySleep: { type: 'number' }, weekendSleep: { type: 'number' }, targetSleep: { type: 'number' } }, required: ['weekdaySleep', 'weekendSleep'] } },
];

const server = new Server({ name: 'mquickcalc-health-mcp', version: '3.0.0' }, { capabilities: { tools: {} } });
server.setRequestHandler(ListToolsRequestSchema, async () => ({ tools: TOOLS }));
server.setRequestHandler(CallToolRequestSchema, async ({ params }) => {
  const { name, arguments: args = {} } = params;
  const fns = {
    bmi_calculator: () => bmiCalc(args), bmr_calculator: () => bmrCalc(args), tdee_calculator: () => tdeeCalc(args),
    daily_calorie_calculator: () => calorieCalc(args), macro_calculator: () => macroCalc(args),
    body_fat_calculator: () => bodyFatCalc(args), ideal_weight_calculator: () => idealWeightCalc(args),
    protein_calculator: () => proteinCalc(args), kj_to_calories_converter: () => kjToCalories(args),
    one_rep_max_calculator: () => oneRepMaxCalc(args), target_heart_rate_calculator: () => targetHeartRateCalc(args),
    vo2max_calculator: () => vo2MaxCalc(args), running_pace_calculator: () => runningPaceCalc(args),
    sleep_calculator: () => sleepCalc(args), sleep_debt_calculator: () => sleepDebtCalc(args),
  };
  const fn = fns[name];
  if (!fn) return { content: [{ type: 'text', text: `Unknown: ${name}` }], isError: true };
  try { return { content: [{ type: 'text', text: JSON.stringify(fn(), null, 2) }] }; }
  catch (e) { return { content: [{ type: 'text', text: `Error: ${e.message}` }], isError: true }; }
});
const transport = new StdioServerTransport();
server.connect(transport).catch(e => { console.error(e); process.exit(1); });
