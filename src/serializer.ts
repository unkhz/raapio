import { stat } from 'node:fs/promises';

/**
 * Defines the structure for the serialized dependency graph data.
 */
export interface GraphData {
  version: string; // e.g., "1.0.0"
  rootDir: string; // Absolute path to the analyzed root directory
  // Key: absolute module path, Value: array of absolute imported module paths
  graph: Record<string, string[]>;
  // Key: absolute module path, Value: last modification timestamp (e.g., from fs.stat)
  timestamps: Record<string, number>;
}

/**
 * Saves the dependency graph data to a file as a JSON string.
 * @param filePath The absolute path to the file where the graph data will be saved.
 * @param data The GraphData object to serialize and save.
 * @returns A promise that resolves when the file has been written.
 */
export async function saveGraph(filePath: string, data: GraphData): Promise<void> {
  try {
    await Bun.write(filePath, JSON.stringify(data, null, 2));
    console.info(`[Serializer] Graph data saved to "${filePath}"`);
  } catch (error) {
    console.error(`[Serializer] Error saving graph data to "${filePath}":`, error);
    // Depending on requirements, you might want to throw the error
    // or handle it in a way that the application can recover or inform the user.
    throw error; // Re-throwing for now, can be adjusted
  }
}

/**
 * Loads dependency graph data from a JSON file.
 * @param filePath The absolute path to the file from which to load the graph data.
 * @returns A promise that resolves to the parsed GraphData object, or null if
 *          the file doesn't exist or an error occurs during reading/parsing.
 */
export async function loadGraph(filePath: string): Promise<GraphData | null> {
  try {
    const fileContent = await Bun.file(filePath).text();
    let data: GraphData;
    
    try {
      data = JSON.parse(fileContent) as GraphData;
    } catch (parseError) {
      console.error(`[Serializer] Error parsing graph data from "${filePath}":`, parseError);
      return null;
    }
    
    // Basic validation (can be more thorough)
    if (data && typeof data.version === 'string' && typeof data.rootDir === 'string' && typeof data.graph === 'object' && typeof data.timestamps === 'object') {
      console.info(`[Serializer] Graph data loaded from "${filePath}"`);
      return data;
    } else {
      console.warn(`[Serializer] Invalid graph data format in "${filePath}"`);
      return null;
    }
  } catch (error: any) {
    if (error.code === 'ENOENT' || error.name === 'NotFoundError') { // Bun's file not found error might have a different name/code
      console.info(`[Serializer] Graph data file "${filePath}" not found. Starting fresh.`);
    } else {
      console.error(`[Serializer] Error loading or parsing graph data from "${filePath}":`, error);
    }
    return null;
  }
}

/**
 * Gets the last modification timestamps for a list of files.
 * @param filePaths An array of absolute file paths.
 * @returns A promise that resolves to a record mapping file paths to their mtimeMs timestamps.
 */
export async function getFileTimestamps(filePaths: string[]): Promise<Record<string, number>> {
  const timestamps: Record<string, number> = {};
  for (const filePath of filePaths) {
    try {
      const stats = await stat(filePath);
      timestamps[filePath] = stats.mtimeMs;
    } catch (error) {
      console.warn(`[Serializer] Could not get timestamp for file "${filePath}":`, error);
      // Store a special value (e.g., -1 or null) or omit, depending on how you want to handle missing files.
      // For now, omitting it, so it won't be in the timestamps map.
      // This implies the file might have been deleted or is inaccessible.
    }
  }
  return timestamps;
}
