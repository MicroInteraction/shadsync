// ShadSync - Convert ShadCN CSS to Figma Variables
// Main plugin code

figma.showUI(__html__, { width: 400, height: 600 });

// Message handling from UI
figma.ui.onmessage = async (msg) => {
  try {
    switch (msg.type) {
      case 'convert-css':
        await handleCssConversion(msg.css, msg.collectionName);
        break;
      case 'check-variables':
        await checkUsedVariables();
        break;
      case 'get-collections':
        await getExistingCollections();
        break;
      default:
        console.log('Unknown message type:', msg.type);
    }
  } catch (error) {
    figma.ui.postMessage({
      type: 'error',
      message: error.message
    });
  }
};

// Parse ShadCN-style CSS and extract variables
function parseCssVariables(css) {
  const lightVariables = {};
  const darkVariables = {};
  const lines = css.split('\n');
  let currentSection = null; // 'root' or 'dark'
  let shouldProcessLine = false;
  
  for (const line of lines) {
    const trimmed = line.trim();
    
    // Detect section starts
    if (trimmed.startsWith(':root')) {
      currentSection = 'root';
      shouldProcessLine = true;
      continue;
    } else if (trimmed.startsWith('.dark')) {
      currentSection = 'dark';
      shouldProcessLine = true;
      continue;
    } else if (trimmed === '}') {
      // End of section
      currentSection = null;
      shouldProcessLine = false;
      continue;
    }
    
    // Process variables only if we're in a valid section
    if (shouldProcessLine && trimmed.startsWith('--') && trimmed.includes(':')) {
      const colonIndex = trimmed.indexOf(':');
      const name = trimmed.substring(0, colonIndex).trim().replace('--', ''); // Remove -- prefix
      const value = trimmed.substring(colonIndex + 1).replace(';', '').trim();
      
      if (name && value) {
        // Add to appropriate collection
        if (currentSection === 'dark') {
          darkVariables[name] = value;
        } else {
          lightVariables[name] = value;
        }
        
        // Stop processing this section after sidebar-ring
        if (name === 'sidebar-ring') {
          shouldProcessLine = false;
        }
      }
    }
  }
  
  return { light: lightVariables, dark: darkVariables };
}

// Convert HSL string to RGB color or parse hex color
function parseColor(colorString) {
  // Clean the color string
  const cleaned = colorString.trim();
  
  // Try hex color first - more flexible regex
  const hexMatch = cleaned.match(/#?([a-fA-F0-9]{6}|[a-fA-F0-9]{3})/);
  if (hexMatch) {
    let hex = hexMatch[1];
    if (hex.length === 3) {
      hex = hex[0] + hex[0] + hex[1] + hex[1] + hex[2] + hex[2];
    }
    const r = parseInt(hex.substring(0, 2), 16) / 255;
    const g = parseInt(hex.substring(2, 4), 16) / 255;
    const b = parseInt(hex.substring(4, 6), 16) / 255;
    return { r, g, b };
  }
  
  // Try HSL format "220 80% 60%"
  const hslMatch = cleaned.match(/(\d+)\s+(\d+)%\s+(\d+)%/);
  if (!hslMatch) return null;
  
  const h = parseInt(hslMatch[1]) / 360;
  const s = parseInt(hslMatch[2]) / 100;
  const l = parseInt(hslMatch[3]) / 100;
  
  let r, g, b;
  
  if (s === 0) {
    r = g = b = l; // achromatic
  } else {
    const hue2rgb = (p, q, t) => {
      if (t < 0) t += 1;
      if (t > 1) t -= 1;
      if (t < 1/6) return p + (q - p) * 6 * t;
      if (t < 1/2) return q;
      if (t < 2/3) return p + (q - p) * (2/3 - t) * 6;
      return p;
    };
    
    const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
    const p = 2 * l - q;
    r = hue2rgb(p, q, h + 1/3);
    g = hue2rgb(p, q, h);
    b = hue2rgb(p, q, h - 1/3);
  }
  
  return { r, g, b };
}

// Create or update variable collection with light and dark modes
async function handleCssConversion(css, collectionName = 'shadsync theme') {
  const { light, dark } = parseCssVariables(css);
  
  if (Object.keys(light).length === 0 && Object.keys(dark).length === 0) {
    figma.ui.postMessage({
      type: 'error',
      message: 'No CSS variables found. Please paste valid CSS with --variable declarations.'
    });
    return;
  }
  
  // Always use "shadsync theme" as the collection name
  const targetCollectionName = 'shadsync theme';
  
  // Check if collection already exists
  let collection = figma.variables.getLocalVariableCollections()
    .find(col => col.name === targetCollectionName);
  
  if (!collection) {
    // Create new collection
    collection = figma.variables.createVariableCollection(targetCollectionName);
    figma.ui.postMessage({
      type: 'status',
      message: `Created new variable collection: ${targetCollectionName}`
    });
  } else {
    figma.ui.postMessage({
      type: 'status',
      message: `Updating existing collection: ${targetCollectionName}`
    });
  }
  
  // Ensure we have Light and Dark modes
  let lightMode = collection.modes.find(mode => mode.name === 'Light');
  let darkMode = collection.modes.find(mode => mode.name === 'Dark');
  
  // Create Light mode if it doesn't exist
  if (!lightMode) {
    if (collection.modes.length === 1) {
      // Rename the default mode to "Light"
      lightMode = collection.modes[0];
      collection.renameMode(lightMode.modeId, 'Light');
    } else {
      lightMode = collection.addMode('Light');
    }
  }
  
  // Create Dark mode if it doesn't exist and we have dark variables
  if (!darkMode && Object.keys(dark).length > 0) {
    darkMode = collection.addMode('Dark');
  }
  
  let createdCount = 0;
  let updatedCount = 0;
  
  // Get all variable names from both light and dark
  const allVariableNames = new Set([...Object.keys(light), ...Object.keys(dark)]);
  
  for (const varName of allVariableNames) {
    // Check if variable already exists
    let variable = figma.variables.getLocalVariables()
      .find(v => v.name === varName && v.variableCollectionId === collection.id);
    
    const lightValue = light[varName];
    const darkValue = dark[varName];
    
    // Determine if this is a color variable - only if we can successfully parse at least one value
    const lightColor = lightValue ? parseColor(lightValue) : null;
    const darkColor = darkValue ? parseColor(darkValue) : null;
    const isColorVariable = !!(lightColor || darkColor);
    
    // Skip variables that have no valid values
    if (!lightValue && !darkValue) {
      continue;
    }
    
    if (!variable) {
      // Create new variable
      variable = figma.variables.createVariable(
        varName, 
        collection, 
        isColorVariable ? 'COLOR' : 'STRING'
      );
      createdCount++;
    } else {
      updatedCount++;
    }
    
    // Set values for each mode - only set values that exist and are valid
    if (lightValue && lightMode && lightMode.modeId) {
      if (isColorVariable && lightColor) {
        variable.setValueForMode(lightMode.modeId, lightColor);
      } else if (!isColorVariable) {
        variable.setValueForMode(lightMode.modeId, lightValue);
      }
    }
    
    if (darkValue && darkMode && darkMode.modeId) {
      if (isColorVariable && darkColor) {
        variable.setValueForMode(darkMode.modeId, darkColor);
      } else if (!isColorVariable) {
        variable.setValueForMode(darkMode.modeId, darkValue);
      }
    }
  }
  
  const modesCreated = [];
  if (Object.keys(light).length > 0) modesCreated.push('Light');
  if (Object.keys(dark).length > 0) modesCreated.push('Dark');
  
  figma.ui.postMessage({
    type: 'success',
    message: `Variables processed: ${createdCount} created, ${updatedCount} updated (${modesCreated.join(' + ')} modes)`,
    data: { collectionName: targetCollectionName, createdCount, updatedCount, modes: modesCreated }
  });
}

// Check variables used in the current file
async function checkUsedVariables() {
  const allNodes = figma.currentPage.findAll();
  const usedVariables = new Set();
  const collections = figma.variables.getLocalVariableCollections();
  
  // Find all variable usage
  for (const node of allNodes) {
    if ('fills' in node && node.fills) {
      for (const fill of node.fills) {
        if (fill.type === 'SOLID' && fill.boundVariables && fill.boundVariables.color) {
          const variable = figma.variables.getVariableById(fill.boundVariables.color.id);
          if (variable) {
            usedVariables.add(variable.id);
          }
        }
      }
    }
    
    if ('strokes' in node && node.strokes) {
      for (const stroke of node.strokes) {
        if (stroke.type === 'SOLID' && stroke.boundVariables && stroke.boundVariables.color) {
          const variable = figma.variables.getVariableById(stroke.boundVariables.color.id);
          if (variable) {
            usedVariables.add(variable.id);
          }
        }
      }
    }
  }
  
  // Group variables by collection
  const variablesByCollection = {};
  const mainCollection = collections.find(c => c.name.includes('ShadCN') || c.name.includes('Theme'));
  
  for (const variableId of usedVariables) {
    const variable = figma.variables.getVariableById(variableId);
    if (variable) {
      const collection = collections.find(c => c.id === variable.variableCollectionId);
      if (collection) {
        if (!variablesByCollection[collection.name]) {
          variablesByCollection[collection.name] = [];
        }
        variablesByCollection[collection.name].push({
          id: variable.id,
          name: variable.name,
          type: variable.resolvedType
        });
      }
    }
  }
  
  figma.ui.postMessage({
    type: 'variables-check-result',
    data: {
      variablesByCollection,
      mainCollectionName: mainCollection ? mainCollection.name : undefined,
      totalUsed: usedVariables.size
    }
  });
}

// Get existing variable collections
async function getExistingCollections() {
  const collections = figma.variables.getLocalVariableCollections().map(col => ({
    id: col.id,
    name: col.name,
    variableCount: figma.variables.getLocalVariables()
      .filter(v => v.variableCollectionId === col.id).length
  }));
  
  figma.ui.postMessage({
    type: 'collections-list',
    data: collections
  });
}

// Calculate color distance for suggestions (future enhancement)
function calculateColorDistance(color1, color2) {
  const rDiff = color1.r - color2.r;
  const gDiff = color1.g - color2.g;
  const bDiff = color1.b - color2.b;
  return Math.sqrt(rDiff * rDiff + gDiff * gDiff + bDiff * bDiff);
}

// Initialize
getExistingCollections();
