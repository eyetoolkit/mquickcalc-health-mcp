/**
 * mQuickCalc Health MCP Server
 * Covers: BMI, BMR (Mifflin-St Jeor), TDEE, Calorie, Macro calculators
 *
 * Run: node dist/index.js
 */

import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from '@modelcontextprotocol/sdk/types.js';

// ─── Helpers ────────────────────────────────────────────────────────────────

function requirePositive(value, name) {
  const n = parseFloat(value);
  if (isNaN(n) || n < 0) {
    throw new Error(`${name} must be a positive number, got: ${value}`);
  }
  return n;
}

function round2(n) { return Math.round(n * 100) / 100; }
function round1(n) { return Math.round(n * 10) / 10; }

// ─── Tool Implementations ──────────────────────────────────────────────────

/**
 * BMI Calculator
 * Supports WHO standard (global) and Asian standard.
 * Formula: weight(kg) / (height(m))^2
 */
function bmiCalc(params) {
  const weightKg  = requirePositive(params.weightKg, 'weightKg');
  const heightCm  = requirePositive(params.heightCm, 'heightCm');
  const heightM   = heightCm / 100;
  const bmi       = weightKg / (heightM * heightM);

  const who = bmi < 18.5 ? 'Underweight' : bmi < 25 ? 'Normal' : bmi < 30 ? 'Overweight' : 'Obese';
  const asian = bmi < 18.5 ? 'Underweight' : bmi < 23 ? 'Normal' : bmi < 25 ? 'Overweight' : 'Obese';

  const normalRange = { min: round2(18.5 * heightM * heightM), max: round2(24.9 * heightM * heightM) };
  const asianNormalMax = round2(22.9 * heightM * heightM);

  return {
    bmi: round2(bmi),
    who: { category: who, range: bmi < 18.5 ? '< 18.5' : bmi < 25 ? '18.5 – 24.9' : bmi < 30 ? '25 – 29.9' : '≥ 30' },
    asianStandard: { category: asian, range: bmi < 18.5 ? '< 18.5' : bmi < 23 ? '18.5 – 22.9' : bmi < 25 ? '23 – 24.9' : '≥ 25' },
    healthyWeightRange: {
      who: { minKg: round2(normalRange.min), maxKg: round2(normalRange.max) },
      asian: { minKg: round2(18.5 * heightM * heightM), maxKg: round2(asianNormalMax) },
    },
    units: { weight: 'kg', height: 'cm' },
    formula: 'BMI = weight(kg) / height(m)²',
    source: 'WHO (global) / Asian-Pacific Standard (2000)',
  };
}

/**
 * BMR Calculator using Mifflin-St Jeor Equation
 * Male:   BMR = 10×weight + 6.25×height − 5×age + 5
 * Female: BMR = 10×weight + 6.25×height − 5×age − 161
 */
function bmrCalc(params) {
  const weightKg = requirePositive(params.weightKg, 'weightKg');
  const heightCm = requirePositive(params.heightCm, 'heightCm');
  const age      = parseInt(params.age);
  const sex      = (params.sex || '').toLowerCase();

  if (!age || age < 1 || age > 120) throw new Error('age must be 1-120');
  if (sex !== 'male' && sex !== 'female') throw new Error('sex must be "male" or "female"');

  let bmr;
  if (sex === 'male') {
    bmr = 10 * weightKg + 6.25 * heightCm - 5 * age + 5;
  } else {
    bmr = 10 * weightKg + 6.25 * heightCm - 5 * age - 161;
  }

  const activityMultipliers = {
    sedentary:      { label: 'Sedentary (little/no exercise)', factor: 1.2 },
    lightlyActive:  { label: 'Lightly active (1-3 days/week)', factor: 1.375 },
    moderatelyActive: { label: 'Moderately active (3-5 days/week)', factor: 1.55 },
    veryActive:     { label: 'Very active (6-7 days/week)', factor: 1.725 },
    extraActive:    { label: 'Extra active (physical job/daily training)', factor: 1.9 },
  };

  return {
    bmr: round1(bmr),
    bmrKcal: round1(bmr),
    formula: sex === 'male'
      ? 'BMR = 10×weight(kg) + 6.25×height(cm) − 5×age + 5'
      : 'BMR = 10×weight(kg) + 6.25×height(cm) − 5×age − 161',
    activityMultipliers,
    units: { weight: 'kg', height: 'cm', bmr: 'kcal/day' },
    source: 'Mifflin-St Jeor Equation (1990) — most accurate for most adults',
  };
}

/**
 * TDEE (Total Daily Energy Expenditure) Calculator
 * TDEE = BMR × activity multiplier
 */
function tdeeCalc(params) {
  const weightKg = requirePositive(params.weightKg, 'weightKg');
  const heightCm = requirePositive(params.heightCm, 'heightCm');
  const age      = parseInt(params.age);
  const sex      = (params.sex || '').toLowerCase();
  const activityLevel = (params.activityLevel || 'sedentary').toLowerCase().replace(' ', '');

  if (sex !== 'male' && sex !== 'female') throw new Error('sex must be "male" or "female"');

  let bmr;
  if (sex === 'male') {
    bmr = 10 * weightKg + 6.25 * heightCm - 5 * age + 5;
  } else {
    bmr = 10 * weightKg + 6.25 * heightCm - 5 * age - 161;
  }

  const multipliers = {
    sedentary: 1.2,
    lightlyactive: 1.375,
    moderatelyactive: 1.55,
    veryactive: 1.725,
    extraactive: 1.9,
  };

  const mult = multipliers[activityLevel] || 1.2;
  const tdee = bmr * mult;

  return {
    bmr: round1(bmr),
    tdee: round1(tdee),
    tdeeKcal: round1(tdee),
    weightMaintenance: round1(tdee),
    weightLoss: {
      mild: round1(tdee - 250),
      moderate: round1(tdee - 500),
      extreme: round1(tdee - 1000),
    },
    weightGain: {
      mild: round1(tdee + 250),
      moderate: round1(tdee + 500),
    },
    activityLevel: activityLevel,
    activityMultiplier: mult,
    units: { bmr: 'kcal/day', tdee: 'kcal/day' },
    formula: 'TDEE = BMR × activity multiplier (Mifflin-St Jeor)',
    source: 'Mifflin-St Jeor BMR + Katch-McArdle activity multipliers',
  };
}

/**
 * Daily Calorie Needs Calculator
 * Calculates calories for goal: maintain / lose / gain
 */
function calorieCalc(params) {
  const weightKg = requirePositive(params.weightKg, 'weightKg');
  const heightCm = requirePositive(params.heightCm, 'heightCm');
  const age      = parseInt(params.age);
  const sex      = (params.sex || '').toLowerCase();
  const activityLevel = (params.activityLevel || 'sedentary').toLowerCase().replace(' ', '');
  const goal     = (params.goal || 'maintain').toLowerCase();

  if (sex !== 'male' && sex !== 'female') throw new Error('sex must be "male" or "female"');

  let bmr;
  if (sex === 'male') {
    bmr = 10 * weightKg + 6.25 * heightCm - 5 * age + 5;
  } else {
    bmr = 10 * weightKg + 6.25 * heightCm - 5 * age - 161;
  }

  const multipliers = {
    sedentary: 1.2,
    lightlyactive: 1.375,
    moderatelyactive: 1.55,
    veryactive: 1.725,
    extraactive: 1.9,
  };

  const mult = multipliers[activityLevel] || 1.2;
  const tdee = bmr * mult;

  const deficitOrSurplus = goal === 'lose' ? -500 : goal === 'gain' ? 300 : 0;
  const target = tdee + deficitOrSurplus;

  return {
    bmr: round1(bmr),
    tdee: round1(tdee),
    targetCalories: round1(target),
    goal,
    deficit: goal === 'lose' ? 500 : null,
    surplus: goal === 'gain' ? 300 : null,
    ratePerWeek: goal === 'lose' ? '~0.5 kg/week' : goal === 'gain' ? '~0.3 kg/week' : 'maintain',
    units: { calories: 'kcal/day' },
    formula: 'TDEE = BMR × activity multiplier, target = TDEE ± goal adjustment',
  };
}

/**
 * Macro Calculator
 * Calculates protein / carbs / fat grams from target calories and ratios
 * Protein: 4 kcal/g, Carbs: 4 kcal/g, Fat: 9 kcal/g
 */
function macroCalc(params) {
  const targetCalories = requirePositive(params.targetCalories, 'targetCalories');
  const proteinPct = parseFloat(params.proteinPercent || 30);
  const carbsPct   = parseFloat(params.carbsPercent || 40);
  const fatPct     = parseFloat(params.fatPercent || 30);
  const diet       = (params.diet || 'balanced').toLowerCase();

  // Validate percentages
  const total = proteinPct + carbsPct + fatPct;
  if (Math.abs(total - 100) > 1) {
    throw new Error(`Percentages must sum to ~100, got ${total}%`);
  }

  const proteinKcal = targetCalories * proteinPct / 100;
  const carbsKcal   = targetCalories * carbsPct / 100;
  const fatKcal     = targetCalories * fatPct / 100;

  const proteinG = round1(proteinKcal / 4);
  const carbsG  = round1(carbsKcal / 4);
  const fatG    = round1(fatKcal / 9);

  // Common diet presets
  const presets = {
    balanced:    { protein: 30, carbs: 40, fat: 30 },
    lowCarb:     { protein: 35, carbs: 5,  fat: 60 },
    keto:        { protein: 25, carbs: 5,  fat: 70 },
    highProtein: { protein: 40, carbs: 35, fat: 25 },
    athletic:    { protein: 30, carbs: 50, fat: 20 },
  };

  const preset = presets[diet];

  return {
    targetCalories: round1(targetCalories),
    percentages: { protein: proteinPct, carbs: carbsPct, fat: fatPct },
    grams: {
      protein: proteinG,
      carbs: carbsG,
      fat: fatG,
    },
    caloriesFromMacros: round1(proteinKcal + carbsKcal + fatKcal),
    dietPreset: preset ? diet : 'custom',
    presetsAvailable: Object.keys(presets),
    caloriesPerGram: { protein: 4, carbs: 4, fat: 9 },
    formula: 'grams = (calories × percentage) / (kcal per gram)',
    source: 'FDA / USDA standard caloric values',
  };
}

// ─── MCP Server Setup ──────────────────────────────────────────────────────

const server = new Server(
  { name: 'mquickcalc-health-mcp', version: '0.1.0' },
  { capabilities: { tools: {} } }
);

// ─── Tool Registry ────────────────────────────────────────────────────────

const TOOLS = [
  {
    name: 'bmi_calculator',
    description: `Calculate Body Mass Index (BMI) from weight and height. Returns both WHO (global) and Asian-Pacific standard categories, plus healthy weight ranges for both standards.

Input: weightKg (required), heightCm (required).

Output includes: bmi value, WHO category (Underweight/Normal/Overweight/Obese), Asian standard category, healthy weight range in kg for both standards, formula, and source citation.

Use this when an AI agent needs to assess body weight status for health recommendations.`,
    inputSchema: {
      type: 'object',
      properties: {
        weightKg: { type: 'number', description: 'Body weight in kilograms' },
        heightCm: { type: 'number', description: 'Height in centimeters' },
      },
      required: ['weightKg', 'heightCm'],
    },
  },
  {
    name: 'bmr_calculator',
    description: `Calculate Basal Metabolic Rate (BMR) using the Mifflin-St Jeor Equation — the most accurate BMR formula for most adults. Returns BMR in kcal/day plus a table of activity multipliers for calculating TDEE.

Input: weightKg (required), heightCm (required), age (required), sex (required: "male" or "female").

Formula: Male: 10×weight + 6.25×height − 5×age + 5 | Female: 10×weight + 6.25×height − 5×age − 161

Use this when calculating daily calorie needs or designing nutrition plans.`,
    inputSchema: {
      type: 'object',
      properties: {
        weightKg: { type: 'number', description: 'Body weight in kilograms' },
        heightCm: { type: 'number', description: 'Height in centimeters' },
        age: { type: 'number', description: 'Age in years (1-120)' },
        sex: { type: 'string', description: '"male" or "female"' },
      },
      required: ['weightKg', 'heightCm', 'age', 'sex'],
    },
  },
  {
    name: 'tdee_calculator',
    description: `Calculate Total Daily Energy Expenditure (TDEE) — the total calories burned per day including activity level. Combines BMR (Mifflin-St Jeor) with activity multipliers. Also returns target calories for weight loss and weight gain.

Input: weightKg, heightCm, age, sex, activityLevel (sedentary | lightlyActive | moderatelyActive | veryActive | extraActive).

Output: BMR, TDEE (maintenance calories), weight loss targets (−250 / −500 / −1000 kcal), weight gain targets (+250 / +500 kcal).`,
    inputSchema: {
      type: 'object',
      properties: {
        weightKg: { type: 'number', description: 'Body weight in kilograms' },
        heightCm: { type: 'number', description: 'Height in centimeters' },
        age: { type: 'number', description: 'Age in years' },
        sex: { type: 'string', description: '"male" or "female"' },
        activityLevel: { type: 'string', description: 'sedentary | lightlyActive | moderatelyActive | veryActive | extraActive' },
      },
      required: ['weightKg', 'heightCm', 'age', 'sex', 'activityLevel'],
    },
  },
  {
    name: 'daily_calorie_calculator',
    description: `Calculate daily calorie targets for a specific goal: maintain, lose, or gain weight. Combines BMR + activity level + goal adjustment.

Input: weightKg, heightCm, age, sex, activityLevel, goal (maintain | lose | gain).

For weight loss: defaults to −500 kcal/day ≈ 0.5 kg/week.
For weight gain: defaults to +300 kcal/day ≈ 0.3 kg/week.

Output: BMR, TDEE, targetCalories, goal, deficit/surplus, expected rate per week.`,
    inputSchema: {
      type: 'object',
      properties: {
        weightKg: { type: 'number', description: 'Body weight in kilograms' },
        heightCm: { type: 'number', description: 'Height in centimeters' },
        age: { type: 'number', description: 'Age in years' },
        sex: { type: 'string', description: '"male" or "female"' },
        activityLevel: { type: 'string', description: 'sedentary | lightlyActive | moderatelyActive | veryActive | extraActive' },
        goal: { type: 'string', description: 'maintain | lose | gain (default: maintain)' },
      },
      required: ['weightKg', 'heightCm', 'age', 'sex', 'activityLevel', 'goal'],
    },
  },
  {
    name: 'macro_calculator',
    description: `Calculate macro nutrient grams (protein, carbs, fat) from target daily calories and percentage split. Uses standard caloric values: Protein 4 kcal/g, Carbs 4 kcal/g, Fat 9 kcal/g.

Input: targetCalories (required), proteinPercent (default 30), carbsPercent (default 40), fatPercent (default 30), diet (balanced | lowCarb | keto | highProtein | athletic).

Output: grams of protein/carbs/fat, percentage breakdown, calories per gram for each macro, available diet presets.

Use this for meal planning, fitness coaching, and nutrition tracking.`,
    inputSchema: {
      type: 'object',
      properties: {
        targetCalories: { type: 'number', description: 'Daily target calories in kcal' },
        proteinPercent: { type: 'number', description: 'Protein percentage of calories (default 30)' },
        carbsPercent: { type: 'number', description: 'Carbohydrate percentage (default 40)' },
        fatPercent: { type: 'number', description: 'Fat percentage (default 30)' },
        diet: { type: 'string', description: 'Preset: balanced | lowCarb | keto | highProtein | athletic' },
      },
      required: ['targetCalories'],
    },
  },
];

// ─── Handlers ──────────────────────────────────────────────────────────────

server.setRequestHandler(ListToolsRequestSchema, async () => ({
  tools: TOOLS,
}));

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;

  try {
    let result;

    switch (name) {
      case 'bmi_calculator':
        result = bmiCalc(args || {});
        break;
      case 'bmr_calculator':
        result = bmrCalc(args || {});
        break;
      case 'tdee_calculator':
        result = tdeeCalc(args || {});
        break;
      case 'daily_calorie_calculator':
        result = calorieCalc(args || {});
        break;
      case 'macro_calculator':
        result = macroCalc(args || {});
        break;
      default:
        return {
          content: [{ type: 'text', text: `Unknown tool: ${name}` }],
          isError: true,
        };
    }

    return {
      content: [{ type: 'text', text: JSON.stringify(result, null, 2) }],
    };
  } catch (err) {
    return {
      content: [{ type: 'text', text: `Error: ${err.message}` }],
      isError: true,
    };
  }
});

// ─── Start ─────────────────────────────────────────────────────────────────

const transport = new StdioServerTransport();
server.connect(transport).catch((err) => {
  console.error('Failed to start server:', err);
  process.exit(1);
});
