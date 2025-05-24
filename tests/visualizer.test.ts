import { describe, test, expect } from 'bun:test';
import { prepareGraphDataForVisualization } from '../src/visualizer'; 
import { GraphData } from '../src/serializer';

describe('prepareGraphDataForVisualization', () => {
    test('should transform basic graph data correctly', () => {
        const graphData: GraphData = {
            version: '1.0.0',
            rootDir: '/project/root',
            graph: {
                '/project/root/moduleA.ts': ['/project/root/moduleB.ts', '/project/root/lib/moduleC.ts'],
                '/project/root/moduleB.ts': ['/project/root/lib/moduleC.ts'],
                '/project/root/lib/moduleC.ts': [],
                '/project/root/moduleD.ts': ['external-package'], // External dependency
            },
            timestamps: { 
                '/project/root/moduleA.ts': 1,
                '/project/root/moduleB.ts': 1,
                '/project/root/lib/moduleC.ts': 1,
                '/project/root/moduleD.ts': 1,
                'external-package': 1,
            },
        };

        const result = prepareGraphDataForVisualization(graphData);

        expect(result.nodes).toHaveLength(5); 
        expect(result.nodes).toEqual(expect.arrayContaining([
            expect.objectContaining({ id: '/project/root/moduleA.ts', label: 'moduleA.ts', path: '/project/root/moduleA.ts' }),
            expect.objectContaining({ id: '/project/root/moduleB.ts', label: 'moduleB.ts', path: '/project/root/moduleB.ts' }),
            expect.objectContaining({ id: '/project/root/lib/moduleC.ts', label: 'lib/moduleC.ts', path: '/project/root/lib/moduleC.ts' }),
            expect.objectContaining({ id: '/project/root/moduleD.ts', label: 'moduleD.ts', path: '/project/root/moduleD.ts' }),
            expect.objectContaining({ id: 'external-package', label: 'external-package', path: 'external-package' }),
        ]));

        expect(result.edges).toHaveLength(4); 
        expect(result.edges).toEqual(expect.arrayContaining([
            expect.objectContaining({ source: '/project/root/moduleA.ts', target: '/project/root/moduleB.ts' }),
            expect.objectContaining({ source: '/project/root/moduleA.ts', target: '/project/root/lib/moduleC.ts' }),
            expect.objectContaining({ source: '/project/root/moduleB.ts', target: '/project/root/lib/moduleC.ts' }),
            expect.objectContaining({ source: '/project/root/moduleD.ts', target: 'external-package' }),
        ]));
    });

    test('should handle empty graph data gracefully', () => {
        const emptyGraphData: GraphData = {
          version: '1.0.0',
          rootDir: '/test/project',
          graph: {},
          timestamps: {},
        };

        const result = prepareGraphDataForVisualization(emptyGraphData);

        expect(result.nodes).toEqual([]);
        expect(result.edges).toEqual([]);
      });

      test('should handle graph data with nodes but no edges', () => {
        const nodeOnlyGraphData: GraphData = {
            version: '1.0.0',
            rootDir: '/test/project',
            graph: {
                '/test/project/fileA.ts': [],
                '/test/project/fileB.ts': [],
            },
            timestamps: {
                '/test/project/fileA.ts': 123,
                '/test/project/fileB.ts': 456,
            },
        };

        const result = prepareGraphDataForVisualization(nodeOnlyGraphData);

        expect(result.nodes).toHaveLength(2);
        expect(result.nodes).toEqual(expect.arrayContaining([
            expect.objectContaining({ id: '/test/project/fileA.ts', label: 'fileA.ts' }),
            expect.objectContaining({ id: '/test/project/fileB.ts', label: 'fileB.ts' }),
        ]));
        expect(result.edges).toEqual([]);
      });
});
