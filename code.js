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
      case 'replace-variable':
        await replaceVariable(msg.nodeId, msg.property, msg.newVariableId, msg.fillIndex, msg.strokeIndex);
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
  const lightKeys = Object.keys(light);
  const darkKeys = Object.keys(dark);
  const allVariableNames = new Set();
  lightKeys.forEach(key => allVariableNames.add(key));
  darkKeys.forEach(key => allVariableNames.add(key));
  
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

// Check variables used in the current file and suggest replacements
async function checkUsedVariables() {
  const selection = figma.currentPage.selection;
  let nodesToAnalyze = [];
  
  if (selection.length > 0) {      // If something is selected, analyze selected objects and their children
      for (const node of selection) {
        nodesToAnalyze.push(node);
        if ('children' in node) {
          const childNodes = node.findAll();
          for (const childNode of childNodes) {
            nodesToAnalyze.push(childNode);
          }
        }
      }
  } else {
    // If nothing selected, analyze entire page
    nodesToAnalyze = figma.currentPage.findAll();
  }
  
  const collections = figma.variables.getLocalVariableCollections();
  const shadSyncCollection = collections.find(c => c.name === 'shadsync theme');
  
  if (!shadSyncCollection) {
    figma.ui.postMessage({
      type: 'error',
      message: 'No "shadsync theme" collection found. Please create variables first.'
    });
    return;
  }
  
  // Get all shadsync variables for suggestions
  const shadSyncVariables = figma.variables.getLocalVariables()
    .filter(v => v.variableCollectionId === shadSyncCollection.id)
    .map(v => ({
      id: v.id,
      name: v.name,
      type: v.resolvedType
    }));
  
  const nonShadSyncVariables = [];
  const unassignedObjects = [];
  const variablesByCollection = {};
  const groupedNonShadSync = {}; // Group by variable name
  
  // Analyze all nodes for color usage
  for (const node of nodesToAnalyze) {
    // Skip certain node types that don't have color properties
    if (node.type === 'GROUP' || node.type === 'SECTION') continue;
    
    const nodeInfo = {
      id: node.id,
      name: node.name,
      type: node.type
    };
    
    // Check fills
    if ('fills' in node && node.fills && Array.isArray(node.fills)) {
      for (let i = 0; i < node.fills.length; i++) {
        const fill = node.fills[i];
        if (fill.type === 'SOLID' && fill.visible !== false) {
          if (fill.boundVariables && fill.boundVariables.color) {
            // Has variable assigned
            const variable = figma.variables.getVariableById(fill.boundVariables.color.id);
            if (variable) {
              const collection = collections.find(c => c.id === variable.variableCollectionId);
              
              if (collection && collection.name !== 'shadsync theme') {
                // Variable from different collection - suggest replacement
                const suggestion = findBestMatch(variable.name, shadSyncVariables);
                const variableKey = `${variable.name}_${collection.name}`;
                
                if (!groupedNonShadSync[variableKey]) {
                  groupedNonShadSync[variableKey] = {
                    currentVariable: {
                      id: variable.id,
                      name: variable.name,
                      collection: collection.name
                    },
                    suggestion: suggestion,
                    allSuggestions: getSortedSuggestions(variable.name, shadSyncVariables),
                    allShadSyncVariables: shadSyncVariables, // Include all variables
                    objects: [],
                    property: 'fill'
                  };
                }
                
                groupedNonShadSync[variableKey].objects.push({
                  node: nodeInfo,
                  property: 'fill',
                  fillIndex: i,
                  color: fill.color
                });
              }
              
              // Track for collection grouping
              if (collection) {
                if (!variablesByCollection[collection.name]) {
                  variablesByCollection[collection.name] = [];
                }
                if (!variablesByCollection[collection.name].find(v => v.id === variable.id)) {
                  variablesByCollection[collection.name].push({
                    id: variable.id,
                    name: variable.name,
                    type: variable.resolvedType
                  });
                }
              }
            }
          } else if (fill.color) {
            // No variable assigned - suggest one
            const suggestions = getSortedSuggestions(node.name, shadSyncVariables, fill.color, shadSyncCollection);
            const bestSuggestion = suggestions.length > 0 ? suggestions[0] : null;
            
            unassignedObjects.push({
              node: nodeInfo,
              property: 'fill',
              fillIndex: i,
              color: fill.color,
              suggestion: bestSuggestion,
              allSuggestions: suggestions
            });
          }
        }
      }
    }
    
    // Check strokes
    if ('strokes' in node && node.strokes && Array.isArray(node.strokes)) {
      for (let i = 0; i < node.strokes.length; i++) {
        const stroke = node.strokes[i];
        if (stroke.type === 'SOLID' && stroke.visible !== false) {
          if (stroke.boundVariables && stroke.boundVariables.color) {
            // Has variable assigned
            const variable = figma.variables.getVariableById(stroke.boundVariables.color.id);
            if (variable) {
              const collection = collections.find(c => c.id === variable.variableCollectionId);
              
              if (collection && collection.name !== 'shadsync theme') {
                // Variable from different collection - suggest replacement
                const suggestion = findBestMatch(variable.name, shadSyncVariables);
                const variableKey = `${variable.name}_${collection.name}`;
                
                if (!groupedNonShadSync[variableKey]) {
                  groupedNonShadSync[variableKey] = {
                    currentVariable: {
                      id: variable.id,
                      name: variable.name,
                      collection: collection.name
                    },
                    suggestion: suggestion,
                    allSuggestions: getSortedSuggestions(variable.name, shadSyncVariables),
                    allShadSyncVariables: shadSyncVariables, // Include all variables
                    objects: [],
                    property: 'stroke'
                  };
                }
                
                groupedNonShadSync[variableKey].objects.push({
                  node: nodeInfo,
                  property: 'stroke',
                  strokeIndex: i,
                  color: stroke.color
                });
              }
            }
          } else if (stroke.color) {
            // No variable assigned - suggest one
            const suggestions = getSortedSuggestions(node.name, shadSyncVariables, stroke.color, shadSyncCollection);
            const bestSuggestion = suggestions.length > 0 ? suggestions[0] : null;
            
            unassignedObjects.push({
              node: nodeInfo,
              property: 'stroke',
              strokeIndex: i,
              color: stroke.color,
              suggestion: bestSuggestion,
              allSuggestions: suggestions
            });
          }
        }
      }
    }
  }
  
  // Convert grouped data to array format
  const groupedNonShadSyncArray = Object.values(groupedNonShadSync);
  
  figma.ui.postMessage({
    type: 'variables-check-result',
    data: {
      variablesByCollection,
      mainCollectionName: 'shadsync theme',
      totalUsed: Object.values(variablesByCollection).reduce((sum, vars) => sum + vars.length, 0),
      nonShadSyncVariables: groupedNonShadSyncArray, // Send grouped data
      unassignedObjects,
      shadSyncVariables,
      analyzedNodes: nodesToAnalyze.length,
      hasSelection: selection.length > 0,
      scanSummary: {
        nonShadSyncCount: groupedNonShadSyncArray.length, // Count of unique variables, not objects
        unassignedCount: unassignedObjects.length,
        shadSyncCount: variablesByCollection['shadsync theme'] ? variablesByCollection['shadsync theme'].length : 0
      }
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

// Handle variable replacement
async function replaceVariable(nodeId, property, newVariableId, fillIndex = 0, strokeIndex = 0) {
  const node = figma.getNodeById(nodeId);
  if (!node) {
    figma.ui.postMessage({
      type: 'error',
      message: 'Node not found'
    });
    return;
  }
  
  const variable = figma.variables.getVariableById(newVariableId);
  if (!variable) {
    figma.ui.postMessage({
      type: 'error',
      message: 'Variable not found'
    });
    return;
  }
  
  try {
    if (property === 'fill' && 'fills' in node && node.fills) {
      // Clone fills array and update the specific fill
      const fills = node.fills.slice(); // Create a copy
      const targetIndex = Math.min(fillIndex, fills.length - 1);
      
      if (targetIndex >= 0 && fills[targetIndex] && fills[targetIndex].type === 'SOLID') {
        const newFill = Object.assign({}, fills[targetIndex]);
        newFill.boundVariables = { color: { type: 'VARIABLE', id: newVariableId } };
        fills[targetIndex] = newFill;
        node.fills = fills;
      }
    } else if (property === 'stroke' && 'strokes' in node && node.strokes) {
      // Clone strokes array and update the specific stroke
      const strokes = node.strokes.slice(); // Create a copy
      const targetIndex = Math.min(strokeIndex, strokes.length - 1);
      
      if (targetIndex >= 0 && strokes[targetIndex] && strokes[targetIndex].type === 'SOLID') {
        const newStroke = Object.assign({}, strokes[targetIndex]);
        newStroke.boundVariables = { color: { type: 'VARIABLE', id: newVariableId } };
        strokes[targetIndex] = newStroke;
        node.strokes = strokes;
      }
    }
    
    figma.ui.postMessage({
      type: 'success',
      message: `Applied ${variable.name} to ${node.name}`
    });
    
    // Refresh the analysis
    await checkUsedVariables();
    
  } catch (error) {
    figma.ui.postMessage({
      type: 'error',
      message: `Failed to apply variable: ${error.message}`
    });
  }
}

// Get sorted suggestions for a variable or object
function getSortedSuggestions(name, shadSyncVariables, color = null, collection = null) {
  const suggestions = [];
  
  // First, try name-based matching
  const nameMatches = findAllNameMatches(name, shadSyncVariables);
  nameMatches.forEach(match => {
    suggestions.push({
      id: match.id,
      name: match.name,
      type: match.type,
      matchType: 'name',
      score: match.score
    });
  });
  
  // If we have color information, try color-based matching
  if (color && collection) {
    const colorMatches = findAllColorMatches(color, shadSyncVariables, collection);
    colorMatches.forEach(match => {
      suggestions.push({
        id: match.id,
        name: match.name,
        type: match.type,
        matchType: 'color',
        score: match.score
      });
    });
  }
  
  // Remove duplicates and sort by score
  const uniqueSuggestions = suggestions.filter((suggestion, index, array) => 
    array.findIndex(s => s.id === suggestion.id) === index
  );
  
  return uniqueSuggestions
    .sort((a, b) => b.score - a.score)
    .slice(0, 5); // Limit to top 5 suggestions
}

// Find all name-based matches with scoring
function findAllNameMatches(variableName, shadSyncVariables) {
  const cleanName = variableName.toLowerCase()
    .replace(/^--/, '') // Remove CSS prefix
    .replace(/[-_]/g, '') // Remove separators
    .replace(/color$/, '') // Remove "color" suffix
    .replace(/bg$/, 'background') // Convert bg to background
    .replace(/fg$/, 'foreground') // Convert fg to foreground
    .trim();
  
  const matches = [];
  
  for (const variable of shadSyncVariables) {
    const varCleanName = variable.name.toLowerCase().replace(/[-_]/g, '');
    let score = 0;
    
    // Exact match
    if (varCleanName === cleanName) {
      score = 100;
    }
    // Contains match
    else if (varCleanName.includes(cleanName) || cleanName.includes(varCleanName)) {
      score = 80;
    }
    // Pattern matching
    else {
      const patterns = [
        { pattern: /background/i, targets: ['background', 'card', 'popover'], boost: 70 },
        { pattern: /foreground/i, targets: ['foreground', 'cardforeground', 'popoverforeground'], boost: 70 },
        { pattern: /primary/i, targets: ['primary', 'primaryforeground'], boost: 70 },
        { pattern: /secondary/i, targets: ['secondary', 'secondaryforeground'], boost: 70 },
        { pattern: /border/i, targets: ['border', 'input'], boost: 70 },
        { pattern: /text/i, targets: ['foreground', 'mutedforeground'], boost: 60 },
        { pattern: /accent/i, targets: ['accent', 'accentforeground'], boost: 70 },
        { pattern: /muted/i, targets: ['muted', 'mutedforeground'], boost: 70 },
        { pattern: /destructive/i, targets: ['destructive', 'destructiveforeground'], boost: 70 },
        { pattern: /ring/i, targets: ['ring'], boost: 70 },
        { pattern: /input/i, targets: ['input', 'border'], boost: 60 }
      ];
      
      for (const { pattern, targets, boost } of patterns) {
        if (pattern.test(cleanName)) {
          if (targets.includes(varCleanName)) {
            score = boost;
            break;
          }
        }
      }
    }
    
    if (score > 0) {
      matches.push({
        id: variable.id,
        name: variable.name,
        type: variable.type,
        score: score
      });
    }
  }
  
  return matches;
}

// Find all color-based matches with scoring
function findAllColorMatches(color, shadSyncVariables, collection) {
  if (!color || !shadSyncVariables.length) return [];
  
  const matches = [];
  const currentMode = collection.modes[0];
  if (!currentMode) return [];
  
  for (const variable of shadSyncVariables.filter(v => v.type === 'COLOR')) {
    const figmaVariable = figma.variables.getVariableById(variable.id);
    if (!figmaVariable) continue;
    
    const variableColor = figmaVariable.valuesByMode[currentMode.modeId];
    if (!variableColor || typeof variableColor !== 'object') continue;
    
    const distance = calculateColorDistance(color, variableColor);
    
    // Convert distance to score (lower distance = higher score)
    let score = 0;
    if (distance < 0.1) score = 90;
    else if (distance < 0.2) score = 70;
    else if (distance < 0.3) score = 50;
    else if (distance < 0.5) score = 30;
    
    if (score > 0) {
      matches.push({
        id: variable.id,
        name: variable.name,
        type: variable.type,
        score: score
      });
    }
  }
  
  return matches;
}

// Enhanced color distance calculation
function calculateColorDistance(color1, color2) {
  const rDiff = (color1.r || 0) - (color2.r || 0);
  const gDiff = (color1.g || 0) - (color2.g || 0);
  const bDiff = (color1.b || 0) - (color2.b || 0);
  return Math.sqrt(rDiff * rDiff + gDiff * gDiff + bDiff * bDiff);
}

// Legacy function for backward compatibility
function findBestMatch(variableName, shadSyncVariables) {
  const suggestions = getSortedSuggestions(variableName, shadSyncVariables);
  return suggestions.length > 0 ? suggestions[0] : null;
}

// Initialize
getExistingCollections();
