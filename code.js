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
        console.log('Starting variable check...');
        try {
          await checkUsedVariables();
          console.log('Variable check completed successfully');
        } catch (error) {
          console.error('Error in checkUsedVariables:', error);
          figma.ui.postMessage({
            type: 'error',
            message: `Error during scan: ${error.message}`
          });
        }
        break;
      case 'get-collections':
        await getExistingCollections();
        break;
      case 'replace-variable':
        await replaceVariable(msg.nodeId, msg.property, msg.newVariableId, msg.fillIndex, msg.strokeIndex);
        break;
      case 'update-radius-tokens':
        await updateRadiusTokensFromBase();
        break;
      case 'set-radius-preset':
        await setRadiusPreset(parseFloat(msg.radiusValue));
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
  
  // 🎯 Auto-update radius tokens if --radius variable is found
  let radiusUpdated = false;
  if (light.radius || dark.radius) {
    try {
      await updateRadiusTokensFromCSS(light.radius || dark.radius);
      radiusUpdated = true;
    } catch (error) {
      console.warn('Failed to auto-update radius tokens:', error);
    }
  }
  
  let successMessage = `Variables processed: ${createdCount} created, ${updatedCount} updated (${modesCreated.join(' + ')} modes)`;
  if (radiusUpdated) {
    successMessage += ' + Radius tokens auto-updated';
  }
  
  figma.ui.postMessage({
    type: 'success',
    message: successMessage,
    data: { collectionName: targetCollectionName, createdCount, updatedCount, modes: modesCreated }
  });
}

// Check variables used in the current file and suggest replacements
async function checkUsedVariables() {
  console.log('checkUsedVariables function called');
  
  const selection = figma.currentPage.selection;
  let nodesToAnalyze = [];
  
  console.log(`Selection length: ${selection.length}`);
  
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
  const groupedAllVariables = {}; // Group ALL variable-assigned objects for suggestions
  
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
              
              // Group ALL variable-assigned objects for suggestion (regardless of collection)
              const allVariablesKey = `${variable.name}_${collection ? collection.name : 'unknown'}`;
              const suggestions = getSortedSuggestions(variable.name, shadSyncVariables);
              
              if (!groupedAllVariables[allVariablesKey]) {
                groupedAllVariables[allVariablesKey] = {
                  currentVariable: {
                    id: variable.id,
                    name: variable.name,
                    collection: collection ? collection.name : 'unknown'
                  },
                  suggestion: suggestions.length > 0 ? suggestions[0] : null,
                  allSuggestions: suggestions,
                  allShadSyncVariables: shadSyncVariables,
                  objects: [],
                  property: 'fill'
                };
              }
              
              groupedAllVariables[allVariablesKey].objects.push({
                node: nodeInfo,
                property: 'fill',
                fillIndex: i,
                color: fill.color
              });
              
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
              
              // Group ALL variable-assigned objects for suggestion (regardless of collection)
              const allVariablesKey = `${variable.name}_${collection ? collection.name : 'unknown'}`;
              const suggestions = getSortedSuggestions(variable.name, shadSyncVariables);
              
              if (!groupedAllVariables[allVariablesKey]) {
                groupedAllVariables[allVariablesKey] = {
                  currentVariable: {
                    id: variable.id,
                    name: variable.name,
                    collection: collection ? collection.name : 'unknown'
                  },
                  suggestion: suggestions.length > 0 ? suggestions[0] : null,
                  allSuggestions: suggestions,
                  allShadSyncVariables: shadSyncVariables,
                  objects: [],
                  property: 'stroke'
                };
              }
              
              groupedAllVariables[allVariablesKey].objects.push({
                node: nodeInfo,
                property: 'stroke',
                strokeIndex: i,
                color: stroke.color
              });
              
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
    
    // Check corner radius
    if ('cornerRadius' in node && typeof node.cornerRadius === 'number') {
      // Check if corner radius has a bound variable
      if (node.boundVariables && node.boundVariables.cornerRadius) {
        const variable = figma.variables.getVariableById(node.boundVariables.cornerRadius.id);
        if (variable) {
          const collection = collections.find(c => c.id === variable.variableCollectionId);
          
          // Group ALL variable-assigned objects for suggestion (regardless of collection)
          const allVariablesKey = `${variable.name}_${collection ? collection.name : 'unknown'}`;
          const suggestions = getSortedSuggestions(variable.name, shadSyncVariables);
          
          if (!groupedAllVariables[allVariablesKey]) {
            groupedAllVariables[allVariablesKey] = {
              currentVariable: {
                id: variable.id,
                name: variable.name,
                collection: collection ? collection.name : 'unknown'
              },
              suggestion: suggestions.length > 0 ? suggestions[0] : null,
              allSuggestions: suggestions,
              allShadSyncVariables: shadSyncVariables,
              objects: [],
              property: 'cornerRadius'
            };
          }
          
          groupedAllVariables[allVariablesKey].objects.push({
            node: nodeInfo,
            property: 'cornerRadius',
            value: node.cornerRadius
          });

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
                allShadSyncVariables: shadSyncVariables,
                objects: [],
                property: 'cornerRadius'
              };
            }
            
            groupedNonShadSync[variableKey].objects.push({
              node: nodeInfo,
              property: 'cornerRadius',
              value: node.cornerRadius
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
      } else if (node.cornerRadius > 0) {
        // No variable assigned but has radius value - suggest radius variable
        const radiusVariables = shadSyncVariables.filter(v => 
          v.name.includes('radius') && v.type === 'FLOAT'
        );
        
        let bestSuggestion = null;
        if (radiusVariables.length > 0) {
          // Simple suggestion logic - prefer 'radius' variable or first available
          bestSuggestion = radiusVariables.find(v => v.name === 'radius') || radiusVariables[0];
        }
        
        unassignedObjects.push({
          node: nodeInfo,
          property: 'cornerRadius',
          value: node.cornerRadius,
          suggestion: bestSuggestion,
          allSuggestions: radiusVariables
        });
      }
    }
  }
  
  
  // Detect orphaned variables by analyzing visual properties
  console.log('Starting orphaned variables detection...');
  const orphanedObjects = await detectOrphanedVariables(nodesToAnalyze, shadSyncCollection, shadSyncVariables);
  
  // Convert grouped data to array format
  const groupedNonShadSyncArray = Object.values(groupedNonShadSync);
  const groupedAllVariablesArray = Object.values(groupedAllVariables);
  
  console.log('Sending results to UI:', {
    nonShadSyncCount: groupedNonShadSyncArray.length,
    allVariableCount: groupedAllVariablesArray.length,
    unassignedCount: unassignedObjects.length,
    orphanedCount: orphanedObjects.length
  });
  
  figma.ui.postMessage({
    type: 'variables-check-result',
    data: {
      variablesByCollection,
      mainCollectionName: 'shadsync theme',
      totalUsed: Object.values(variablesByCollection).reduce((sum, vars) => sum + vars.length, 0),
      nonShadSyncVariables: groupedNonShadSyncArray, // Send grouped data
      allVariableAssigned: groupedAllVariablesArray, // All variable-assigned objects
      unassignedObjects,
      orphanedObjects, // New: Objects with visual properties matching existing variables
      shadSyncVariables,
      analyzedNodes: nodesToAnalyze.length,
      hasSelection: selection.length > 0,
      scanSummary: {
        nonShadSyncCount: groupedNonShadSyncArray.length, // Count of unique variables, not objects
        allVariableCount: groupedAllVariablesArray.length, // Count of all variable-assigned unique variables
        unassignedCount: unassignedObjects.length,
        orphanedCount: orphanedObjects.length, // New: Count of orphaned objects
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
  console.log('replaceVariable called:', nodeId, property, newVariableId, fillIndex, strokeIndex);
  
  const node = figma.getNodeById(nodeId);
  if (!node) {
    console.error('Node not found:', nodeId);
    figma.ui.postMessage({
      type: 'error',
      message: 'Node not found'
    });
    return;
  }
  
  const variable = figma.variables.getVariableById(newVariableId);
  if (!variable) {
    console.error('Variable not found:', newVariableId);
    figma.ui.postMessage({
      type: 'error',
      message: 'Variable not found'
    });
    return;
  }
  
  console.log('Found node and variable:', node.name, variable.name);
  
  try {
    if (property === 'fill' && 'fills' in node && node.fills) {
      console.log('Processing fill replacement');
      // Clone fills array and update the specific fill
      const fills = node.fills.slice(); // Create a copy
      const targetIndex = Math.min(fillIndex, fills.length - 1);
      
      if (targetIndex >= 0 && fills[targetIndex] && fills[targetIndex].type === 'SOLID') {
        const newFill = Object.assign({}, fills[targetIndex]);
        newFill.boundVariables = { color: { type: 'VARIABLE_ALIAS', id: newVariableId } };
        fills[targetIndex] = newFill;
        node.fills = fills;
        console.log('Fill replaced successfully');
      } else {
        console.error('Invalid fill index or fill type:', targetIndex, fills[targetIndex]);
      }
    } else if (property === 'stroke' && 'strokes' in node && node.strokes) {
      console.log('Processing stroke replacement');
      // Clone strokes array and update the specific stroke
      const strokes = node.strokes.slice(); // Create a copy
      const targetIndex = Math.min(strokeIndex, strokes.length - 1);
      
      if (targetIndex >= 0 && strokes[targetIndex] && strokes[targetIndex].type === 'SOLID') {
        const newStroke = Object.assign({}, strokes[targetIndex]);
        newStroke.boundVariables = { color: { type: 'VARIABLE_ALIAS', id: newVariableId } };
        strokes[targetIndex] = newStroke;
        node.strokes = strokes;
        console.log('Stroke replaced successfully');
      } else {
        console.error('Invalid stroke index or stroke type:', targetIndex, strokes[targetIndex]);
      }
    } else if (property === 'cornerRadius' && 'cornerRadius' in node) {
      console.log('Processing corner radius replacement');
      // Set corner radius variable
      node.setBoundVariable('cornerRadius', variable);
      console.log('Corner radius replaced successfully');
    } else {
      console.error('Invalid property or node type:', property, node.type);
    }
    
    figma.ui.postMessage({
      type: 'success',
      message: `Applied ${variable.name} to ${node.name}`
    });
    
    // Don't refresh here automatically as we'll refresh from the UI
    console.log('Variable replacement completed');
    
  } catch (error) {
    console.error('Error during variable replacement:', error);
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
    .replace(/^base\//, '') // Remove base/ prefix
    .replace(/[-_/]/g, '') // Remove separators
    .replace(/color$/, '') // Remove "color" suffix
    .replace(/bg$/, 'background') // Convert bg to background
    .replace(/fg$/, 'foreground') // Convert fg to foreground
    .trim();
  
  const matches = [];
  
  for (const variable of shadSyncVariables) {
    const varCleanName = variable.name.toLowerCase().replace(/[-_]/g, '');
    let score = 0;
    let matchType = '';
    
    // 1. EXACT MATCH (Highest Priority - Score 100)
    if (varCleanName === cleanName) {
      score = 100;
      matchType = 'exact';
    }
    // 2. EXACT WORD MATCH after removing common prefixes (Score 95)
    else if (cleanName.includes('primary') && varCleanName.includes('primary')) {
      if (cleanName.includes('foreground') && varCleanName === 'primaryforeground') {
        score = 95;
        matchType = 'exact-semantic';
      } else if (!cleanName.includes('foreground') && varCleanName === 'primary') {
        score = 95;
        matchType = 'exact-semantic';
      }
    }
    else if (cleanName.includes('muted') && varCleanName.includes('muted')) {
      if (cleanName.includes('foreground') && varCleanName === 'mutedforeground') {
        score = 95;
        matchType = 'exact-semantic';
      } else if (!cleanName.includes('foreground') && varCleanName === 'muted') {
        score = 95;
        matchType = 'exact-semantic';
      }
    }
    else if (cleanName.includes('secondary') && varCleanName.includes('secondary')) {
      if (cleanName.includes('foreground') && varCleanName === 'secondaryforeground') {
        score = 95;
        matchType = 'exact-semantic';
      } else if (!cleanName.includes('foreground') && varCleanName === 'secondary') {
        score = 95;
        matchType = 'exact-semantic';
      }
    }
    else if (cleanName.includes('destructive') && varCleanName.includes('destructive')) {
      if (cleanName.includes('foreground') && varCleanName === 'destructiveforeground') {
        score = 95;
        matchType = 'exact-semantic';
      } else if (!cleanName.includes('foreground') && varCleanName === 'destructive') {
        score = 95;
        matchType = 'exact-semantic';
      }
    }
    else if (cleanName.includes('accent') && varCleanName.includes('accent')) {
      if (cleanName.includes('foreground') && varCleanName === 'accentforeground') {
        score = 95;
        matchType = 'exact-semantic';
      } else if (!cleanName.includes('foreground') && varCleanName === 'accent') {
        score = 95;
        matchType = 'exact-semantic';
      }
    }
    // 3. SEMANTIC COMPONENT MATCHES (Score 90)
    else if (cleanName.includes('foreground') && varCleanName.includes('foreground')) {
      score = 90;
      matchType = 'semantic-foreground';
    }
    else if (cleanName.includes('background') && varCleanName.includes('background')) {
      score = 90;
      matchType = 'semantic-background';
    }
    else if (cleanName.includes('border') && varCleanName.includes('border')) {
      score = 90;
      matchType = 'semantic-border';
    }
    // 4. CONTAINS MATCH (Score 85)
    else if (varCleanName.includes(cleanName) || cleanName.includes(varCleanName)) {
      score = 85;
      matchType = 'contains';
    }
    // 5. PATTERN MATCHING (Score 70-80)
    else {
      const patterns = [
        { pattern: /background/i, targets: ['background', 'card', 'popover'], boost: 75 },
        { pattern: /foreground/i, targets: ['foreground', 'cardforeground', 'popoverforeground'], boost: 75 },
        { pattern: /primary/i, targets: ['primary', 'primaryforeground'], boost: 75 },
        { pattern: /secondary/i, targets: ['secondary', 'secondaryforeground'], boost: 75 },
        { pattern: /border/i, targets: ['border', 'input'], boost: 75 },
        { pattern: /text/i, targets: ['foreground', 'mutedforeground'], boost: 70 },
        { pattern: /accent/i, targets: ['accent', 'accentforeground'], boost: 75 },
        { pattern: /muted/i, targets: ['muted', 'mutedforeground'], boost: 75 },
        { pattern: /destructive/i, targets: ['destructive', 'destructiveforeground'], boost: 75 },
        { pattern: /ring/i, targets: ['ring'], boost: 75 },
        { pattern: /input/i, targets: ['input', 'border'], boost: 70 }
      ];
      
      for (const { pattern, targets, boost } of patterns) {
        if (pattern.test(cleanName)) {
          if (targets.includes(varCleanName)) {
            score = boost;
            matchType = 'pattern';
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
        score: score,
        matchType: matchType
      });
    }
  }
  
  return matches;
}

// Find all color-based matches with scoring (LOWER priority than name matches)
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
    
    // Convert distance to score (REDUCED scores to be lower than name matches)
    let score = 0;
    if (distance < 0.1) score = 60; // Reduced from 90
    else if (distance < 0.2) score = 50; // Reduced from 70
    else if (distance < 0.3) score = 40; // Reduced from 50
    else if (distance < 0.5) score = 30; // Kept same
    
    if (score > 0) {
      matches.push({
        id: variable.id,
        name: variable.name,
        type: variable.type,
        score: score,
        matchType: 'color'
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

// Get radius variable suggestions based on corner radius value
function getRadiusSuggestions(cornerRadiusValue, radiusVariables) {
  const suggestions = [];
  
  // Define common radius value mappings (in px)
  const radiusMap = {
    0: ['radius-0', 'radius-none'],
    2: ['radius-sm', 'radius-xs'],
    4: ['radius', 'radius-md', 'radius-default'],
    6: ['radius-md', 'radius'],
    8: ['radius-lg', 'radius-l'],
    12: ['radius-xl', 'radius-lg'],
    16: ['radius-2xl', 'radius-xl'],
    24: ['radius-3xl', 'radius-2xl'],
    32: ['radius-4xl', 'radius-3xl'],
    40: ['radius-5xl', 'radius-4xl'],
    48: ['radius-6xl', 'radius-5xl']
  };
  
  // Try exact value match first
  for (const variable of radiusVariables) {
    let score = 0;
    let matchType = '';
    
    // Check for exact value matches in common patterns
    const expectedNames = radiusMap[cornerRadiusValue] || [];
    if (expectedNames.some(name => variable.name.toLowerCase().includes(name))) {
      score = 95;
      matchType = 'exact-value';
    }
    // Check for closest value matches
    else if (cornerRadiusValue === 0 && variable.name.includes('0')) {
      score = 90;
      matchType = 'zero-match';
    }
    else if (cornerRadiusValue <= 4 && (variable.name === 'radius' || variable.name.includes('sm') || variable.name.includes('default'))) {
      score = 85;
      matchType = 'small-radius';
    }
    else if (cornerRadiusValue > 4 && cornerRadiusValue <= 8 && (variable.name.includes('md') || variable.name === 'radius')) {
      score = 80;
      matchType = 'medium-radius';
    }
    else if (cornerRadiusValue > 8 && cornerRadiusValue <= 16 && variable.name.includes('lg')) {
      score = 75;
      matchType = 'large-radius';
    }
    else if (cornerRadiusValue > 16 && variable.name.includes('xl')) {
      score = 70;
      matchType = 'extra-large-radius';
    }
    // Default radius fallback
    else if (variable.name === 'radius') {
      score = 60;
      matchType = 'default-fallback';
    }
    // Any radius variable as last resort
    else if (variable.name.includes('radius')) {
      score = 40;
      matchType = 'radius-fallback';
    }
    
    if (score > 0) {
      suggestions.push({
        id: variable.id,
        name: variable.name,
        type: variable.type,
        score: score,
        matchType: matchType
      });
    }
  }
  
  return suggestions.sort((a, b) => b.score - a.score).slice(0, 5);
}

// Get radius variable suggestions based on variable name
function getRadiusSuggestionsForVariable(variableName, radiusVariables) {
  const suggestions = [];
  const cleanName = variableName.toLowerCase().replace(/[-_]/g, '');
  
  for (const variable of radiusVariables) {
    const varCleanName = variable.name.toLowerCase().replace(/[-_]/g, '');
    let score = 0;
    let matchType = '';
    
    // Exact match
    if (cleanName === varCleanName) {
      score = 100;
      matchType = 'exact';
    }
    // Contains match
    else if (varCleanName.includes(cleanName) || cleanName.includes(varCleanName)) {
      score = 85;
      matchType = 'contains';
    }
    // Radius-specific pattern matching
    else if (cleanName.includes('radius') && varCleanName.includes('radius')) {
      // Extract size indicators
      const sizeMap = {
        'sm': ['small', 'xs', 'sm'],
        'md': ['medium', 'md', 'default'],
        'lg': ['large', 'lg', 'l'],
        'xl': ['extra', 'xl', 'x'],
        '2xl': ['2xl', 'xxl'],
        '3xl': ['3xl', 'xxxl'],
        'none': ['none', '0'],
        'full': ['full', 'max']
      };
      
      for (const [key, variants] of Object.entries(sizeMap)) {
        if (variants.some(v => cleanName.includes(v)) && varCleanName.includes(key)) {
          score = 80;
          matchType = 'size-match';
          break;
        }
      }
      
      // If no size match but both have radius
      if (score === 0) {
        score = 60;
        matchType = 'radius-generic';
      }
    }
    // Default radius fallback
    else if (variable.name === 'radius') {
      score = 50;
      matchType = 'default-fallback';
    }
    
    if (score > 0) {
      suggestions.push({
        id: variable.id,
        name: variable.name,
        type: variable.type,
        score: score,
        matchType: matchType
      });
    }
  }
  
  return suggestions.sort((a, b) => b.score - a.score).slice(0, 5);
}

// Legacy function for backward compatibility
function findBestMatch(variableName, shadSyncVariables) {
  const suggestions = getSortedSuggestions(variableName, shadSyncVariables);
  return suggestions.length > 0 ? suggestions[0] : null;
}

// ✨ FEATURE: Dynamic Radius Variable Scaling
// Use this to update all border-radius tokens based on a single variable called '--radius-base'.
// It multiplies this base value (in rem) to update other radius tokens proportionally.
// Assumes 1rem = 16px conversion.

async function updateRadiusTokensFromBase() {
  const remToPx = 16;
  const baseVarName = '--radius-base';

  const baseVar = figma.variables.getLocalVariables().find(v => v.name === baseVarName);
  if (!baseVar) {
    figma.notify('Base radius variable not found');
    return;
  }

  // Adjust mode as needed (or loop through all modes)
  const modeId = baseVar.modes[0].modeId;
  const baseRem = parseFloat(baseVar.valuesByMode[modeId]);
  const basePx = baseRem * remToPx;

  // Define the scaling logic
  const radiusMap = {
    'sm': 0,
    'default': 1,
    'md': 1.5,
    'lg': 2,
    'xl': 3,
    'xxl': 4,
    'full': 9999 // not scaled
  };

  for (const [name, multiplier] of Object.entries(radiusMap)) {
    const token = figma.variables.getLocalVariables().find(v => v.name === name);
    if (!token) continue;

    const value = multiplier === 9999 ? 9999 : multiplier * basePx;
    token.setValueForMode(modeId, value);
  }

  figma.notify('All radius tokens updated based on base value');
}

// ✨ FEATURE: Auto-update radius tokens from CSS --radius value
// Called automatically when CSS conversion detects a --radius variable
async function updateRadiusTokensFromCSS(radiusValue) {
  const remToPx = 16;
  
  // Parse radius value (supports rem and px)
  let basePx;
  if (radiusValue.includes('rem')) {
    const baseRem = parseFloat(radiusValue.replace('rem', ''));
    basePx = baseRem * remToPx;
  } else if (radiusValue.includes('px')) {
    basePx = parseFloat(radiusValue.replace('px', ''));
  } else {
    // Assume it's a number in pixels
    basePx = parseFloat(radiusValue);
  }
  
  if (isNaN(basePx)) {
    throw new Error(`Invalid radius value: ${radiusValue}`);
  }

  // Find the shadsync collection
  const collection = figma.variables.getLocalVariableCollections()
    .find(c => c.name === 'shadsync theme');
  
  if (!collection) {
    throw new Error('shadsync theme collection not found');
  }

  // Get the first mode (usually Light mode)
  const modeId = collection.modes[0].modeId;

  // Define the scaling logic for radius tokens
  const radiusMap = {
    'radius-sm': 0.25,    // 4px when base is 16px
    'radius': 1,          // base value
    'radius-md': 1.5,     // 1.5x base
    'radius-lg': 2,       // 2x base  
    'radius-xl': 3,       // 3x base
    'radius-2xl': 4,      // 4x base
    'radius-full': 9999   // not scaled - always 9999px
  };

  let updatedCount = 0;
  for (const [tokenName, multiplier] of Object.entries(radiusMap)) {
    // Look for existing radius tokens in the collection
    const token = figma.variables.getLocalVariables().find(v => 
      v.name === tokenName && v.variableCollectionId === collection.id
    );
    
    if (token) {
      const value = multiplier === 9999 ? 9999 : Math.round(multiplier * basePx);
      token.setValueForMode(modeId, value);
      updatedCount++;
    }
  }
  
  if (updatedCount > 0) {
    console.log(`Updated ${updatedCount} radius tokens based on --radius: ${radiusValue}`);
  }
}

// ✨ FEATURE: Set radius tokens using preset values
// Sets all radius tokens based on a base rem value with predefined multipliers
async function setRadiusPreset(baseRemValue) {
  const remToPx = 16;
  const basePx = baseRemValue * remToPx;

  // Find the shadsync collection
  const collection = figma.variables.getLocalVariableCollections()
    .find(c => c.name === 'shadsync theme');
  
  if (!collection) {
    figma.notify('shadsync theme collection not found', { error: true });
    return;
  }

  // Get the first mode (usually Light mode)
  const modeId = collection.modes[0].modeId;

  // Define the scaling logic exactly as specified
  const radiusMap = {
    'radius-sm': 0,           // Always 0
    'radius': 1,              // 1x base (default)
    'radius-md': 1.5,         // 1.5x base  
    'radius-lg': 2,           // 2x base
    'radius-xl': 3,           // 3x base
    'radius-2xl': 4,          // 4x base (changed from xxl to 2xl)
    'radius-full': 9999       // Always 9999px
  };

  let updatedCount = 0;
  let createdCount = 0;
  
  for (const [tokenName, multiplier] of Object.entries(radiusMap)) {
    // Look for existing radius tokens in the collection
    let token = figma.variables.getLocalVariables().find(v => 
      v.name === tokenName && v.variableCollectionId === collection.id
    );
    
    // Create token if it doesn't exist
    if (!token) {
      token = figma.variables.createVariable(tokenName, collection, 'FLOAT');
      createdCount++;
    } else {
      updatedCount++;
    }
    
    // Calculate value
    const value = multiplier === 9999 ? 9999 : Math.round(multiplier * basePx);
    token.setValueForMode(modeId, value);
  }
  
  const totalTokens = updatedCount + createdCount;
  const baseLabel = baseRemValue === 0 ? '0' : `${baseRemValue}rem`;
  figma.notify(`✨ Set ${totalTokens} radius tokens to ${baseLabel} base (${createdCount} created, ${updatedCount} updated)`);
  
  // Also update the UI
  figma.ui.postMessage({
    type: 'success',
    message: `Radius tokens set to ${baseLabel} base: ${totalTokens} tokens updated`
  });
}

// Initialize
getExistingCollections();

// Function to detect orphaned variables by analyzing visual properties
async function detectOrphanedVariables(nodesToAnalyze, shadSyncCollection, shadSyncVariables) {
  console.log('Starting orphaned variables detection...');
  
  const orphanedObjects = [];
  
  // Get all variable values from the shadsync collection for comparison
  const variableValues = await getVariableValues(shadSyncVariables, shadSyncCollection);
  
  for (const node of nodesToAnalyze) {
    if (node.type === 'GROUP' || node.type === 'SECTION') continue;
    
    const nodeInfo = {
      id: node.id,
      name: node.name,
      type: node.type
    };
    
    // Check fills for orphaned color variables
    if ('fills' in node && node.fills && Array.isArray(node.fills)) {
      for (let i = 0; i < node.fills.length; i++) {
        const fill = node.fills[i];
        if (fill.type === 'SOLID' && fill.visible !== false && fill.color) {
          // Skip if already has a variable bound
          if (fill.boundVariables && fill.boundVariables.color) continue;
          
          // Look for matching color values in shadsync variables
          const colorMatch = findColorValueMatch(fill.color, variableValues.colors);
          if (colorMatch) {
            orphanedObjects.push({
              node: nodeInfo,
              property: 'fill',
              fillIndex: i,
              color: fill.color,
              detectedVariable: colorMatch,
              reason: 'Color value matches existing variable',
              confidence: calculateColorConfidence(fill.color, colorMatch.value)
            });
          }
        }
      }
    }
    
    // Check strokes for orphaned color variables
    if ('strokes' in node && node.strokes && Array.isArray(node.strokes)) {
      for (let i = 0; i < node.strokes.length; i++) {
        const stroke = node.strokes[i];
        if (stroke.type === 'SOLID' && stroke.visible !== false && stroke.color) {
          // Skip if already has a variable bound
          if (stroke.boundVariables && stroke.boundVariables.color) continue;
          
          // Look for matching color values in shadsync variables
          const colorMatch = findColorValueMatch(stroke.color, variableValues.colors);
          if (colorMatch) {
            orphanedObjects.push({
              node: nodeInfo,
              property: 'stroke',
              strokeIndex: i,
              color: stroke.color,
              detectedVariable: colorMatch,
              reason: 'Color value matches existing variable',
              confidence: calculateColorConfidence(stroke.color, colorMatch.value)
            });
          }
        }
      }
    }
    
    // Check corner radius for orphaned radius variables
    if ('cornerRadius' in node && typeof node.cornerRadius === 'number' && node.cornerRadius > 0) {
      // Skip if already has a variable bound
      if (node.boundVariables && node.boundVariables.cornerRadius) continue;
      
      // Look for matching radius values in shadsync variables
      const radiusMatch = findRadiusValueMatch(node.cornerRadius, variableValues.radius);
      if (radiusMatch) {
        orphanedObjects.push({
          node: nodeInfo,
          property: 'cornerRadius',
          value: node.cornerRadius,
          detectedVariable: radiusMatch,
          reason: 'Radius value matches existing variable',
          confidence: calculateRadiusConfidence(node.cornerRadius, radiusMatch.value)
        });
      }
    }
  }
  
  console.log(`Found ${orphanedObjects.length} potentially orphaned variables`);
  return orphanedObjects;
}

// Get actual values of all variables in a collection
async function getVariableValues(shadSyncVariables, collection) {
  const values = {
    colors: {},
    radius: {}
  };
  
  for (const variable of shadSyncVariables) {
    try {
      // Get the variable object to access its values
      const figmaVariable = figma.variables.getVariableById(variable.id);
      if (!figmaVariable) continue;
      
      // Get the value for the first mode (usually light mode)
      const modes = Object.keys(figmaVariable.valuesByMode);
      if (modes.length === 0) continue;
      
      const value = figmaVariable.valuesByMode[modes[0]];
      
      if (variable.type === 'COLOR' && value && typeof value === 'object') {
        values.colors[variable.id] = {
          id: variable.id,
          name: variable.name,
          value: value
        };
      } else if (variable.type === 'FLOAT' && variable.name.includes('radius') && typeof value === 'number') {
        values.radius[variable.id] = {
          id: variable.id,
          name: variable.name,
          value: value
        };
      }
    } catch (error) {
      console.warn(`Failed to get value for variable ${variable.name}:`, error);
    }
  }
  
  return values;
}

// Find color value matches with tolerance
function findColorValueMatch(targetColor, colorVariables) {
  const tolerance = 0.02; // Small tolerance for floating point comparison
  
  for (const colorVar of Object.values(colorVariables)) {
    const varColor = colorVar.value;
    
    // Compare RGB values with tolerance
    if (Math.abs(targetColor.r - varColor.r) < tolerance &&
        Math.abs(targetColor.g - varColor.g) < tolerance &&
        Math.abs(targetColor.b - varColor.b) < tolerance) {
      return colorVar;
    }
  }
  
  return null;
}

// Find radius value matches with tolerance
function findRadiusValueMatch(targetRadius, radiusVariables) {
  const tolerance = 0.5; // Small tolerance for radius values
  
  for (const radiusVar of Object.values(radiusVariables)) {
    if (Math.abs(targetRadius - radiusVar.value) < tolerance) {
      return radiusVar;
    }
  }
  
  return null;
}

// Calculate confidence score for color matches
function calculateColorConfidence(color1, color2) {
  const rDiff = Math.abs(color1.r - color2.r);
  const gDiff = Math.abs(color1.g - color2.g);
  const bDiff = Math.abs(color1.b - color2.b);
  const avgDiff = (rDiff + gDiff + bDiff) / 3;
  
  // Higher confidence for smaller differences
  return Math.max(0, 1 - (avgDiff * 10));
}

// Calculate confidence score for radius matches
function calculateRadiusConfidence(radius1, radius2) {
  const diff = Math.abs(radius1 - radius2);
  
  // Exact match gets 1.0, small differences get lower scores
  if (diff === 0) return 1.0;
  if (diff <= 0.5) return 0.9;
  if (diff <= 1) return 0.7;
  return Math.max(0, 0.5 - (diff * 0.1));
}
