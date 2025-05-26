import { BaseVisualizationPlugin, VisualizationData } from '../base';
import { writeFile, mkdir } from 'node:fs/promises';
import { join, basename } from 'node:path';

export class ChartJsVisualizationPlugin extends BaseVisualizationPlugin {
  name = 'chartjs';

  async generate(data: VisualizationData, outputPath: string): Promise<void> {
    await mkdir(outputPath, { recursive: true });

    const htmlContent = this.generateHtml();
    const chartData = this.prepareChartData(data);

    await Promise.all([
      writeFile(join(outputPath, 'index.html'), htmlContent),
      writeFile(join(outputPath, 'graph-data.json'), JSON.stringify(chartData, null, 2))
    ]);
  }

  private prepareChartData(data: VisualizationData) {
    // Force-directed layout using actual edge data
    const nodePositions = this.calculateForceDirectedLayoutWithEdges(data);
    
    // Prepare node data with minimal processing
    const nodeData = data.nodes.map((node, index) => {
      const pos = nodePositions[index];
      const nodeType = this.getNodeType(node.label);
      
      return {
        x: pos.x,
        y: pos.y,
        label: node.label,
        path: node.path,
        id: node.id,
        color: nodeType.color,
        borderColor: nodeType.borderColor
      };
    });

    // Prepare edge data for lines
    const edgeData = data.edges.map(edge => {
      const sourceIndex = data.nodes.findIndex(n => n.id === edge.source);
      const targetIndex = data.nodes.findIndex(n => n.id === edge.target);
      
      if (sourceIndex === -1 || targetIndex === -1) return null;
      
      const sourcePos = nodePositions[sourceIndex];
      const targetPos = nodePositions[targetIndex];
      
      return {
        source: { x: sourcePos.x, y: sourcePos.y },
        target: { x: targetPos.x, y: targetPos.y }
      };
    }).filter(Boolean);

    return {
      nodes: nodeData,
      edges: edgeData
    };
  }

  private calculateGridLayout(nodeCount: number): Array<{x: number, y: number}> {
    // Force-directed layout calculation (no animation, just final positions)
    return this.calculateForceDirectedLayout(nodeCount);
  }

  private calculateForceDirectedLayoutWithEdges(data: VisualizationData): Array<{x: number, y: number}> {
    const nodeCount = data.nodes.length;
    const width = 1200;
    const height = 800;
    
    // Initialize positions randomly
    const positions: Array<{x: number, y: number, vx: number, vy: number}> = [];
    for (let i = 0; i < nodeCount; i++) {
      positions.push({
        x: Math.random() * (width - 200) + 100,
        y: Math.random() * (height - 200) + 100,
        vx: 0,
        vy: 0
      });
    }

    // Force simulation parameters
    const iterations = 300; // Balanced performance vs quality
    const repulsionStrength = 2000;
    const attractionStrength = 0.02;
    const damping = 0.9;
    const minDistance = 80;

    // Run force simulation to completion (no animation)
    for (let iter = 0; iter < iterations; iter++) {
      // Apply repulsive forces between all nodes
      for (let i = 0; i < nodeCount; i++) {
        for (let j = i + 1; j < nodeCount; j++) {
          const dx = positions[j].x - positions[i].x;
          const dy = positions[j].y - positions[i].y;
          const distance = Math.sqrt(dx * dx + dy * dy);
          
          if (distance > 0 && distance < minDistance * 3) {
            const force = repulsionStrength / (distance * distance + 1);
            const fx = (dx / distance) * force;
            const fy = (dy / distance) * force;
            
            positions[i].vx -= fx;
            positions[i].vy -= fy;
            positions[j].vx += fx;
            positions[j].vy += fy;
          }
        }
      }

      // Apply attractive forces for connected nodes using actual edges
      data.edges.forEach(edge => {
        const sourceIndex = data.nodes.findIndex(n => n.id === edge.source);
        const targetIndex = data.nodes.findIndex(n => n.id === edge.target);
        
        if (sourceIndex !== -1 && targetIndex !== -1) {
          const dx = positions[targetIndex].x - positions[sourceIndex].x;
          const dy = positions[targetIndex].y - positions[sourceIndex].y;
          const distance = Math.sqrt(dx * dx + dy * dy);
          
          if (distance > 0) {
            const force = distance * attractionStrength;
            const fx = (dx / distance) * force;
            const fy = (dy / distance) * force;
            
            positions[sourceIndex].vx += fx;
            positions[sourceIndex].vy += fy;
            positions[targetIndex].vx -= fx;
            positions[targetIndex].vy -= fy;
          }
        }
      });

      // Weak centering force to prevent nodes from drifting too far
      const centerX = width / 2;
      const centerY = height / 2;
      
      for (let i = 0; i < nodeCount; i++) {
        const dx = centerX - positions[i].x;
        const dy = centerY - positions[i].y;
        const distance = Math.sqrt(dx * dx + dy * dy);
        
        if (distance > 0) {
          const force = distance * 0.0005; // Very weak centering force
          positions[i].vx += (dx / distance) * force;
          positions[i].vy += (dy / distance) * force;
        }
      }

      // Update positions and apply damping
      for (let i = 0; i < nodeCount; i++) {
        positions[i].vx *= damping;
        positions[i].vy *= damping;
        
        positions[i].x += positions[i].vx;
        positions[i].y += positions[i].vy;
        
        // Keep within bounds with some padding
        positions[i].x = Math.max(80, Math.min(width - 80, positions[i].x));
        positions[i].y = Math.max(80, Math.min(height - 80, positions[i].y));
      }
    }

    // Return final positions without velocity
    return positions.map(p => ({ x: p.x, y: p.y }));
  }

  private calculateForceDirectedLayout(nodeCount: number): Array<{x: number, y: number}> {
    // Fallback method - not used anymore but kept for reference
    return [];
  }

  private getNodeType(label: string): {color: string, borderColor: string} {
    const fileName = basename(label);
    const ext = fileName.split('.').pop()?.toLowerCase();
    
    switch (ext) {
      case 'ts':
      case 'tsx':
        return { color: 'rgba(59, 130, 246, 0.8)', borderColor: 'rgb(59, 130, 246)' };
      case 'js':
      case 'jsx':
        return { color: 'rgba(251, 191, 36, 0.8)', borderColor: 'rgb(251, 191, 36)' };
      case 'css':
      case 'scss':
      case 'sass':
        return { color: 'rgba(168, 85, 247, 0.8)', borderColor: 'rgb(168, 85, 247)' };
      case 'html':
        return { color: 'rgba(34, 197, 94, 0.8)', borderColor: 'rgb(34, 197, 94)' };
      case 'json':
        return { color: 'rgba(249, 115, 22, 0.8)', borderColor: 'rgb(249, 115, 22)' };
      case 'md':
        return { color: 'rgba(107, 114, 128, 0.8)', borderColor: 'rgb(107, 114, 128)' };
      default:
        if (!fileName.includes('.')) {
          return { color: 'rgba(239, 68, 68, 0.8)', borderColor: 'rgb(239, 68, 68)' };
        }
        return { color: 'rgba(156, 163, 175, 0.8)', borderColor: 'rgb(156, 163, 175)' };
    }
  }

  private generateHtml(): string {
    return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Raapio - Module Graph Browser</title>
    <style>
        * {
            margin: 0;
            padding: 0;
            box-sizing: border-box;
        }
        
        body {
            font-family: system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
            background-color: #ffffff;
            overflow: hidden;
            height: 100vh;
        }
        
        #container {
            width: 100vw;
            height: 100vh;
            position: relative;
            overflow: hidden;
            cursor: grab;
        }
        
        #container.dragging {
            cursor: grabbing;
        }
        
        #graph-canvas {
            width: 100%;
            height: 100%;
            display: block;
        }
        
        #controls {
            position: absolute;
            top: 10px;
            right: 10px;
            background: rgba(255, 255, 255, 0.95);
            padding: 10px;
            border-radius: 6px;
            box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);
            font-size: 12px;
            z-index: 1000;
        }
        
        .control-group {
            margin-bottom: 8px;
        }
        
        .control-group:last-child {
            margin-bottom: 0;
        }
        
        button {
            background: #f3f4f6;
            border: 1px solid #d1d5db;
            border-radius: 4px;
            padding: 4px 8px;
            margin: 0 2px;
            cursor: pointer;
            font-size: 11px;
        }
        
        button:hover {
            background: #e5e7eb;
        }
        
        button:active {
            background: #d1d5db;
        }
        
        #nodeInfo {
            position: absolute;
            bottom: 10px;
            left: 10px;
            background: rgba(255, 255, 255, 0.95);
            padding: 10px;
            border-radius: 6px;
            box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);
            font-size: 12px;
            max-width: 400px;
            display: none;
            z-index: 1000;
        }
        
        .info-title {
            font-weight: 600;
            margin-bottom: 4px;
            color: #374151;
        }
        
        .info-detail {
            color: #6b7280;
            margin-bottom: 2px;
        }
        
        .connections {
            margin-top: 8px;
            font-size: 11px;
        }
        
        .connection-list {
            max-height: 80px;
            overflow-y: auto;
            margin-top: 4px;
        }
    </style>
</head>
<body>
    <div id="container">
        <canvas id="graph-canvas"></canvas>
        
        <div id="controls">
            <div class="control-group">
                <button onclick="zoomIn()">Zoom In</button>
                <button onclick="zoomOut()">Zoom Out</button>
                <button onclick="fitToScreen()">Fit All</button>
            </div>
            <div class="control-group">
                <button onclick="resetView()">Reset</button>
            </div>
            <div>Nodes: <span id="nodeCount">0</span></div>
            <div>Edges: <span id="edgeCount">0</span></div>
        </div>
        
        <div id="nodeInfo">
            <div class="info-title" id="nodeTitle"></div>
            <div class="info-detail" id="nodePath"></div>
            <div class="connections">
                <div><strong>Dependencies:</strong></div>
                <div class="connection-list" id="dependencies"></div>
                <div><strong>Dependents:</strong></div>
                <div class="connection-list" id="dependents"></div>
            </div>
        </div>
    </div>

    <script>
        let graphData = null;
        let canvas = null;
        let ctx = null;
        let camera = { x: 0, y: 0, zoom: 1 };
        let isDragging = false;
        let lastMousePos = { x: 0, y: 0 };
        let hoveredNode = null;
        let selectedNode = null;

        // Initialize
        document.addEventListener('DOMContentLoaded', function() {
            canvas = document.getElementById('graph-canvas');
            ctx = canvas.getContext('2d');
            
            setupCanvas();
            setupEventListeners();
            loadGraphData();
        });

        function setupCanvas() {
            function resizeCanvas() {
                canvas.width = window.innerWidth;
                canvas.height = window.innerHeight;
                draw();
            }
            
            resizeCanvas();
            window.addEventListener('resize', resizeCanvas);
        }

        function setupEventListeners() {
            const container = document.getElementById('container');
            
            // Mouse events
            canvas.addEventListener('mousedown', handleMouseDown);
            canvas.addEventListener('mousemove', handleMouseMove);
            canvas.addEventListener('mouseup', handleMouseUp);
            canvas.addEventListener('mouseleave', handleMouseUp);
            canvas.addEventListener('wheel', handleWheel);
            canvas.addEventListener('click', handleClick);
            
            // Prevent context menu
            canvas.addEventListener('contextmenu', e => e.preventDefault());
        }

        function loadGraphData() {
            fetch('graph-data.json')
                .then(response => response.json())
                .then(data => {
                    graphData = data;
                    document.getElementById('nodeCount').textContent = data.nodes.length;
                    document.getElementById('edgeCount').textContent = data.edges.length;
                    fitToScreen();
                })
                .catch(error => console.error('Error loading graph data:', error));
        }

        function screenToWorld(screenX, screenY) {
            return {
                x: (screenX - camera.x) / camera.zoom,
                y: (screenY - camera.y) / camera.zoom
            };
        }

        function worldToScreen(worldX, worldY) {
            return {
                x: worldX * camera.zoom + camera.x,
                y: worldY * camera.zoom + camera.y
            };
        }

        function handleMouseDown(e) {
            isDragging = true;
            lastMousePos = { x: e.clientX, y: e.clientY };
            document.getElementById('container').classList.add('dragging');
        }

        function handleMouseMove(e) {
            if (isDragging) {
                const deltaX = e.clientX - lastMousePos.x;
                const deltaY = e.clientY - lastMousePos.y;
                
                camera.x += deltaX;
                camera.y += deltaY;
                
                lastMousePos = { x: e.clientX, y: e.clientY };
                draw();
            } else {
                // Check for node hover
                const worldPos = screenToWorld(e.clientX, e.clientY);
                const newHoveredNode = findNodeAt(worldPos.x, worldPos.y);
                
                if (newHoveredNode !== hoveredNode) {
                    hoveredNode = newHoveredNode;
                    draw();
                    updateNodeInfo(hoveredNode);
                }
            }
        }

        function handleMouseUp(e) {
            isDragging = false;
            document.getElementById('container').classList.remove('dragging');
        }

        function handleWheel(e) {
            e.preventDefault();
            
            const zoomFactor = e.deltaY > 0 ? 0.9 : 1.1;
            const mousePos = screenToWorld(e.clientX, e.clientY);
            
            camera.zoom *= zoomFactor;
            camera.zoom = Math.max(0.1, Math.min(5, camera.zoom));
            
            // Zoom toward mouse position
            camera.x = e.clientX - mousePos.x * camera.zoom;
            camera.y = e.clientY - mousePos.y * camera.zoom;
            
            draw();
        }

        function handleClick(e) {
            const worldPos = screenToWorld(e.clientX, e.clientY);
            selectedNode = findNodeAt(worldPos.x, worldPos.y);
            draw();
            updateNodeInfo(selectedNode);
        }

        function findNodeAt(x, y) {
            if (!graphData) return null;
            
            const nodeRadius = 20;
            
            for (const node of graphData.nodes) {
                const dx = x - node.x;
                const dy = y - node.y;
                const distance = Math.sqrt(dx * dx + dy * dy);
                
                if (distance <= nodeRadius) {
                    return node;
                }
            }
            
            return null;
        }

        function updateNodeInfo(node) {
            const info = document.getElementById('nodeInfo');
            
            if (!node) {
                info.style.display = 'none';
                return;
            }
            
            document.getElementById('nodeTitle').textContent = node.label;
            document.getElementById('nodePath').textContent = node.path;
            
            // Find dependencies and dependents
            const dependencies = graphData.edges
                .filter(edge => edge.source.x === node.x && edge.source.y === node.y)
                .map(edge => {
                    const target = graphData.nodes.find(n => n.x === edge.target.x && n.y === edge.target.y);
                    return target ? target.label : 'Unknown';
                });
            
            const dependents = graphData.edges
                .filter(edge => edge.target.x === node.x && edge.target.y === node.y)
                .map(edge => {
                    const source = graphData.nodes.find(n => n.x === edge.source.x && n.y === edge.source.y);
                    return source ? source.label : 'Unknown';
                });
            
            document.getElementById('dependencies').innerHTML = 
                dependencies.length > 0 ? dependencies.join('<br>') : '<em>None</em>';
            document.getElementById('dependents').innerHTML = 
                dependents.length > 0 ? dependents.join('<br>') : '<em>None</em>';
            
            info.style.display = 'block';
        }

        function draw() {
            if (!graphData) return;
            
            ctx.clearRect(0, 0, canvas.width, canvas.height);
            
            // Draw edges first (behind nodes)
            ctx.strokeStyle = '#d1d5db';
            ctx.lineWidth = 1;
            
            for (const edge of graphData.edges) {
                const sourceScreen = worldToScreen(edge.source.x, edge.source.y);
                const targetScreen = worldToScreen(edge.target.x, edge.target.y);
                
                ctx.beginPath();
                ctx.moveTo(sourceScreen.x, sourceScreen.y);
                ctx.lineTo(targetScreen.x, targetScreen.y);
                ctx.stroke();
            }
            
            // Draw nodes
            for (const node of graphData.nodes) {
                const screenPos = worldToScreen(node.x, node.y);
                const isHovered = hoveredNode === node;
                const isSelected = selectedNode === node;
                
                // Node circle
                ctx.beginPath();
                ctx.arc(screenPos.x, screenPos.y, 20, 0, 2 * Math.PI);
                ctx.fillStyle = node.color;
                ctx.fill();
                
                if (isHovered || isSelected) {
                    ctx.strokeStyle = isSelected ? '#dc2626' : '#374151';
                    ctx.lineWidth = isSelected ? 3 : 2;
                    ctx.stroke();
                }
                
                // Node label
                ctx.fillStyle = '#374151';
                ctx.font = \`\${Math.max(10, 12 * camera.zoom)}px system-ui\`;
                ctx.textAlign = 'center';
                ctx.textBaseline = 'middle';
                
                const label = node.label.length > 20 ? node.label.substring(0, 17) + '...' : node.label;
                ctx.fillText(label, screenPos.x, screenPos.y + 35);
            }
        }

        // Control functions
        function zoomIn() {
            camera.zoom *= 1.2;
            camera.zoom = Math.min(5, camera.zoom);
            draw();
        }

        function zoomOut() {
            camera.zoom *= 0.8;
            camera.zoom = Math.max(0.1, camera.zoom);
            draw();
        }

        function fitToScreen() {
            if (!graphData || graphData.nodes.length === 0) return;
            
            // Find bounds
            let minX = Infinity, maxX = -Infinity;
            let minY = Infinity, maxY = -Infinity;
            
            for (const node of graphData.nodes) {
                minX = Math.min(minX, node.x);
                maxX = Math.max(maxX, node.x);
                minY = Math.min(minY, node.y);
                maxY = Math.max(maxY, node.y);
            }
            
            const padding = 100;
            const graphWidth = maxX - minX + padding * 2;
            const graphHeight = maxY - minY + padding * 2;
            
            const scaleX = canvas.width / graphWidth;
            const scaleY = canvas.height / graphHeight;
            camera.zoom = Math.min(scaleX, scaleY);
            
            camera.x = (canvas.width - (maxX + minX) * camera.zoom) / 2;
            camera.y = (canvas.height - (maxY + minY) * camera.zoom) / 2;
            
            draw();
        }

        function resetView() {
            camera = { x: 0, y: 0, zoom: 1 };
            draw();
        }
    </script>
</body>
</html>`;
  }
}