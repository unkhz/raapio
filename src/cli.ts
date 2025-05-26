#!/usr/bin/env bun
import { analyzeDirectory } from './analyzer';
import { saveGraph, getFileTimestamps, GraphData, loadGraph } from './serializer';
import { Visualizer } from './visualizer';
import { HtmlVisualizationPlugin, MermaidVisualizationPlugin } from './plugins';
import { resolve, dirname, join, basename } from 'node:path';
import { existsSync, statSync } from 'node:fs'; // Using Node's sync fs for initial checks
import { mkdir, copyFile, writeFile } from 'node:fs/promises'; // Bun.write can also be used for writeFile.

const RAAPIO_VERSION = "1.0.0";

// ANSI Color Codes
const colors = {
  reset: "\x1b[0m",
  red: "\x1b[31m",
  green: "\x1b[32m",
  yellow: "\x1b[33m",
  blue: "\x1b[34m",
};

const logError = (message: string) => console.error(`${colors.red}Error: ${message}${colors.reset}`);
const logInfo = (message: string) => console.info(`${colors.blue}${message}${colors.reset}`);
const logSuccess = (message: string) => console.info(`${colors.green}${message}${colors.reset}`);
const logWarning = (message: string) => console.warn(`${colors.yellow}Warning: ${message}${colors.reset}`);


async function main() {
  const args = process.argv.slice(2);
  if (args.length === 0) {
    printUsage();
    process.exit(1);
  }

  const command = args[0];

  if (command === 'analyze') {
    let directory = args[1];
    let outputFilePath = resolve(process.cwd(), 'raapio.graph.json'); // Default output path

    if (!directory) {
      logError("Directory path is required for 'analyze' command.");
      printUsage();
      process.exit(1);
    }

    // Parse --output argument
    const outputIndex = args.indexOf('--output');
    if (outputIndex !== -1 && args[outputIndex + 1]) {
      outputFilePath = resolve(process.cwd(), args[outputIndex + 1]);
    } else if (outputIndex !== -1 && !args[outputIndex + 1]) {
      logError("--output flag requires a value (file path).");
      printUsage();
      process.exit(1);
    }

    const absoluteDirectoryPath = resolve(process.cwd(), directory);

    if (!existsSync(absoluteDirectoryPath) || !statSync(absoluteDirectoryPath).isDirectory()) {
      logError(`Directory "${absoluteDirectoryPath}" does not exist or is not a directory.`);
      process.exit(1);
    }

    logInfo(`Starting analysis of directory: ${absoluteDirectoryPath}`);

    try {
      const dependencyMap = await analyzeDirectory(absoluteDirectoryPath);
      logInfo(`Analysis complete. Found ${dependencyMap.size} source files.`);

      const allFilePaths = new Set<string>();
      dependencyMap.forEach((imports, filePath) => {
        allFilePaths.add(filePath);
        imports.forEach(imp => allFilePaths.add(imp));
      });
      const allFilePathsArray = Array.from(allFilePaths);

      logInfo(`Fetching timestamps for ${allFilePathsArray.length} unique files involved in the graph...`);
      const fileTimestamps = await getFileTimestamps(allFilePathsArray);

      const graphForSerialization: Record<string, string[]> = {};
      dependencyMap.forEach((imports, filePath) => {
        graphForSerialization[filePath] = Array.from(imports);
      });

      const graphData: GraphData = {
        version: RAAPIO_VERSION,
        rootDir: absoluteDirectoryPath,
        graph: graphForSerialization,
        timestamps: fileTimestamps,
      };

      await saveGraph(outputFilePath, graphData);
      logSuccess(`Graph data successfully saved to: ${outputFilePath}`);

    } catch (error) {
      logError(`An error occurred during the analysis process: ${error instanceof Error ? error.message : String(error)}`);
      process.exit(1);
    }
  } else if (command === 'visualize') {
    const graphFilePath = args[1];
    let outputDirName = 'raapio_visualization';
    let pluginName = 'html'; // Default plugin
    let serve = false;
    let port = 3000;

    if (!graphFilePath) {
      logError("Graph data file path (.json) is required for 'visualize' command.");
      printUsage();
      process.exit(1);
    }

    const outputDirIndex = args.indexOf('--output-dir');
    if (outputDirIndex !== -1 && args[outputDirIndex + 1]) {
      outputDirName = args[outputDirIndex + 1];
    } else if (outputDirIndex !== -1 && !args[outputDirIndex + 1]) {
      logError("--output-dir flag requires a value (directory name).");
      printUsage();
      process.exit(1);
    }

    const pluginIndex = args.indexOf('--plugin');
    if (pluginIndex !== -1 && args[pluginIndex + 1]) {
      pluginName = args[pluginIndex + 1];
    } else if (pluginIndex !== -1 && !args[pluginIndex + 1]) {
      logError("--plugin flag requires a value (plugin name).");
      printUsage();
      process.exit(1);
    }

    if (args.includes('--serve')) {
      serve = true;
    }

    const portIndex = args.indexOf('--port');
    if (portIndex !== -1 && args[portIndex + 1]) {
      const parsedPort = parseInt(args[portIndex + 1], 10);
      if (isNaN(parsedPort) || parsedPort <= 0 || parsedPort > 65535) {
        logError("Invalid port number provided for --port. Must be between 1 and 65535.");
        process.exit(1);
      }
      port = parsedPort;
    } else if (portIndex !== -1 && !args[portIndex + 1]) {
      logError("--port flag requires a value (port number).");
      printUsage();
      process.exit(1);
    }

    const absoluteGraphFilePath = resolve(process.cwd(), graphFilePath);
    if (!existsSync(absoluteGraphFilePath) || !statSync(absoluteGraphFilePath).isFile()) {
      logError(`Graph file "${absoluteGraphFilePath}" does not exist or is not a file.`);
      process.exit(1);
    }

    const absoluteOutputDir = resolve(process.cwd(), outputDirName);

    try {
      logInfo(`Loading graph data from: ${absoluteGraphFilePath}`);
      const graphData = await loadGraph(absoluteGraphFilePath);
      if (!graphData) {
        logError(`Failed to load or parse graph data from "${absoluteGraphFilePath}".`);
        process.exit(1);
      }

      logInfo(`Generating visualization with ${pluginName} plugin...`);
      const visualizer = new Visualizer();
      visualizer.registerPlugin(new HtmlVisualizationPlugin());
      visualizer.registerPlugin(new MermaidVisualizationPlugin());
      
      if (!visualizer.getAvailablePlugins().includes(pluginName)) {
        logError(`Plugin '${pluginName}' not found. Available plugins: ${visualizer.getAvailablePlugins().join(', ')}`);
        process.exit(1);
      }
      
      await visualizer.generateVisualization(graphData, pluginName, absoluteOutputDir);

      logSuccess(`Visualization generated successfully in: ${absoluteOutputDir}`);

      if (serve) {
        if (pluginName !== 'html') {
          logWarning(`--serve option is optimized for HTML plugin. Current plugin: ${pluginName}`);
        }
        logInfo(`Starting server for visualization in ${absoluteOutputDir} on port ${port}...`);
        try {
          Bun.serve({
            port: port,
            hostname: 'localhost',
            websocket: { // Add required websocket handler properties
              message: () => {}, // Required but not used
              open: () => {},
              close: () => {},
            },
            fetch(req) {
              const url = new URL(req.url);
              let filePath = join(absoluteOutputDir, url.pathname);

              // If root, serve index.html
              if (url.pathname === '/' || url.pathname === '') {
                filePath = join(absoluteOutputDir, 'index.html');
              }
              
              const file = Bun.file(filePath);
              return file.exists().then(exists => {
                if (exists) {
                  return new Response(file);
                }
                return new Response("Not Found", { status: 404 });
              });
            },
            error(error) {
              logError(`Server error: ${error}`);
              return new Response("Internal Server Error", { status: 500 });
            },
          });
          logSuccess(`Serving visualization at http://localhost:${port}`);
          logInfo("Press Ctrl+C to stop the server.");
          // Keep the process alive until Ctrl+C
          // This can be achieved by not exiting, or by waiting on a promise that never resolves.
          // Bun.serve itself keeps the process alive.
        } catch (e) {
            logError(`Failed to start server: ${e instanceof Error ? e.message : String(e)}`);
            process.exit(1);
        }
      }

    } catch (error) {
      logError(`An error occurred during the visualization process: ${error instanceof Error ? error.message : String(error)}`);
      process.exit(1);
    }

  } else {
    logError(`Unknown command "${command}".`);
    printUsage();
    process.exit(1);
  }
}

function printUsage() {
  console.log(`
Usage: raapio <command> [options]

Commands:
  analyze <directory> [--output <file>]
    Analyzes the specified directory to build a module dependency graph.
    <directory>: The path to the directory to analyze.
    --output <file>: Optional. The file path to save the graph data.
                     Defaults to 'raapio.graph.json' in the current directory.

  visualize <graphFileJson> [--output-dir <directoryName>] [--plugin <pluginName>] [--serve] [--port <number>]
    Generates a visualization from a graph data JSON file.
    <graphFileJson>: Path to the .graph.json file generated by the 'analyze' command.
    --output-dir <directoryName>: Directory to save the visualization assets.
                                  Defaults to 'raapio_visualization'.
    --plugin <pluginName>: Visualization plugin to use. Options: html, mermaid.
                           Defaults to 'html'.
    --serve: If present, starts a local server for the visualization (HTML plugin only).
    --port <number>: Port for the local server. Defaults to 3000.


Example:
  raapio analyze ./src --output my_project_graph.json
  raapio visualize my_project_graph.json --serve
  raapio visualize my_project_graph.json --plugin mermaid
  `);
}

main().catch(error => {
  logError(`An unexpected error occurred: ${error instanceof Error ? error.message : String(error)}`);
  process.exit(1);
});
