import { BaseVisualizationPlugin, VisualizationData } from '../base';
import { writeFile, mkdir } from 'node:fs/promises';
import { join, relative, basename } from 'node:path';

export class MermaidVisualizationPlugin extends BaseVisualizationPlugin {
  name = 'mermaid';

  async generate(data: VisualizationData, outputPath: string): Promise<void> {
    await mkdir(outputPath, { recursive: true });

    const mermaidContent = this.generateMermaidDiagram(data);
    const htmlContent = this.generateHtmlWrapper(mermaidContent);

    await Promise.all([
      writeFile(join(outputPath, 'graph.mmd'), mermaidContent),
      writeFile(join(outputPath, 'index.html'), htmlContent)
    ]);
  }

  private generateMermaidDiagram(data: VisualizationData): string {
    const lines: string[] = ['graph LR'];
    
    // Generate node definitions with labels
    const nodeMap = new Map<string, string>();
    data.nodes.forEach((node, index) => {
      const nodeId = `N${index}`;
      nodeMap.set(node.id, nodeId);
      
      // Create a clean label for the node
      const label = this.sanitizeLabel(node.label);
      lines.push(`    ${nodeId}["${label}"]`);
    });

    // Add empty line for readability
    lines.push('');

    // Generate edges
    data.edges.forEach(edge => {
      const sourceId = nodeMap.get(edge.source);
      const targetId = nodeMap.get(edge.target);
      
      if (sourceId && targetId) {
        lines.push(`    ${sourceId} --> ${targetId}`);
      }
    });

    // Add styling for different node types
    lines.push('');
    lines.push('    %% Styling');
    
    // Style nodes based on their file types or paths
    data.nodes.forEach((node, index) => {
      const nodeId = `N${index}`;
      const style = this.getNodeStyle(node.label, node.path);
      if (style) {
        lines.push(`    ${style.replace('{nodeId}', nodeId)}`);
      }
    });

    return lines.join('\n');
  }

  private sanitizeLabel(label: string): string {
    // Remove or replace characters that might break Mermaid syntax
    return label
      .replace(/"/g, "'")
      .replace(/\[/g, '(')
      .replace(/\]/g, ')')
      .replace(/\n/g, ' ')
      .trim();
  }

  private getNodeStyle(label: string, path: string): string | null {
    const fileName = basename(path);
    const ext = fileName.split('.').pop()?.toLowerCase();
    
    // Style based on file extension
    switch (ext) {
      case 'ts':
      case 'tsx':
        return 'classDef {nodeId} fill:#e1f5fe,stroke:#01579b,stroke-width:2px';
      case 'js':
      case 'jsx':
        return 'classDef {nodeId} fill:#fff3e0,stroke:#e65100,stroke-width:2px';
      case 'css':
      case 'scss':
      case 'sass':
        return 'classDef {nodeId} fill:#f3e5f5,stroke:#4a148c,stroke-width:2px';
      case 'html':
        return 'classDef {nodeId} fill:#e8f5e8,stroke:#1b5e20,stroke-width:2px';
      case 'json':
        return 'classDef {nodeId} fill:#fff8e1,stroke:#ff6f00,stroke-width:2px';
      case 'md':
        return 'classDef {nodeId} fill:#fafafa,stroke:#424242,stroke-width:2px';
      default:
        // Check if it's a directory or external module
        if (label.includes('/') && !fileName.includes('.')) {
          return 'classDef {nodeId} fill:#f1f8e9,stroke:#33691e,stroke-width:2px';
        }
        // External modules (no file extension)
        if (!fileName.includes('.')) {
          return 'classDef {nodeId} fill:#ffebee,stroke:#c62828,stroke-width:2px';
        }
        return null;
    }
  }

  private generateHtmlWrapper(mermaidContent: string): string {
    return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Raapio - Module Dependency Graph (Mermaid)</title>
    <script src="https://cdn.jsdelivr.net/npm/mermaid@10.6.1/dist/mermaid.min.js"></script>
    <style>
        body {
            font-family: system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen, Ubuntu, Cantarell, 'Open Sans', 'Helvetica Neue', sans-serif;
            margin: 0;
            padding: 20px;
            background-color: #f4f4f4;
            color: #333;
        }
        
        h1 {
            text-align: center;
            color: #333;
            margin-bottom: 20px;
        }
        
        .container {
            max-width: 100%;
            margin: 0 auto;
            background-color: white;
            border-radius: 8px;
            box-shadow: 0 2px 10px rgba(0, 0, 0, 0.1);
            padding: 20px;
            overflow: auto;
        }
        
        .mermaid {
            text-align: center;
            background-color: white;
        }
        
        .controls {
            text-align: center;
            margin-top: 20px;
            padding: 15px;
            background-color: #f8f9fa;
            border-radius: 4px;
            border: 1px solid #e9ecef;
        }
        
        .controls p {
            margin: 0;
            color: #6c757d;
            font-size: 14px;
        }
        
        .download-section {
            text-align: center;
            margin: 20px 0;
        }
        
        .download-btn {
            display: inline-block;
            padding: 10px 20px;
            background-color: #007bff;
            color: white;
            text-decoration: none;
            border-radius: 4px;
            margin: 0 10px;
            font-size: 14px;
        }
        
        .download-btn:hover {
            background-color: #0056b3;
        }
        
        /* Responsive design */
        @media (max-width: 768px) {
            body {
                padding: 10px;
            }
            
            .container {
                padding: 10px;
            }
        }
    </style>
</head>
<body>
    <h1>Module Dependency Graph</h1>
    
    <div class="download-section">
        <a href="graph.mmd" download class="download-btn">Download .mmd file</a>
    </div>
    
    <div class="container">
        <div class="mermaid">
${mermaidContent}
        </div>
    </div>
    
    <div class="controls">
        <p>This diagram shows the module dependency relationships in your project.</p>
        <p>Different colors represent different file types. You can copy the .mmd file content to use in other Mermaid-compatible tools.</p>
    </div>

    <script>
        mermaid.initialize({
            startOnLoad: true,
            theme: 'default',
            flowchart: {
                useMaxWidth: true,
                htmlLabels: true,
                curve: 'basis',
                padding: 20
            },
            themeVariables: {
                primaryColor: '#e1f5fe',
                primaryTextColor: '#01579b',
                primaryBorderColor: '#01579b',
                lineColor: '#90a4ae',
                secondaryColor: '#f3e5f5',
                tertiaryColor: '#fff8e1'
            }
        });
        
        // Add click handler to show full paths in console
        document.addEventListener('DOMContentLoaded', function() {
            const mermaidSvg = document.querySelector('.mermaid svg');
            if (mermaidSvg) {
                mermaidSvg.addEventListener('click', function(e) {
                    const target = e.target;
                    if (target.tagName === 'text' || target.parentElement.tagName === 'text') {
                        console.log('Clicked node:', target.textContent || target.parentElement.textContent);
                    }
                });
            }
        });
    </script>
</body>
</html>`;
  }
}