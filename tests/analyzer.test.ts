import { describe, test, expect, afterAll, beforeEach } from 'bun:test';
import { findSourceFiles, parseImports, analyzeDirectory } from '../src/analyzer';
import { mkdtemp, rm, mkdir, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { tmpdir } from 'node:os';

describe('Analyzer', () => {
  describe('parseImports', () => {
    test('should parse various static import syntaxes', async () => {
      const fileContent = `
        import { x } from './moduleA';
        import defaultExport from "./moduleB";
        import * as name from "../moduleC";
        import './moduleD'; // side effect import
        export { y } from './moduleE';
        export * from './moduleF';
        import { z } from 'external-package';
        // Should not match:
        // const x = "import { a } from './fake';";
        /* import { b } from './anotherFake'; */
      `;
      const expectedImports = new Set([
        './moduleA',
        './moduleB',
        '../moduleC',
        './moduleD',
        './moduleE',
        './moduleF',
        'external-package',
      ]);
      const result = await parseImports('dummy/path/file.ts', fileContent);
      expect(result).toEqual(expectedImports);
    });

    test('should return empty set for no imports', async () => {
      const fileContent = `
        const a = 1;
        export function greet() { console.log("hello"); }
      `;
      const result = await parseImports('dummy/path/file.ts', fileContent);
      expect(result.size).toBe(0);
    });

     test('should ignore commented out imports and imports in strings', async () => {
      const fileContent = `
        // import { commented } from './commented';
        /* import { multiLine } from './multiLine'; */
        const str = "import { stringImport } from './stringImport';";
        import { real } from './real';
      `;
      const expectedImports = new Set(['./real']);
      const result = await parseImports('dummy/path/file.ts', fileContent);
      expect(result).toEqual(expectedImports);
    });
  });

  describe('findSourceFiles', () => {
    let tempTestDir: string;

    beforeEach(async () => {
      tempTestDir = await mkdtemp(join(tmpdir(), 'findFilesTest-'));
    });

    afterAll(async () => {
      if (tempTestDir) {
        await rm(tempTestDir, { recursive: true, force: true });
      }
    });

    test('should find all .ts, .js, .tsx, .jsx files recursively', async () => {
      // Create a directory structure
      await mkdir(join(tempTestDir, 'subdir'), { recursive: true });
      await writeFile(join(tempTestDir, 'file1.ts'), '');
      await writeFile(join(tempTestDir, 'file2.js'), '');
      await writeFile(join(tempTestDir, 'subdir', 'file3.tsx'), '');
      await writeFile(join(tempTestDir, 'subdir', 'file4.jsx'), '');
      await writeFile(join(tempTestDir, 'file5.txt'), ''); // Should be ignored
      await writeFile(join(tempTestDir, 'subdir', 'file6.md'), ''); // Should be ignored

      const expectedFiles = [
        resolve(tempTestDir, 'file1.ts'),
        resolve(tempTestDir, 'file2.js'),
        resolve(tempTestDir, 'subdir', 'file3.tsx'),
        resolve(tempTestDir, 'subdir', 'file4.jsx'),
      ].sort();

      const result = await findSourceFiles(tempTestDir);
      expect(result.sort()).toEqual(expectedFiles);
    });

    test('should return an empty array for a directory with no source files', async () => {
      await writeFile(join(tempTestDir, 'file5.txt'), '');
      await mkdir(join(tempTestDir, 'emptySubDir'), { recursive: true });

      const result = await findSourceFiles(tempTestDir);
      expect(result).toEqual([]);
    });
  });

  describe('analyzeDirectory (Simplified)', () => {
    let analyzeTestDir: string;

    beforeEach(async () => {
      analyzeTestDir = await mkdtemp(join(tmpdir(), 'analyzeTest-'));
      // Structure:
      // analyzeTestDir/
      //   main.ts (imports ./lib/util.ts)
      //   lib/
      //     util.ts (imports ../other.ts, ./helper.js)
      //     helper.js
      //   other.ts
      //   unrelated.txt

      await mkdir(join(analyzeTestDir, 'lib'), { recursive: true });

      await writeFile(join(analyzeTestDir, 'main.ts'), "import { something } from './lib/util';");
      await writeFile(join(analyzeTestDir, 'lib', 'util.ts'), "import { otherThing } from '../other'; import { h } from './helper.js';");
      await writeFile(join(analyzeTestDir, 'lib', 'helper.js'), "export const h = 1;");
      await writeFile(join(analyzeTestDir, 'other.ts'), "export const ot = 2;");
      await writeFile(join(analyzeTestDir, 'unrelated.txt'), "ignore me");
    });

    afterAll(async () => {
      if (analyzeTestDir) {
        await rm(analyzeTestDir, { recursive: true, force: true });
      }
    });

    test('should correctly map dependencies with resolved absolute paths', async () => {
      const result = await analyzeDirectory(analyzeTestDir);

      const mainTsPath = resolve(analyzeTestDir, 'main.ts');
      const utilTsPath = resolve(analyzeTestDir, 'lib', 'util.ts');
      const helperJsPath = resolve(analyzeTestDir, 'lib', 'helper.js');
      const otherTsPath = resolve(analyzeTestDir, 'other.ts');

      expect(result.has(mainTsPath)).toBe(true);
      expect(result.get(mainTsPath)).toEqual(new Set([utilTsPath]));

      expect(result.has(utilTsPath)).toBe(true);
      expect(result.get(utilTsPath)).toEqual(new Set([otherTsPath, helperJsPath]));
      
      expect(result.has(helperJsPath)).toBe(true);
      expect(result.get(helperJsPath)).toEqual(new Set()); // helper.js has no imports

      expect(result.has(otherTsPath)).toBe(true);
      expect(result.get(otherTsPath)).toEqual(new Set()); // other.ts has no imports

      expect(result.size).toBe(4); // main.ts, lib/util.ts, lib/helper.js, other.ts
    });
  });
});
