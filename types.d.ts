// Type definitions for ShadSync Figma Plugin

interface CSSVariable {
  name: string;
  value: string;
  type: 'color' | 'string';
}

interface VariableInfo {
  id: string;
  name: string;
  type: string;
}

interface CollectionInfo {
  id: string;
  name: string;
  variableCount: number;
}

interface VariablesByCollection {
  [collectionName: string]: VariableInfo[];
}

interface PluginMessage {
  type: 'convert-css' | 'check-variables' | 'get-collections';
  css?: string;
  collectionName?: string;
}

interface PluginResponse {
  type: 'success' | 'error' | 'status' | 'collections-list' | 'variables-check-result';
  message?: string;
  data?: any;
}

interface ConversionResult {
  collectionName: string;
  createdCount: number;
  updatedCount: number;
}

interface VariablesCheckResult {
  variablesByCollection: VariablesByCollection;
  mainCollectionName?: string;
  totalUsed: number;
}

interface RGB {
  r: number;
  g: number;
  b: number;
}
