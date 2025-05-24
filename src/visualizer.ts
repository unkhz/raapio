import { GraphData } from './serializer';
import { relative, isAbsolute } from 'node:path';

export interface Node {
  id: string;       // Unique identifier for the node (e.g., absolute path)
  label: string;    // Display name for the node (e.g., relative path or file name)
  path: string;     // Full absolute path, can be used for detailed info
}

export interface Edge {
  source: string;   // ID of the source node
  target: string;   // ID of the target node
  id: string;       // Unique ID for the edge, e.g., "source->target"
}

export interface VisualizationData {
  nodes: Node[];
  edges: Edge[];
}

/**
 * Transforms GraphData into a format suitable for visualization libraries.
 * @param graphData The analyzed dependency graph data.
 * @returns VisualizationData containing nodes and edges.
 */
export function prepareGraphDataForVisualization(graphData: GraphData): VisualizationData {
  const nodes: Node[] = [];
  const edges: Edge[] = [];
  const uniqueModulePaths = new Set<string>();

  // Collect all unique module paths from graph keys and values
  for (const sourcePath in graphData.graph) {
    uniqueModulePaths.add(sourcePath);
    graphData.graph[sourcePath].forEach(targetPath => {
      uniqueModulePaths.add(targetPath);
    });
  }

  // Create nodes
  uniqueModulePaths.forEach(absolutePath => {
    let label: string;
    // Check if the path is part of the project (inside rootDir)
    // or if it's an external module (e.g. 'fs', 'react', or an absolute path outside rootDir)
    if (isAbsolute(absolutePath) && absolutePath.startsWith(graphData.rootDir)) {
      label = relative(graphData.rootDir, absolutePath);
    } else {
      label = absolutePath; // For external modules or files outside rootDir, use the path itself
    }

    nodes.push({
      id: absolutePath,
      label: label,
      path: absolutePath,
    });
  });

  // Create edges
  for (const sourcePath in graphData.graph) {
    const importedPaths = graphData.graph[sourcePath];
    importedPaths.forEach(targetPath => {
      // Ensure targetPath is also in uniqueModulePaths (already handled by initial collection)
      // This check is more for logical consistency if the initial collection was different.
      if (uniqueModulePaths.has(targetPath)) {
        edges.push({
          source: sourcePath,
          target: targetPath,
          id: `${sourcePath}->${targetPath}`,
        });
      } else {
        // This case should ideally not be hit if uniqueModulePaths is populated correctly
        console.warn(`[Visualizer] Target path "${targetPath}" not found in unique module paths. Edge from "${sourcePath}" will be skipped.`);
      }
    });
  }

  return { nodes, edges };
}
