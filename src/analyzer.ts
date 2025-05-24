import { readdir, stat } from 'node:fs/promises';
import { resolve, join, dirname, isAbsolute } from 'node:path';
import * as ts from 'typescript';

const excludedDirs = new Set(['node_modules', '.git', 'dist', 'build']); // Define excluded directories

/**
 * Recursively finds all source files (ts, js, tsx, jsx) in a directory.
 * @param dirPath The absolute path to the directory to search.
 * @returns A promise that resolves to an array of absolute file paths.
 */
export async function findSourceFiles(dirPath: string): Promise<string[]> {
  const entries = await readdir(dirPath, { withFileTypes: true });
  const files = await Promise.all(
    entries.map(async (entry) => {
      const fullPath = resolve(dirPath, entry.name);
      if (entry.isDirectory()) {
        // Check if the directory name is in the excluded set
        if (excludedDirs.has(entry.name)) {
          return []; // Skip this directory by returning an empty array
        }
        return findSourceFiles(fullPath); // Recursive call for non-excluded directories
      } else if (entry.isFile() && /\.(ts|js|tsx|jsx)$/.test(entry.name)) {
        return fullPath;
      }
      return []; // Return empty array for non-matching files or other types
    })
  );
  return Array.prototype.concat(...files); // Flatten the array of arrays
}

/**
 * Parses static import and export statements from a file's content.
 * @param filePath The absolute path of the file (used for context if needed, not directly in this impl).
 * @param fileContent The content of the file to parse.
 * @returns A promise that resolves to a Set of unique imported module specifiers.
 */
export async function parseImports(filePath: string, fileContent: string): Promise<Set<string>> {
  try {
    const { imports } = new Bun.Transpiler().scanImports(fileContent);
    // Filter out 'require' and other kinds if necessary, scanImports returns various kinds
    // For ESM, 'import' and 'export' are primary. 'dynamic' for dynamic imports.
    return new Set(imports.filter(imp => imp.kind === 'import-statement' || imp.kind === 'export-from').map(imp => imp.path));
  } catch (e) {
    console.warn(`[Analyzer] Error scanning imports for ${filePath} using Bun.Transpiler:`, e);
    // Fallback or re-throw as appropriate. For now, returning empty set.
    return new Set();
  }
}

function loadCompilerOptions(projectRootDir: string): ts.CompilerOptions {
  const defaultConfig: ts.CompilerOptions = {
    allowJs: true,
    esModuleInterop: true,
    moduleResolution: ts.ModuleResolutionKind.NodeNext, // Or Node16 / Bundler
    // target: ts.ScriptTarget.ESNext, // Specify target if needed for resolution
    // jsx: ts.JsxEmit.React, // Specify JSX mode if relevant
  };

  const tsconfigPath = ts.findConfigFile(projectRootDir, ts.sys.fileExists, "tsconfig.json");

  if (tsconfigPath) {
    const configFile = ts.readConfigFile(tsconfigPath, ts.sys.readFile);
    if (configFile.error) {
      console.warn(`[Analyzer] Error reading tsconfig.json at ${tsconfigPath}: ${configFile.error.messageText}`);
      return defaultConfig;
    }
    const parsedCmd = ts.parseJsonConfigFileContent(configFile.config, ts.sys, projectRootDir);
    if (parsedCmd.errors.length > 0) {
      parsedCmd.errors.forEach(err => console.warn(`[Analyzer] Error parsing tsconfig.json: ${err.messageText}`));
      // Return defaultConfig or partially parsed options? For safety, return default.
      return defaultConfig;
    }
    console.info(`[Analyzer] Loaded compiler options from: ${tsconfigPath}`);
    return { ...defaultConfig, ...parsedCmd.options }; // Spread default to ensure critical defaults aren't missed
  } else {
    console.info("[Analyzer] No tsconfig.json found. Using default compiler options.");
    return defaultConfig;
  }
}


/**
 * Analyzes a directory to find all source files and their direct dependencies.
 * @param rootDir The absolute path to the root directory of the project to analyze.
 * @returns A promise that resolves to a map where keys are absolute file paths
 *          and values are Sets of their resolved imported module specifiers.
 */
export async function analyzeDirectory(rootDir: string): Promise<Map<string, Set<string>>> {
  const dependencyMap = new Map<string, Set<string>>();
  const sourceFilesArray = await findSourceFiles(rootDir);
  const projectSourceFilesSet = new Set(sourceFilesArray);

  const compilerOptions = loadCompilerOptions(rootDir);

  const compilerHost: ts.CompilerHost = {
    fileExists: ts.sys.fileExists,
    readFile: ts.sys.readFile,
    directoryExists: ts.sys.directoryExists,
    getDirectories: ts.sys.getDirectories,
    getCurrentDirectory: () => rootDir,
    getCanonicalFileName: fileName => ts.sys.useCaseSensitiveFileNames ? fileName : fileName.toLowerCase(),
    getNewLine: () => ts.sys.newLine,
    useCaseSensitiveFileNames: () => ts.sys.useCaseSensitiveFileNames,
    getDefaultLibFileName: ts.getDefaultLibFileName,
    // realpath: ts.sys.realpath, // Optional
  };

  for (const currentFile of sourceFilesArray) {
    try {
      const fileContent = await Bun.file(currentFile).text();
      const rawImports = await parseImports(currentFile, fileContent);
      const resolvedInternalImports = new Set<string>();

      for (const importSpecifier of rawImports) {
        const result = ts.resolveModuleName(
          importSpecifier,
          currentFile,
          compilerOptions,
          compilerHost
        );

        if (result.resolvedModule) {
          let resolvedPath = result.resolvedModule.resolvedFileName;
          // Ensure resolvedPath is absolute (it should be from ts.resolveModuleName)
          if (!isAbsolute(resolvedPath)) {
            resolvedPath = resolve(rootDir, resolvedPath); // Or based on how ts.resolveModuleName forms paths
          }
          
          // Filter out node_modules and non-project files
          if (!resolvedPath.includes('/node_modules/') && !resolvedPath.includes('/node_modules\\')) { // Check for both path separators
            if (projectSourceFilesSet.has(resolvedPath)) {
              resolvedInternalImports.add(resolvedPath);
            } else {
              // Optional: Log if a resolved path is not in node_modules but also not in project sources
              // This could indicate a .d.ts file, a resource file, or a misconfiguration.
              // console.warn(`[Analyzer] Resolved '${importSpecifier}' from '${currentFile}' to '${resolvedPath}', but it's not a tracked project source file. Skipping.`);
            }
          } else {
            // console.log(`[Analyzer] Ignoring resolved import for '${importSpecifier}' from '${currentFile}' to node_modules: ${resolvedPath}`);
          }
        } else {
          console.warn(`[Analyzer] Could not resolve import '${importSpecifier}' from '${currentFile}' using TypeScript resolver.`);
        }
      }
      dependencyMap.set(currentFile, resolvedInternalImports);
    } catch (error) {
      console.warn(`[Analyzer] Error processing file "${currentFile}":`, error);
    }
  }
  return dependencyMap;
}
