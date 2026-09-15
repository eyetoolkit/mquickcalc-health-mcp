/**
 * mQuickCalc Health MCP Server — v2 (15 tools)
 * Covers: BMI, BMR, TDEE, Calorie, Macro, Body Composition, Heart Rate, VO2 Max
 */
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { CallToolRequestSchema, ListToolsRequestSchema } from '@modelcontextprotocol/sdk/types.js';

function requirePositive(value, name) {
  const n = parseFloat(value);
  if (isNaN(n) || n < 0) throw new Error(`${name} must be a positive number`);
  return n;
}
function round2(n) { return Math.round(n * 100) / 100; }
function round1(n) { return Math.round(n * 10) / 10; }

// ─── BMI / Weight ──────────────────────────────────────────────────────────

function bmiCalc({ weightKg, heightCm }) {
  const w = requirePositive(weightKg, 'weightKg');
  const h = requirePositive(heightCm, 'heightCm') / 100;
  const bmi = w / (h * h);
  const who = bmi < 18.5 ? 'Underweight' : bmi < 25 ? 'Normal' : bmi < 30 ? 'Overweight' : 'Obese';
  const asian = bmi < 18.5 ? 'Underweight' : bmi < 23 ? 'Normal' : bmi < 25 ? 'Overweight' : 'Obese';
  return {
    bmi: round2(bmi), who: { category: who }, asianStandard: { category: asian },
    healthyWeightRange: { whoMinKg: round2(18.5 * h * h), whoMaxKg: round2(24.9 * h * h), asianMaxKg: round2(22.9 * h * h) },
    formula: 'BMI = weight(kg) / height(m)²', source: 'WHO (global) / Asian-Pacific Standard (2000)',
  };
}

function reverseBmiCalc({ targetBmi, heightCm }) {
  const h = requirePositive(heightCm, 'heightCm') / 100;
  const target = parseFloat(targetBmi) || 22;
  const weight = target * h * h;
  return { targetBmi: target, heightCm: heightCm, targetWeightKg: round2(weight), formula: `weight = ${target} × ${h}²` };
}

function idealWeightCalc({ heightCm, sex = 'male', frame = 'medium' }) {
  const h = requirePositive(heightCm, 'heightCm');
  const base = (h - 100) * 0.90;
  const adjustments = { small: -0.10, medium: 0, large: 0.10 };
  const adj = adjustments[frame] || 0;
  const robinson = sex === 'male' ? 52 + 1.9 * (h - 152.4) / 2.54 : 49 + 1.7 * (h - 152.4) / 2.54;
  return { heightCm: h, sex, frame, robinsonMethodKg: round2(robinson), devineMethodKg: round2(base * (1 + adj)), brocaMethodKg: round2(sex === 'male' ? h - 100 : h - 110) };
}

// ─── BMR / TDEE / Calorie ────────────────────────────────────────────────

function bmrCalc({ weightKg, heightCm, age, sex }) {
  const w = requirePositive(weightKg, 'weightKg');
  const h = requirePositive(heightCm, 'heightCm');
  const a = parseInt(age);
  const s = (sex || '').toLowerCase();
  if (!a || a < 1 || a > 120) throw new Error('age must be 1-120');
  if (s !== 'male' && s !== 'female') throw new Error('sex must be "male" or "female"');
  const bmr = s === 'male' ? 10 * w + 6.25 * h - 5 * a + 5 : 10 * w + 6.25 * h - 5 * a - 161;
  return { bmr: round1(bmr), formula: s === 'male' ? '10×w + 6.25×h − 5×age + 5' : '10×w + 6.25×h − 5×age − 161', source: 'Mifflin-St Jeor (1990)' };
}

function tdeeCalc({ weightKg, heightCm, age, sex, activityLevel = 'sedentary' }) {
  const w = requirePositive(weightKg, 'weightKg');
  const h = requirePositive(heightCm, 'heightCm');
  const a = parseInt(age);
  const s = (sex || '').toLowerCase();
  const level = (activityLevel || 'sedentary').toLowerCase().replace(' ', '');
  const multipliers = { sedentary: 1.2, lightlyactive: 1.375, moderatelyactive: 1.55, veryactive: 1.725, extraactive: 1.9 };
  const mult = multipliers[level] || 1.2;
  const bmr = s === 'male' ? 10 * w + 6.25 * h - 5 * a + 5 : 10 * w + 6.25 * h - 5 * a - 161;
  const tdee = bmr * mult;
  return {
    bmr: round1(bmr), tdee: round1(tdee), activityMultiplier: mult, activityLevel: level,
    weightLoss: { mild: round1(tdee - 250), moderate: round1(tdee - 500), extreme: round1(tdee - 1000) },
    weightGain: { mild: round1(tdee + 250), moderate: round1(tdee + 500) },
  };
}

function calorieCalc({ weightKg, heightCm, age, sex, activityLevel = 'sedentary', goal = 'maintain' }) {
  const w = requirePositive(weightKg, 'weightKg');
  const h = requirePositive(heightCm, 'heightCm');
  const a = parseInt(age);
  const s = (sex || '').toLowerCase();
  const level = (activityLevel || 'sedentary').toLowerCase().replace(' ', '');
  const multipliers = { sedentary: 1.2, lightlyactive: 1.375, moderatelyactive: 1.55, veryactive: 1.725, extraactive: 1.9 };
  const bmr = s === 'male' ? 10 * w + 6.25 * h - 5 * a + 5 : 10 * w + 6.25 * h - 5 * a - 161;
  const tdee = bmr * (multipliers[level] || 1.2);
  const adj = goal === 'lose' ? -500 : goal === 'gain' ? 300 : 0;
  return { bmr: round1(bmr), tdee: round1(tdee), targetCalories: round1(tdee + adj), goal, deficit: goal === 'lose' ? 500 : null };
}

function calorieDeficitCalc({ weightKg, heightCm, age, sex, activityLevel = 'sedentary', weeklyGoalKg = 0.5 }) {
  const w = requirePositive(weightKg, 'weightKg');
  const h = requirePositive(heightCm, 'heightCm');
  const a = parseInt(age);
  const s = (sex || '').toLowerCase();
  const level = (activityLevel || 'sedentary').toLowerCase().replace(' ', '');
  const multipliers = { sedentary: 1.2, lightlyactive: 1.375, moderatelyactive: 1.55, veryactive: 1.725, extraactive: 1.9 };
  const bmr = s === 'male' ? 10 * w + 6.25 * h - 5 * a + 5 : 10 * w + 6.25 * h - 5 * a - 161;
  const tdee = bmr * (multipliers[level] || 1.2);
  const dailyDeficit = (weeklyGoalKg * 7700) / 7;
  return { tdee: round1(tdee), dailyDeficit: round1(dailyDeficit), targetCalories: round1(tdee - dailyDeficit), weeklyGoalKg, expectedWeeklyLossKg: weeklyGoalKg };
}

function bmiToCaloriesBurnedCalc({ bmiValue, durationMinutes = 30, activity = 'walking' }) {
  const bmi = parseFloat(bmiValue) || 22;
  const duration = parseFloat(durationMinutes) || 30;
  const metValues = { walking: 3.5, jogging: 7, cycling: 5.5, swimming: 6, strength: 4.5 };
  const met = metValues[activity] || 4.0;
  const estimatedCals = met * (bmi / 22) * (duration / 60) * 70;
  return { bmi: bmi, durationMinutes: duration, activity, caloriesBurned: round1(estimatedCals), note: 'Estimate based on MET × body weight ratio' };
}

// ─── Macros / Nutrition ────────────────────────────────────────────────────

function macroCalc({ targetCalories, proteinPercent = 30, carbsPercent = 40, fatPercent = 30 }) {
  const c = requirePositive(targetCalories, 'targetCalories');
  const pp = parseFloat(proteinPercent), cp = parseFloat(carbsPercent), fp = parseFloat(fatPercent);
  if (Math.abs(pp + cp + fp - 100) > 1) throw new Error('Percentages must sum to ~100');
  return {
    targetCalories: round1(c),
    grams: { protein: round1(c * pp / 100 / 4), carbs: round1(c * cp / 100 / 4), fat: round1(c * fp / 100 / 9) },
    caloriesFromMacros: round1(c * pp / 100 + c * cp / 100 + c * fp / 100),
    presets: { balanced: [30, 40, 30], lowCarb: [35, 5, 60], keto: [25, 5, 70], highProtein: [40, 35, 25], athletic: [30, 50, 20] },
  };
}

function proteinCalc({ weightKg, activityLevel = 'moderate', goal = 'maintain' }) {
  const w = requirePositive(weightKg, 'weightKg');
  const multipliers = { sedentary: 0.8, light: 1.0, moderate: 1.2, active: 1.4, veryActive: 1.6 };
  const goalMultipliers = { cut: 0.20, maintain: 0.15, bulk: 0.22 };
  const g = (multipliers[activityLevel] || 1.2) * (goalMultipliers[goal] || 0.15);
  return { weightKg: w, activityLevel, goal, proteinPerKg: round1(g), dailyProteinGrams: round1(w * g), caloriesFromProtein: round1(w * g * 4) };
}

function kjToCaloriesCalc({ kilojoules }) {
  const kj = requirePositive(kilojoules, 'kilojoules');
  return { kilojoules: round2(kj), kilocalories: round2(kj / 4.184), note: '1 kcal = 4.184 kJ' };
}

// ─── Body Composition ─────────────────────────────────────────────────────

function bodyFatCalc({ weightKg, heightCm, age, sex, waistCm, neckCm, hipCm }) {
  const w = requirePositive(weightKg, 'weightKg');
  const h = requirePositive(heightCm, 'heightCm');
  const a = parseInt(age);
  const s = (sex || '').toLowerCase();
  if (s !== 'male' && s !== 'female') throw new Error('sex must be "male" or "female"');
  if (!waistCm || !neckCm) throw new Error('waistCm and neckCm are required');
  if (s === 'female' && !hipCm) throw new Error('hipCm is required for females');
  const waistM = parseFloat(waistCm) / 100, neckM = parseFloat(neckCm) / 100;
  const hipM = s === 'female' ? parseFloat(hipCm) / 100 : 0;
  const bf = s === 'male'
    ? 495 / (1.0324 - 0.19077 * Math.log10((waistM - neckM) * 100) + 0.15456 * Math.log10(h)) - 450
    : 495 / (1.29579 - 0.35004 * Math.log10((waistM + hipM - neckM) * 100) + 0.22100 * Math.log10(h)) - 450;
  const categories = s === 'male'
    ? { essential: '2-5%', athletes: '6-13%', fitness: '14-17%', average: '18-24%', obese: '>25%' }
    : { essential: '10-13%', athletes: '14-20%', fitness: '21-24%', average: '25-31%', obese: '>32%' };
  return { bodyFatPercent: round1(Math.max(1, Math.min(60, bf))), category: categories, formula: 'US Navy Method', leanBodyMassKg: round2(w * (1 - Math.max(0, Math.min(1, bf / 100)))) };
}

function leanBodyMassCalc({ weightKg, sex = 'male', heightCm }) {
  const w = requirePositive(weightKg, 'weightKg');
  const h = requirePositive(heightCm, 'heightCm');
  const s = (sex || '').toLowerCase();
  const lbm = s === 'male' ? w * 0.32810 + 0.33929 * h - 29.5336 : w * 0.29569 + 0.41813 * h - 43.2933;
  return { weightKg: round2(w), heightCm: h, sex, leanBodyMassKg: round2(Math.max(0, lbm)), formula: 'Boer Formula' };
}

// ─── Heart Rate / Cardio ─────────────────────────────────────────────────

function targetHeartRateCalc({ age, restingHeartRate = 70, maxHeartRate }) {
  const a = parseInt(age);
  if (!a || a < 1 || a > 120) throw new Error('age must be 1-120');
  const max = maxHeartRate ? parseFloat(maxHeartRate) : 220 - a;
  const rest = parseFloat(restingHeartRate) || 70;
  const hrReserve = max - rest;
  const zones = [
    { name: 'Zone 1 (Warm-up)', min: round1(rest + hrReserve * 0.50), max: round1(rest + hrReserve * 0.60) },
    { name: 'Zone 2 (Fat Burn)', min: round1(rest + hrReserve * 0.60), max: round1(rest + hrReserve * 0.70) },
    { name: 'Zone 3 (Aerobic)', min: round1(rest + hrReserve * 0.70), max: round1(rest + hrReserve * 0.80) },
    { name: 'Zone 4 (Threshold)', min: round1(rest + hrReserve * 0.80), max: round1(rest + hrReserve * 0.90) },
    { name: 'Zone 5 (Max)', min: round1(rest + hrReserve * 0.90), max: max },
  ];
  return { age: a, maxHeartRate: max, restingHeartRate: rest, hrReserve: hrReserve, zones };
}

function vo2MaxCalc({ age, sex = 'male', restingHeartRate = 70, maxHeartRate }) {
  const a = parseInt(age);
  const s = (sex || '').toLowerCase();
  const max = maxHeartRate ? parseFloat(maxHeartRate) : 220 - a;
  const rest = parseFloat(restingHeartRate) || 70;
  const vo2 = s === 'male' ? 15.3 * (max / rest) : 15.3 * (max / rest) - 1;
  const categories = vo2 > 50 ? 'Excellent' : vo2 > 40 ? 'Good' : vo2 > 30 ? 'Average' : 'Below Average';
  return { vo2Max: round1(Math.max(1, vo2)), category: categories, formula: 'Uth-Sørensen-Overstand estimate' };
}

function heartRateZonesCalc({ age, maxHeartRate }) {
  const a = parseInt(age);
  if (!a || a < 1 || a > 120) throw new Error('age must be 1-120');
  const max = maxHeartRate ? parseFloat(maxHeartRate) : 220 - a;
  const zones = [
    { zone: 1, name: 'Very Light', range: `50-60%`, bpmMin: round1(max * 0.50), bpmMax: round1(max * 0.60) },
    { zone: 2, name: 'Light', range: '60-70%', bpmMin: round1(max * 0.60), bpmMax: round1(max * 0.70) },
    { zone: 3, name: 'Moderate', range: '70-80%', bpmMin: round1(max * 0.70), bpmMax: round1(max * 0.80) },
    { zone: 4, name: 'Hard', range: '80-90%', bpmMin: round1(max * 0.80), bpmMax: round1(max * 0.90) },
    { zone: 5, name: 'Maximum', range: '90-100%', bpmMin: round1(max * 0.90), bpmMax: max },
  ];
  return { age: a, maxHeartRate: max, zones };
}

function runningPaceCalc({ distanceKm, timeMinutes }) {
  const d = requirePositive(distanceKm, 'distanceKm');
  const t = requirePositive(timeMinutes, 'timeMinutes');
  const pacePerKm = t / d;
  const halfMarathon = pacePerKm * 21.1;
  const marathon = pacePerKm * 42.2;
  return {
    distanceKm: d, timeMinutes: t, pacePerKmMin: round1(Math.floor(pacePerKm)), pacePerKmSec: round1((pacePerKm % 1) * 60),
    equivalentHalfMarathon: round1(halfMarathon), equivalentMarathon: round1(marathon),
  };
}

// ─── Sleep / Lifestyle ───────────────────────────────────────────────────

function sleepCalc({ wakeTime = '07:00', sleepDurationGoal = 8 }) {
  const [h, m] = (wakeTime || '07:00').split(':').map(Number);
  const totalMins = (h * 60 + m) - (sleepDurationGoal * 60);
  const bedTimeH = Math.floor(totalMins / 60), bedTimeM = ((totalMins % 60) + 60) % 60;
  return {
    wakeTime, sleepGoalHours: sleepDurationGoal,
    recommendedBedtime: `${String(Math.abs(bedTimeH)).padStart(2, '0')}:${String(bedTimeM).padStart(2, '0')}`,
    sleepCycles: Math.floor(sleepDurationGoal / 1.5),
    note: 'Based on 90-minute sleep cycles for full sleep stages',
  };
}

function sleepDebtCalc({ weekdaySleep = 6, weekendSleep = 9, targetSleep = 8 }) {
  const wd = parseFloat(weekdaySleep) || 6;
  const we = parseFloat(weekendSleep) || 9;
  const target = parseFloat(targetSleep) || 8;
  const weeklySleep = wd * 5 + we * 2;
  const idealWeekly = target * 7;
  const debt = Math.max(0, idealWeekly - weeklySleep);
  return { weekdaySleepHours: wd, weekendSleepHours: we, targetHours: target, weeklySleepHours: round1(weeklySleep), idealWeeklyHours: idealWeekly, sleepDebtHours: round1(debt), recoveryNights: round1(debt / 0.5) };
}

function ovulationCalc({ lastPeriodStart = '', cycleLength = 28 }) {
  const cycle = parseInt(cycleLength) || 28;
  // Simple calculation: ovulation is ~14 days before next period
  const fertileStart = cycle - 18;
  const fertileEnd = cycle - 10;
  return {
    cycleLength: cycle, ovulationDay: cycle - 14, fertileWindowStart: fertileStart, fertileWindowEnd: fertileEnd,
    note: 'Based on average cycle; varies significantly between individuals. Not a contraceptive method.',
  };
}

function dueDateCalc({ lastPeriodStart }) {
  if (!lastPeriodStart) throw new Error('lastPeriodStart (YYYY-MM-DD) is required');
  const lmp = new Date(lastPeriodStart);
  if (isNaN(lmp.getTime())) throw new Error('Invalid date format. Use YYYY-MM-DD.');
  const due = new Date(lmp.getTime() + 280 * 24 * 60 * 60 * 1000);
  const trimester1 = new Date(lmp.getTime() + 91 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
  const trimester2 = new Date(lmp.getTime() + 182 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
  return { lastPeriodStart, dueDate: due.toISOString().split('T')[0], endFirstTrimester: trimester1, endSecondTrimester: trimester2, note: "Naegele's rule: LMP + 280 days" };
}

// ─── Blood / Medical ──────────────────────────────────────────────────────

function bloodSugarConverter({ value, fromUnit = 'mgdl', toUnit = 'mmol' }) {
  const v = parseFloat(value);
  if (fromUnit === 'mgdl' && toUnit === 'mmol') return { value: round2(v / 18.0182), from: 'mg/dL', to: 'mmol/L' };
  if (fromUnit === 'mmol' && toUnit === 'mgdl') return { value: round2(v * 18.0182), from: 'mmol/L', to: 'mg/dL' };
  return { value: v, note: 'Currently only mg/dL ↔ mmol/L supported' };
}

function mapCalc({ systolic, diastolic }) {
  const sys = requirePositive(systolic, 'systolic');
  const dia = requirePositive(diastolic, 'diastolic');
  const map = (dia + (sys - dia) / 3);
  const category = map < 70 ? 'Low' : map < 85 ? 'Normal' : map < 110 ? 'Elevated' : 'High';
  return { systolic: sys, diastolic: dia, map: round1(map), category, note: 'MAP = diastolic + (systolic − diastolic) / 3' };
}

function waistToHeightCalc({ waistCm, heightCm }) {
  const w = requirePositive(waistCm, 'waistCm');
  const h = requirePositive(heightCm, 'heightCm');
  const ratio = round2(w / h);
  const category = ratio < 0.40 ? 'Underweight' : ratio < 0.50 ? 'Healthy' : ratio < 0.60 ? 'Overweight' : 'Obese';
  return { waistCm: w, heightCm: h, ratio: round2(w / h), category, note: 'Ratio < 0.50 is considered healthy for adults' };
}

// ─── Fitness / Sports ─────────────────────────────────────────────────────

function oneRepMaxCalc({ weight, reps, formula = 'brzycki' }) {
  const w = requirePositive(weight, 'weight');
  const r = parseInt(reps);
  if (r < 1 || r > 30) throw new Error('reps should be 1-30 for accurate 1RM estimation');
  const formulas = {
    brzycki: w * 36 / (37 - r),
    eppley: w * (1 + r / 30),
    lombardi: w * Math.pow(r, 0.10),
    oconner: w * (1 + r / 40),
  };
  const orm = round1(formulas[formula] || formulas.brzycki);
  return { weight: w, reps: r, formula, estimated1RM: orm, percentages: { '100%': orm, '95%': round1(orm * 0.95), '90%': round1(orm * 0.90), '85%': round1(orm * 0.85), '80%': round1(orm * 0.80) } };
}

function stepsToCaloriesCalc({ steps = 10000, weightKg = 70 }) {
  const s = requirePositive(steps, 'steps');
  const w = parseFloat(weightKg) || 70;
  // ~0.04 kcal per step per kg, normalized to 70kg
  const cals = s * 0.04 * (w / 70);
  return { steps: s, weightKg: w, caloriesBurned: round1(cals), note: 'Approximate; actual varies with speed and terrain' };
}

function metToCaloriesCalc({ met, weightKg, durationMinutes = 30 }) {
  const m = requirePositive(met, 'met');
  const w = requirePositive(weightKg, 'weightKg');
  const d = parseFloat(durationMinutes) || 30;
  const cals = m * w * (d / 60);
  return { met: m, weightKg: w, durationMinutes: d, caloriesBurned: round1(cals), formula: 'MET × weight(kg) × time(hours)' };
}

function bsaCalc({ weightKg, heightCm }) {
  const w = requirePositive(weightKg, 'weightKg');
  const h = requirePositive(heightCm, 'heightCm');
  const bsa = Math.sqrt((h * w) / 3600);
  return { weightKg: w, heightCm: h, bodySurfaceAreaM2: round2(bsa), formula: 'Mosteller √(height × weight / 3600)', commonUsages: 'Drug dosing, chemotherapy, ICU' };
}

// ─── MCP Server ───────────────────────────────────────────────────────────

const TOOLS = [
  { name: 'bmi_calculator', description: 'Calculate BMI from weight (kg) and height (cm). Returns WHO and Asian-Pacific standard categories plus healthy weight range.', inputSchema: { type: 'object', properties: { weightKg: { type: 'number' }, heightCm: { type: 'number' } }, required: ['weightKg', 'heightCm'] } },
  { name: 'reverse_bmi_calculator', description: 'Given target BMI and height, calculate target weight.', inputSchema: { type: 'object', properties: { targetBmi: { type: 'number' }, heightCm: { type: 'number' } }, required: ['targetBmi', 'heightCm'] } },
  { name: 'ideal_weight_calculator', description: 'Calculate ideal body weight using Robinson, Devine, and Broca formulas for a given height and sex.', inputSchema: { type: 'object', properties: { heightCm: { type: 'number' }, sex: { type: 'string', enum: ['male', 'female'] }, frame: { type: 'string', enum: ['small', 'medium', 'large'] } }, required: ['heightCm'] } },
  { name: 'bmr_calculator', description: 'Calculate BMR using Mifflin-St Jeor equation. Male: 10×w + 6.25×h − 5×age + 5. Female: 10×w + 6.25×h − 5×age − 161.', inputSchema: { type: 'object', properties: { weightKg: { type: 'number' }, heightCm: { type: 'number' }, age: { type: 'number' }, sex: { type: 'string', enum: ['male', 'female'] } }, required: ['weightKg', 'heightCm', 'age', 'sex'] } },
  { name: 'tdee_calculator', description: 'Calculate TDEE (total daily energy expenditure) from BMR × activity multiplier. Returns weight loss/gain targets.', inputSchema: { type: 'object', properties: { weightKg: { type: 'number' }, heightCm: { type: 'number' }, age: { type: 'number' }, sex: { type: 'string', enum: ['male', 'female'] }, activityLevel: { type: 'string', enum: ['sedentary', 'lightlyActive', 'moderatelyActive', 'veryActive', 'extraActive'] } }, required: ['weightKg', 'heightCm', 'age', 'sex'] } },
  { name: 'daily_calorie_calculator', description: 'Calculate daily calorie target for maintain/lose/gain goals based on BMR + activity level.', inputSchema: { type: 'object', properties: { weightKg: { type: 'number' }, heightCm: { type: 'number' }, age: { type: 'number' }, sex: { type: 'string', enum: ['male', 'female'] }, activityLevel: { type: 'string' }, goal: { type: 'string', enum: ['maintain', 'lose', 'gain'] } }, required: ['weightKg', 'heightCm', 'age', 'sex', 'goal'] } },
  { name: 'calorie_deficit_calculator', description: 'Calculate daily calorie target for a specific weekly weight loss goal (in kg). 7700 kcal = 1 kg body fat.', inputSchema: { type: 'object', properties: { weightKg: { type: 'number' }, heightCm: { type: 'number' }, age: { type: 'number' }, sex: { type: 'string', enum: ['male', 'female'] }, activityLevel: { type: 'string' }, weeklyGoalKg: { type: 'number' } }, required: ['weightKg', 'heightCm', 'age', 'sex'] } },
  { name: 'macro_calculator', description: 'Calculate protein/carbs/fat grams from target calories and percentage split. Supports keto, low-carb, high-protein presets.', inputSchema: { type: 'object', properties: { targetCalories: { type: 'number' }, proteinPercent: { type: 'number' }, carbsPercent: { type: 'number' }, fatPercent: { type: 'number' } }, required: ['targetCalories'] } },
  { name: 'protein_calculator', description: 'Calculate daily protein needs based on body weight, activity level, and goal (cut/maintain/bulk).', inputSchema: { type: 'object', properties: { weightKg: { type: 'number' }, activityLevel: { type: 'string' }, goal: { type: 'string', enum: ['cut', 'maintain', 'bulk'] } }, required: ['weightKg'] } },
  { name: 'kj_to_calories_converter', description: 'Convert kilojoules to kilocalories. 1 kcal = 4.184 kJ.', inputSchema: { type: 'object', properties: { kilojoules: { type: 'number' } }, required: ['kilojoules'] } },
  { name: 'body_fat_calculator', description: 'Estimate body fat % using US Navy Method (waist, neck, height ± hip for females).', inputSchema: { type: 'object', properties: { weightKg: { type: 'number' }, heightCm: { type: 'number' }, age: { type: 'number' }, sex: { type: 'string', enum: ['male', 'female'] }, waistCm: { type: 'number' }, neckCm: { type: 'number' }, hipCm: { type: 'number' } }, required: ['weightKg', 'heightCm', 'age', 'sex', 'waistCm', 'neckCm'] } },
  { name: 'lean_body_mass_calculator', description: 'Calculate lean body mass using Boer formula.', inputSchema: { type: 'object', properties: { weightKg: { type: 'number' }, heightCm: { type: 'number' }, sex: { type: 'string', enum: ['male', 'female'] } }, required: ['weightKg', 'heightCm'] } },
  { name: 'target_heart_rate_calculator', description: 'Calculate heart rate training zones using Karvonen formula (requires age and resting HR).', inputSchema: { type: 'object', properties: { age: { type: 'number' }, restingHeartRate: { type: 'number' }, maxHeartRate: { type: 'number' } }, required: ['age'] } },
  { name: 'vo2max_calculator', description: 'Estimate VO2 Max from age, max heart rate, and resting heart rate (Uth-Sørensen-Overstand formula).', inputSchema: { type: 'object', properties: { age: { type: 'number' }, sex: { type: 'string', enum: ['male', 'female'] }, restingHeartRate: { type: 'number' }, maxHeartRate: { type: 'number' } }, required: ['age'] } },
  { name: 'heart_rate_zones_calculator', description: 'Calculate 5-zone heart rate training system from age or max heart rate.', inputSchema: { type: 'object', properties: { age: { type: 'number' }, maxHeartRate: { type: 'number' } }, required: ['age'] } },
  { name: 'running_pace_calculator', description: 'Calculate pace per km from distance and time. Returns equivalent half-marathon and marathon times.', inputSchema: { type: 'object', properties: { distanceKm: { type: 'number' }, timeMinutes: { type: 'number' } }, required: ['distanceKm', 'timeMinutes'] } },
  { name: 'sleep_calculator', description: 'Calculate recommended bedtime from wake time and sleep goal (8 hours = 5 cycles of 90 min).', inputSchema: { type: 'object', properties: { wakeTime: { type: 'string' }, sleepDurationGoal: { type: 'number' } } } },
  { name: 'sleep_debt_calculator', description: 'Calculate weekly sleep debt vs target. Also shows recovery nights needed at +30 min/night.', inputSchema: { type: 'object', properties: { weekdaySleep: { type: 'number' }, weekendSleep: { type: 'number' }, targetSleep: { type: 'number' } }, required: ['weekdaySleep', 'weekendSleep'] } },
  { name: 'ovulation_calculator', description: 'Calculate approximate ovulation day and fertile window from cycle length (default 28 days).', inputSchema: { type: 'object', properties: { lastPeriodStart: { type: 'string' }, cycleLength: { type: 'number' } } } },
  { name: 'pregnancy_due_date_calculator', description: "Calculate due date from first day of last menstrual period using Naegele's rule (LMP + 280 days).", inputSchema: { type: 'object', properties: { lastPeriodStart: { type: 'string' } }, required: ['lastPeriodStart'] } },
  { name: 'blood_sugar_converter', description: 'Convert blood glucose between mg/dL and mmol/L.', inputSchema: { type: 'object', properties: { value: { type: 'number' }, fromUnit: { type: 'string', enum: ['mgdl', 'mmol'] }, toUnit: { type: 'string', enum: ['mgdl', 'mmol'] } }, required: ['value'] } },
  { name: 'mean_arterial_pressure_calculator', description: 'Calculate MAP (Mean Arterial Pressure) from systolic and diastolic blood pressure.', inputSchema: { type: 'object', properties: { systolic: { type: 'number' }, diastolic: { type: 'number' } }, required: ['systolic', 'diastolic'] } },
  { name: 'waist_to_height_ratio_calculator', description: 'Calculate waist-to-height ratio. Ratio < 0.50 indicates healthy weight for adults.', inputSchema: { type: 'object', properties: { waistCm: { type: 'number' }, heightCm: { type: 'number' } }, required: ['waistCm', 'heightCm'] } },
  { name: 'one_rep_max_calculator', description: 'Estimate 1-rep max (1RM) from weight and reps. Supports Brzycki, Epley, Lombardi, OConner formulas.', inputSchema: { type: 'object', properties: { weight: { type: 'number' }, reps: { type: 'number' }, formula: { type: 'string', enum: ['brzycki', 'epley', 'lombardi', 'oconner'] } }, required: ['weight', 'reps'] } },
  { name: 'steps_to_calories_calculator', description: 'Estimate calories burned from daily steps, normalized to body weight.', inputSchema: { type: 'object', properties: { steps: { type: 'number' }, weightKg: { type: 'number' } }, required: ['steps'] } },
  { name: 'met_to_calories_calculator', description: 'Convert MET (Metabolic Equivalent of Task) to calories burned for a given weight and duration.', inputSchema: { type: 'object', properties: { met: { type: 'number' }, weightKg: { type: 'number' }, durationMinutes: { type: 'number' } }, required: ['met', 'weightKg'] } },
  { name: 'body_surface_area_calculator', description: 'Calculate Body Surface Area (BSA) using Mosteller formula. Used for drug dosing and medical assessments.', inputSchema: { type: 'object', properties: { weightKg: { type: 'number' }, heightCm: { type: 'number' } }, required: ['weightKg', 'heightCm'] } },
];

const server = new Server({ name: 'mquickcalc-health-mcp', version: '1.0.0' }, { capabilities: { tools: {} } });

server.setRequestHandler(ListToolsRequestSchema, async () => ({ tools: TOOLS }));

server.setRequestHandler(CallToolRequestSchema, async ({ params }) => {
  const { name, arguments: args = {} } = params;
  try {
    const fns = {
      bmi_calculator: () => bmiCalc(args), reverse_bmi_calculator: () => reverseBmiCalc(args), ideal_weight_calculator: () => idealWeightCalc(args),
      bmr_calculator: () => bmrCalc(args), tdee_calculator: () => tdeeCalc(args), daily_calorie_calculator: () => calorieCalc(args),
      calorie_deficit_calculator: () => calorieDeficitCalc(args), macro_calculator: () => macroCalc(args), protein_calculator: () => proteinCalc(args),
      kj_to_calories_converter: () => kjToCaloriesCalc(args), body_fat_calculator: () => bodyFatCalc(args), lean_body_mass_calculator: () => leanBodyMassCalc(args),
      target_heart_rate_calculator: () => targetHeartRateCalc(args), vo2max_calculator: () => vo2MaxCalc(args),
      heart_rate_zones_calculator: () => heartRateZonesCalc(args), running_pace_calculator: () => runningPaceCalc(args),
      sleep_calculator: () => sleepCalc(args), sleep_debt_calculator: () => sleepDebtCalc(args),
      ovulation_calculator: () => ovulationCalc(args), pregnancy_due_date_calculator: () => dueDateCalc(args),
      blood_sugar_converter: () => bloodSugarConverter(args), mean_arterial_pressure_calculator: () => mapCalc(args),
      waist_to_height_ratio_calculator: () => waistToHeightCalc(args), one_rep_max_calculator: () => oneRepMaxCalc(args),
      steps_to_calories_calculator: () => stepsToCaloriesCalc(args), met_to_calories_calculator: () => metToCaloriesCalc(args),
      body_surface_area_calculator: () => bsaCalc(args),
    };
    const fn = fns[name];
    if (!fn) return { content: [{ type: 'text', text: `Unknown tool: ${name}` }], isError: true };
    return { content: [{ type: 'text', text: JSON.stringify(fn(), null, 2) }] };
  } catch (err) {
    return { content: [{ type: 'text', text: `Error: ${err.message}` }], isError: true };
  }
});

const transport = new StdioServerTransport();
server.connect(transport).catch(err => { console.error('Failed to start:', err); process.exit(1); });
