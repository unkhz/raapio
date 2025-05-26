import { GraphData } from './serializer';
import { relative, isAbsolute } from 'node:path';
import { VisualizationPlugin, VisualizationData, Node, Edge } from './plugins/base';

/**
 * Transforms GraphData into a format suitable for visualization libraries.
 * @param graphData The analyzed dependency graph data.
 * @returns VisualizationData containing nodes and edges.
 */
export function prepareVisualizationData(graphData: GraphData): VisualizationData {
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

export class Visualizer {
  private plugins: Map<string, VisualizationPlugin> = new Map();

  registerPlugin(plugin: VisualizationPlugin): void {
    this.plugins.set(plugin.name, plugin);
  }

  async generateVisualization(graphData: GraphData, pluginName: string, outputPath: string): Promise<void> {
    const plugin = this.plugins.get(pluginName);
    if (!plugin) {
      throw new Error(`Plugin '${pluginName}' not found`);
    }

    const visualizationData = prepareVisualizationData(graphData);
    await plugin.generate(visualizationData, outputPath);
  }

  getAvailablePlugins(): string[] {
    return Array.from(this.plugins.keys());
  }
}
