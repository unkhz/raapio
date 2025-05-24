import { readdir, stat } from 'node:fs/promises'; // fs.readdir, fs.stat
import { resolve, extname, normalize as normalizePath, dirname, isAbsolute } from 'node:path';
import * as ts from 'typescript';

// Note: 'node_modules' is handled by path check now in findSourceFilesRecursive
const EXCLUDED_DIR_NAMES = new Set(['.git', 'dist', 'build']); 
const RELEVANT_EXTENSIONS = new Set(['.ts', '.js', '.tsx', '.jsx']);

async function findSourceFilesRecursive(currentDirAbs: string, allFiles: Set<string>): Promise<void> {
  let entries;
  try {
    entries = await readdir(currentDirAbs, { withFileTypes: true });
  } catch (error: any) {
    console.warn(`[Analyzer] Error reading directory ${currentDirAbs}: ${error.message}. Skipping.`);
    return; // Skip unreadable directories
  }

  for (const entry of entries) {
    const fullPathAbs = resolve(currentDirAbs, entry.name);
    // Normalize paths for consistent checking (e.g., forward slashes)
    const normalizedFullPath = normalizePath(fullPathAbs).replace(/\\/g, '/');

    // Path-based node_modules exclusion: if any part of the path contains /node_modules/
    if (normalizedFullPath.includes('/node_modules/')) {
      continue; // Skip anything within a node_modules directory
    }

    if (entry.isDirectory()) {
      // Check against excluded directory names (e.g., .git, dist)
      if (EXCLUDED_DIR_NAMES.has(entry.name)) {
        continue; // Skip this specific directory
      }
      // Recurse into subdirectories
      await findSourceFilesRecursive(fullPathAbs, allFiles);
    } else if (entry.isFile()) {
      const fileExt = extname(entry.name);
      if (RELEVANT_EXTENSIONS.has(fileExt)) {
        allFiles.add(normalizedFullPath);
      }
    }
    // Symbolic links: current logic with withFileTypes: true resolves symlinks before entry.isDirectory/isFile.
    // The path check for /node_modules/ should handle cases where a symlink might point into one.
    // If a symlink's *name* was e.g. 'node_modules' and it pointed elsewhere, EXCLUDED_DIR_NAMES would catch it.
  }
}


/**
 * Recursively finds all source files (ts, js, tsx, jsx) in a directory,
 * applying robust exclusions for node_modules and other specified directories.
 * @param rootDir The absolute path to the root directory to search.
 * @returns A promise that resolves to an array of absolute, normalized file paths.
 */
export async function findSourceFiles(rootDir: string): Promise<string[]> {
  const allFilesSet = new Set<string>();
  const normalizedRootDir = normalizePath(rootDir).replace(/\\/g, '/');

  // Root directory check: if the root itself is inside node_modules, skip.
  if (normalizedRootDir.includes('/node_modules/')) {
    console.warn(`[Analyzer] Warning: The provided root directory '${rootDir}' is inside a 'node_modules' directory. Analysis aborted.`);
    return []; // Do not proceed if the root itself is a node_modules sub-directory
  }
  
  // Also check if the root directory *name* is 'node_modules'
  // This is less likely for a project root but good for completeness.
  if (basename(normalizedRootDir) === 'node_modules') {
     console.warn(`[Analyzer] Warning: The provided root directory '${rootDir}' is named 'node_modules'. Analysis aborted.`);
     return [];
  }


  await findSourceFilesRecursive(normalizedRootDir, allFilesSet);
  return Array.from(allFilesSet);
}
// Need to import basename for the check above.

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

import { basename } from 'node:path'; // Added basename import

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
  // console.log(`[DEBUG] Using compilerOptions: ${JSON.stringify(compilerOptions, null, 2)}`);

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
    // console.log(`[DEBUG] Analyzing file: ${currentFile}`);
    try {
      const fileContent = await Bun.file(currentFile).text();
      const rawImports = await parseImports(currentFile, fileContent);
      const resolvedInternalImports = new Set<string>();

      for (const importSpecifier of rawImports) {
        // console.log(`[DEBUG]   Import specifier: '${importSpecifier}'`);
        const result = ts.resolveModuleName(
          importSpecifier,
          currentFile,
          compilerOptions,
          compilerHost
        );

        if (result.resolvedModule) {
          let resolvedPath = result.resolvedModule.resolvedFileName;
          // console.log(`[DEBUG]     Raw resolvedFileName: '${resolvedPath}'`);
          
          // Ensure resolvedPath is absolute for consistent processing
          if (!isAbsolute(resolvedPath)) {
            resolvedPath = resolve(dirname(currentFile), resolvedPath); // Resolve relative to current file or rootDir
          }
          // For logging consistency, replace backslashes with forward slashes
          const normalizedLoggedPath = resolvedPath.replace(/\\/g, '/');
          // console.log(`[DEBUG]     Normalized resolvedPath for logging/set: '${normalizedLoggedPath}'`);

          const isInNodeModules = normalizedLoggedPath.includes('/node_modules/');
          // console.log(`[DEBUG]     Is in node_modules: ${isInNodeModules}`);

          if (!isInNodeModules) {
            // Use the consistently slashed path for set lookups
            if (projectSourceFilesSet.has(normalizedLoggedPath)) {
              resolvedInternalImports.add(normalizedLoggedPath);
              // console.log(`[DEBUG]       ==> ADDED: ${normalizedLoggedPath}`);
            } else {
              // console.log(`[DEBUG]       ==> SKIPPED (not in projectSourceFilesSet): ${normalizedLoggedPath}`);
            }
          } else {
            // console.log(`[DEBUG]       ==> SKIPPED (in node_modules): ${normalizedLoggedPath}`);
          }
        } else {
          // console.warn(`[DEBUG]     Could not resolve import '${importSpecifier}' from '${currentFile}'.`);
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
