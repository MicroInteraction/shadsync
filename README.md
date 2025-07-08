# ShadSync - Figma Plugin

Convert ShadCN-style CSS variables into Figma Variables using the Variables API (v2).

## Features

### 🎨 CSS to Figma Variables
- **Paste & Convert**: Paste ShadCN-style CSS variables and automatically convert them to Figma Variables
- **Smart Collection Management**: On first run, creates a new variable collection. On subsequent runs, updates existing collections
- **Format Support**: Handles HSL color format (`--primary: 220 80% 60%;`) and string values
- **Variable Naming**: Maintains CSS variable names (e.g., `--primary` becomes `primary`)

### 🔍 Variable Usage Checker
- **Document Scanning**: Detect all variables currently used in your design file
- **Collection Grouping**: Group variables by their collections to see usage patterns
- **Main Collection Detection**: Identify your primary theme collection
- **Usage Statistics**: See how many variables are used from each collection

## Usage

### Converting CSS Variables

1. **Open the Plugin**: Launch ShadSync from the Figma plugins menu
2. **Paste CSS**: In the "Update Theme" tab, paste your ShadCN CSS variables:
   ```css
   :root {
     --background: #f9f9fa;
     --foreground: #333333;
     --primary: 220 80% 60%;
     --secondary: 210 40% 98%;
   }
   ```
3. **Choose Collection**: Select an existing collection or create a new one
4. **Update Variables**: Click "Update Variables" to process the CSS

### Checking Variable Usage

1. **Switch to Detect Tab**: Click the "Detect" tab
2. **Scan Document**: Click "Scan Document" to analyze variable usage
3. **Review Results**: See which variables are used from each collection

## File Structure

```
shadsync-plugin/
├── manifest.json     # Plugin manifest
├── code.js          # Main plugin logic
├── ui.html          # Plugin UI
└── README.md        # Documentation
```

## Development

This plugin uses:
- **Figma Variables API (v2)** for variable management
- **Pure HTML/CSS/JS** for the UI (no external dependencies)
- **HSL to RGB conversion** for color processing
- **CSS parsing** for variable extraction

## CSS Variable Format Support

The plugin supports ShadCN-style CSS variables:

```css
:root {
  /* HSL Colors (converted to RGB) */
  --primary: 220 80% 60%;
  --secondary: 210 40% 98%;
  
  /* Hex Colors (stored as strings) */
  --background: #ffffff;
  --foreground: #333333;
  
  /* Other values (stored as strings) */
  --border-radius: 0.5rem;
  --font-family: Inter, sans-serif;
}
```

## Features in Detail

### Collection Management
- Automatically detects existing collections with the same name
- Updates existing variables instead of creating duplicates
- Provides feedback on created vs. updated variables

### Color Processing
- Converts HSL format (`220 80% 60%`) to RGB for Figma
- Handles hex colors and other string values appropriately
- Maintains color accuracy through proper conversion

### UI Design
- Clean, modern interface inspired by Figma's design system
- Tab-based navigation for different functions
- Real-time status updates and error handling
- Responsive layout that works in the plugin panel

## Future Enhancements

- **Color Matching**: Suggest replacements for variables not in main collection
- **Theme Switching**: Support for dark/light theme variables
- **Diff View**: Show changes between current and incoming values
- **Export/Import**: Save and load variable configurations
- **Batch Operations**: Process multiple CSS files at once

## Installation

1. Open Figma Desktop App
2. Go to Plugins → Development → Import plugin from manifest
3. Select the `manifest.json` file from this project
4. The plugin will appear in your plugins list

## License

MIT License - Feel free to use and modify as needed.
