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
  const sourceFiles = await findSourceFiles(rootDir);

  for (const filePath of sourceFiles) {
    try {
      const fileContent = await Bun.file(filePath).text();
      const rawImports = await parseImports(filePath, fileContent);
      const resolvedImports = new Set<string>();

      for (const importSpecifier of rawImports) {
        if (importSpecifier.startsWith('./') || importSpecifier.startsWith('../')) {
          // Resolve relative path
          const resolvedPath = resolve(dirname(filePath), importSpecifier);
          // Attempt to add common extensions if not present
          // This is a simplified resolution logic. A real resolver would be more complex.
          try {
            await stat(resolvedPath); // Check if path as-is exists
            resolvedImports.add(resolvedPath);
          } catch {
            let found = false;
            for (const ext of ['.ts', '.js', '.tsx', '.jsx']) {
              try {
                const pathWithExt = resolvedPath + ext;
                await stat(pathWithExt);
                resolvedImports.add(pathWithExt);
                found = true;
                break;
              } catch {
                // try next extension
              }
            }
            if (!found) {
              // If no extension worked, try resolving to an index file in a directory
               for (const ext of ['/index.ts', '/index.js', '/index.tsx', '/index.jsx']) {
                 try {
                    const pathWithIndex = resolvedPath + ext;
                    await stat(pathWithIndex);
                    resolvedImports.add(pathWithIndex);
                    found = true;
                    break;
                 } catch {
                    // try next index extension
                 }
               }
            }
            if (!found) {
               console.warn(`[Analyzer] Could not resolve relative import "${importSpecifier}" from "${filePath}" to an existing file. Keeping original.`);
               resolvedImports.add(importSpecifier); // Keep original if no resolution worked
            }
          }
        } else {
          // Non-relative path (e.g., 'fs', 'react'), keep as-is
          resolvedImports.add(importSpecifier);
        }
      }
      dependencyMap.set(filePath, resolvedImports);
    } catch (error) {
      console.warn(`[Analyzer] Error processing file "${filePath}":`, error);
      // Skip this file and continue with others
    }
  }

  return dependencyMap;
}
