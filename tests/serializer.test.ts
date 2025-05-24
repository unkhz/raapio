import { describe, test, expect, afterEach, beforeEach } from 'bun:test';
import { saveGraph, loadGraph, getFileTimestamps, GraphData } from '../src/serializer';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { statSync } from 'node:fs'; // For getting actual mtime

describe('Serializer', () => {
  let tempTestDir: string;
  let tempFilePath: string;

  beforeEach(async () => {
    tempTestDir = await mkdtemp(join(tmpdir(), 'serializerTest-'));
    tempFilePath = join(tempTestDir, 'test_graph.json');
  });

  afterEach(async () => {
    if (tempTestDir) {
      await rm(tempTestDir, { recursive: true, force: true });
    }
  });

  describe('saveGraph and loadGraph', () => {
    test('should save and then load graph data correctly', async () => {
      const sampleGraphData: GraphData = {
        version: '1.0.0',
        rootDir: '/project/root',
        graph: {
          '/project/root/file1.ts': ['/project/root/file2.ts'],
          '/project/root/file2.ts': [],
        },
        timestamps: {
          '/project/root/file1.ts': 1678886400000,
          '/project/root/file2.ts': 1678886400001,
        },
      };

      await saveGraph(tempFilePath, sampleGraphData);
      const loadedData = await loadGraph(tempFilePath);

      expect(loadedData).not.toBeNull();
      expect(loadedData).toEqual(sampleGraphData);
    });

    test('loadGraph should return null for a non-existent file', async () => {
      const nonExistentPath = join(tempTestDir, 'does_not_exist.json');
      const loadedData = await loadGraph(nonExistentPath);
      expect(loadedData).toBeNull();
    });

    test('loadGraph should return null for an invalid JSON file', async () => {
      await writeFile(tempFilePath, 'this is not json');
      const loadedData = await loadGraph(tempFilePath);
      expect(loadedData).toBeNull();
    });

    test('loadGraph should return null for a JSON file with incorrect structure', async () => {
      const invalidData = {
        version: '1.0',
        // missing rootDir
        graph: {},
        timestamps: {},
      };
      await writeFile(tempFilePath, JSON.stringify(invalidData));
      const loadedData = await loadGraph(tempFilePath);
      expect(loadedData).toBeNull();
    });
  });

  describe('getFileTimestamps', () => {
    let file1Path: string;
    let file2Path: string;

    beforeEach(async () => {
      file1Path = join(tempTestDir, 'tempfile1.ts');
      file2Path = join(tempTestDir, 'tempfile2.js');

      await writeFile(file1Path, 'content1');
      // Introduce a slight delay to ensure mtimes are potentially different if system clock resolution is low
      await new Promise(resolve => setTimeout(resolve, 50));
      await writeFile(file2Path, 'content2');
    });

    test('should return correct timestamps for existing files', async () => {
      const filePaths = [file1Path, file2Path];
      const timestamps = await getFileTimestamps(filePaths);

      expect(Object.keys(timestamps).length).toBe(2);
      expect(timestamps[file1Path]).toBeDefined();
      expect(typeof timestamps[file1Path]).toBe('number');
      expect(timestamps[file2Path]).toBeDefined();
      expect(typeof timestamps[file2Path]).toBe('number');

      // Check against actual stat values (optional, but good for confidence)
      const stat1 = statSync(file1Path);
      const stat2 = statSync(file2Path);
      expect(timestamps[file1Path]).toBe(stat1.mtimeMs);
      expect(timestamps[file2Path]).toBe(stat2.mtimeMs);
    });

    test('should handle non-existent files gracefully', async () => {
      const nonExistentPath = join(tempTestDir, 'non_existent_file.ts');
      const filePaths = [file1Path, nonExistentPath, file2Path];
      const timestamps = await getFileTimestamps(filePaths);

      expect(Object.keys(timestamps).length).toBe(2);
      expect(timestamps[file1Path]).toBeDefined();
      expect(timestamps[nonExistentPath]).toBeUndefined(); // Should be omitted
      expect(timestamps[file2Path]).toBeDefined();
    });

    test('should return an empty object if no files are provided', async () => {
      const timestamps = await getFileTimestamps([]);
      expect(timestamps).toEqual({});
    });
  });
});
