# mQuickCalc Health MCP Server

An MCP (Model Context Protocol) server exposing mQuickCalc's health & fitness calculator tools — BMI, BMR, TDEE, daily calorie needs, and macro nutrients — to AI agents like Claude Desktop, Cursor, and any MCP-compatible AI assistant.

## Tools

| Tool | Description |
|------|-------------|
| `bmi_calculator` | BMI with WHO global + Asian-Pacific standard categories, healthy weight range |
| `bmr_calculator` | BMR via Mifflin-St Jeor (most accurate formula), activity multiplier table |
| `tdee_calculator` | TDEE: BMR × activity level, weight loss/gain calorie targets |
| `daily_calorie_calculator` | Target calories for maintain/lose/gain goals |
| `macro_calculator` | Protein / carbs / fat grams from calories + diet presets (keto, low-carb, etc.) |

## Installation

### Prerequisites

- Node.js 18+

### Install

```bash
npm install
```

### Build

```bash
npm run build
```

## Claude Desktop Integration

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

### BMI with Asian Standard (for East Asian users)

```
→ bmi_calculator({ weightKg: 75, heightCm: 175 })
Returns: { bmi: 24.49, who: "Normal", asianStandard: "Overweight", ... }
```

### BMR + TDEE

```
→ bmr_calculator({ weightKg: 75, heightCm: 175, age: 30, sex: "male" })
→ tdee_calculator({ weightKg: 75, heightCm: 175, age: 30, sex: "male", activityLevel: "moderatelyActive" })
```

### Macro Split for Keto Diet

```
→ macro_calculator({ targetCalories: 2000, diet: "keto" })
Returns: { protein: 125g, carbs: 25g, fat: 156g } (25/5/70 split)
```

## Pricing

**Free tier:** All tools, no API key required.

## License

MIT
