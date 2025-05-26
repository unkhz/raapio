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

export interface VisualizationPlugin {
  name: string;
  generate(data: VisualizationData, outputPath: string): Promise<void>;
}

export abstract class BaseVisualizationPlugin implements VisualizationPlugin {
  abstract name: string;
  abstract generate(data: VisualizationData, outputPath: string): Promise<void>;
}