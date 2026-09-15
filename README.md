# mQuickCalc Health MCP Server

[![Smithery](https://smithery.ai/badge/mquickcalc-health-mcp)](https://smithery.ai/servers/19820393768/mquickcalc-health-mcp)
[![npm version](https://img.shields.io/npm/v/@eyetoolkit/mquickcalc-health-mcp)](https://www.npmjs.com/package/@eyetoolkit/mquickcalc-health-mcp)
[![License: MIT](https://img.shields.io/badge/License-MIT-green.svg)](https://opensource.org/licenses/MIT)

**Calculate BMI, BMR, TDEE, macros, body fat, running pace, heart rate zones, and more — directly inside your AI agent.**

From personalized calorie targets to one-rep max estimates, mQuickCalc Health MCP puts 15 evidence-based health calculators into any AI agent workflow. No more guesswork — just accurate numbers.

**15 production-ready tools:** BMI · BMR · TDEE · daily calories · macros · body fat % · ideal weight · protein · kJ conversion · one-rep max · target heart rate · VO2 max · running pace · sleep debt

> Perfect for: fitness coaches, developers building health apps, AI nutrition analysis, workout planning.

## Tools

| Tool | Description |
|------|-------------|
| `bmi_calculator` | Body Mass Index from height & weight (WHO + Asian standards) |
| `reverse_bmi_calculator` | Find target weight for a desired BMI |
| `ideal_weight_calculator` | Devine, Miller, Hamwi, BMI-based ideal weight |
| `lean_mass_calculator` | Lean body mass from body fat percentage |
| `bmr_calculator` | Basal Metabolic Rate (Mifflin-St Jeor) |
| `tdee_calculator` | Total Daily Energy Expenditure from BMR & activity level |
| `daily_calorie_calculator` | Calories for goal: maintain, cut, or bulk |
| `calorie_deficit_calculator` | Safe calorie deficit for sustainable fat loss |
| `protein_calculator` | Daily protein needs based on weight & goal |
| `macro_calculator` | Carbohydrates, fat, protein grams from calories & goals |
| `kj_calorie_converter` | Kilojoules ↔ Calories, bidirectional |
| `body_fat_calculator` | US Navy body fat formula from measurements |
| `one_rep_max_calculator` | Estimated 1RM from weight & reps (Epley, Brzycki, etc.) |
| `target_heart_rate_calculator` | Target heart rate zones from age & resting HR |
| `running_pace_calculator` | Pace per km/mile, race time predictions |

## Installation

### Prerequisites

- Node.js 18+ (Node 20 recommended)
- npm 9+

### Quick install

```bash
npm install -g @eyetoolkit/mquickcalc-health-mcp
```

### Build from source

```bash
npm install
npm run build
```

### Test locally

```bash
node dist/index.js
```

## Claude Desktop Integration

Add to your Claude Desktop config:

**macOS:** `~/Library/Application Support/Claude/claude_desktop_config.json`
**Windows:** `%APPDATA%\Claude\claude_desktop_config.json`

```json
{
  "mcpServers": {
    "mquickcalc-health": {
      "command": "node",
      "args": ["/ABSOLUTE/PATH/TO/mcp-health/dist/index.js"]
    }
  }
}
```

Then restart Claude Desktop.

## Usage Examples

```
What's my TDEE? I'm 175cm, 75kg, male, moderately active:
→ tdee_calculator({ height: 175, weight: 75, age: 30, sex: "male", activityLevel: "moderate" })

Calculate my macros for a 2200 calorie cut:
→ macro_calculator({ calories: 2200, goal: "cut" })

What's my one-rep max from 100kg × 5 reps?
→ one_rep_max_calculator({ weight: 100, reps: 5 })

What pace should I run to finish a half marathon in 2 hours?
→ running_pace_calculator({ distance: 21.1, targetTime: 120 })
```

## Pricing

**Free tier:** All 15 tools, no API key required.

## License

MIT
