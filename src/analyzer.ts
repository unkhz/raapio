import { readdir, stat } from 'node:fs/promises';
import { resolve, join, dirname } from 'node:path';

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
  const imports = new Set<string>();
  // Regex for static imports: import ... from 'module-path';
  const importRegex = /import\s+.*?\s*from\s*['"]([^'"]+)['"];/g;
  // Regex for static exports: export ... from 'module-path';
  const exportRegex = /export\s+.*?\s*from\s*['"]([^'"]+)['"];/g;

  let match;
  while ((match = importRegex.exec(fileContent)) !== null) {
    imports.add(match[1]);
  }
  while ((match = exportRegex.exec(fileContent)) !== null) {
    imports.add(match[1]);
  }

  return imports;
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
  const projectSourceFilesSet = new Set(sourceFilesArray); // For efficient lookup

  for (const filePath of sourceFilesArray) { // Iterate using the array to maintain order if needed, though Set for lookup
    try {
      const fileContent = await Bun.file(filePath).text();
      const rawImports = await parseImports(filePath, fileContent);
      const resolvedInternalImports = new Set<string>(); // Renamed for clarity

      for (const importSpecifier of rawImports) {
        if (importSpecifier.startsWith('./') || importSpecifier.startsWith('../')) {
          // Resolve relative path
          const initiallyResolvedPath = resolve(dirname(filePath), importSpecifier);
          
          let successfullyResolvedPath: string | null = null;

          // Attempt to find the file, checking extensions and index files
          try {
            await stat(initiallyResolvedPath); // Check if path as-is exists
            successfullyResolvedPath = initiallyResolvedPath;
          } catch {
            let found = false;
            // Try common extensions
            for (const ext of ['.ts', '.js', '.tsx', '.jsx']) {
              try {
                const pathWithExt = initiallyResolvedPath + ext;
                await stat(pathWithExt);
                successfullyResolvedPath = pathWithExt;
                found = true;
                break;
              } catch { /* try next extension */ }
            }
            if (!found) {
              // Try index files in a directory
               for (const ext of ['/index.ts', '/index.js', '/index.tsx', '/index.jsx']) {
                 try {
                    const pathWithIndex = initiallyResolvedPath + ext;
                    await stat(pathWithIndex);
                    successfullyResolvedPath = pathWithIndex;
                    found = true;
                    break;
                 } catch { /* try next index extension */ }
               }
            }
          }

          // If resolved and it's a project file, add it
          if (successfullyResolvedPath && projectSourceFilesSet.has(successfullyResolvedPath)) {
            resolvedInternalImports.add(successfullyResolvedPath);
          } else if (successfullyResolvedPath) {
            // It resolved to a file, but that file is not in our projectSourceFilesSet
            // (e.g. a .d.ts file, or some other file not picked by findSourceFiles).
            // For now, we ignore these as per the requirement to only map project-internal files.
            // console.warn(`[Analyzer] Resolved import "${importSpecifier}" to "${successfullyResolvedPath}" but it's not a tracked project source file. Ignoring.`);
          } else {
            // Did not resolve to any existing file with known extensions.
            console.warn(`[Analyzer] Could not resolve relative import "${importSpecifier}" from "${filePath}" to an existing project file.`);
          }

        } else {
          // Non-relative path (e.g., 'fs', 'react'). These are external.
          // As per requirements, these should be omitted from the Set<string> of resolved imports.
          // So, we do nothing here for external modules.
        }
      }
      // Only add to map if there are internal dependencies, or to represent all scanned files
      // The requirement is for the Set<string> to only contain absolute paths to *other existing files within the project*.
      // So, if resolvedInternalImports is empty, it's correct.
      dependencyMap.set(filePath, resolvedInternalImports);

    } catch (error) {
      console.warn(`[Analyzer] Error processing file "${filePath}":`, error);
      // Skip this file and continue with others
    }
  }

  return dependencyMap;
}
