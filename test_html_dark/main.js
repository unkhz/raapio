// web/main.js
document.addEventListener('DOMContentLoaded', () => {
    // Dark mode functionality
    const darkModeToggle = document.getElementById('dark-mode-toggle');
    const body = document.body;
    
    // Check for saved dark mode preference or default to light mode
    const isDarkMode = localStorage.getItem('darkMode') === 'true';
    if (isDarkMode) {
        body.setAttribute('data-theme', 'dark');
        darkModeToggle.textContent = '☀️ Light Mode';
    }
    
    darkModeToggle.addEventListener('click', () => {
        const currentTheme = body.getAttribute('data-theme');
        if (currentTheme === 'dark') {
            body.removeAttribute('data-theme');
            darkModeToggle.textContent = '🌙 Dark Mode';
            localStorage.setItem('darkMode', 'false');
        } else {
            body.setAttribute('data-theme', 'dark');
            darkModeToggle.textContent = '☀️ Light Mode';
            localStorage.setItem('darkMode', 'true');
        }
    });

    // ... (existing setup, including defs and marker for arrowheads) ...
    const svg = document.getElementById('graph-svg');
    const svgNS = "http://www.w3.org/2000/svg";

    // Add <defs> for markers like arrowheads (if not already moved to be created once)
    let defs = svg.querySelector('defs');
    if (!defs) {
        defs = document.createElementNS(svgNS, 'defs');
        svg.insertBefore(defs, svg.firstChild); // Insert defs at the beginning

        const marker = document.createElementNS(svgNS, 'marker');
        marker.setAttribute('id', 'arrowhead');
        marker.setAttribute('viewBox', '0 0 10 10');
        marker.setAttribute('refX', '8'); 
        marker.setAttribute('refY', '5');
        marker.setAttribute('markerWidth', '6');
        marker.setAttribute('markerHeight', '6');
        marker.setAttribute('orient', 'auto-start-reverse');

        const path = document.createElementNS(svgNS, 'path');
        path.setAttribute('d', 'M 0 0 L 10 5 L 0 10 z');
        marker.appendChild(path);
        defs.appendChild(marker);
    }


    fetch('visualization_data.json')
        .then(response => response.json())
        .then(data => {
            renderGraph(data.nodes, data.edges);
        })
        .catch(error => console.error('Error loading graph data:', error));

    function renderGraph(nodes, edges) {
        if (!svg) return;
        
        const existingNodesAndEdges = svg.querySelectorAll('.node, .edge, .package, .package-label');
        existingNodesAndEdges.forEach(el => el.remove());

        const width = svg.clientWidth;
        const height = svg.clientHeight;
        const textPadding = 10;
        
        // Set up force-directed layout for better node spacing
        // Define node size based on the length of the filename
        nodes.forEach(node => {
            // Extract the filename from the path
            node.filename = node.label.split('/').pop();
            node.size = Math.max(node.filename.length * 5, 40);
        });
        
        // Create simulation function for force-directed layout
        function runSimulation() {
            // Create node positions object
            const nodePositions = new Map();
            nodes.forEach(node => {
                // Initial random positions
                nodePositions.set(node.id, {
                    x: Math.random() * width * 0.8 + width * 0.1,
                    y: Math.random() * height * 0.8 + height * 0.1,
                    vx: 0, // velocity x
                    vy: 0, // velocity y
                });
            });
            
            // Simple force-directed layout implementation
            const REPULSION = 1000; // How strongly nodes repel each other
            const ATTRACTION = 0.01; // How strongly edges pull nodes together
            const DAMPING = 0.95; // Velocity damping factor
            const MIN_DISTANCE = 150; // Minimum distance between nodes
            
            // Run iterations to stabilize the layout
            for (let iteration = 0; iteration < 200; iteration++) {
                // Calculate repulsive forces between nodes
                for (let i = 0; i < nodes.length; i++) {
                    const nodeA = nodes[i];
                    const posA = nodePositions.get(nodeA.id);
                    
                    for (let j = i + 1; j < nodes.length; j++) {
                        const nodeB = nodes[j];
                        const posB = nodePositions.get(nodeB.id);
                        
                        // Calculate distance and direction
                        const dx = posB.x - posA.x;
                        const dy = posB.y - posA.y;
                        const distanceSq = dx * dx + dy * dy;
                        const distance = Math.sqrt(distanceSq);
                        
                        // Apply repulsive force (stronger when nodes are closer)
                        if (distance < MIN_DISTANCE) {
                            const force = REPULSION / distanceSq;
                            const forceX = dx / distance * force;
                            const forceY = dy / distance * force;
                            
                            posA.vx -= forceX;
                            posA.vy -= forceY;
                            posB.vx += forceX;
                            posB.vy += forceY;
                        }
                    }
                }
                
                // Apply attractive forces from edges
                edges.forEach(edge => {
                    const sourcePos = nodePositions.get(edge.source);
                    const targetPos = nodePositions.get(edge.target);
                    
                    if (sourcePos && targetPos) {
                        const dx = targetPos.x - sourcePos.x;
                        const dy = targetPos.y - sourcePos.y;
                        const distance = Math.sqrt(dx * dx + dy * dy);
                        
                        // Apply attractive force
                        const force = distance * ATTRACTION;
                        const forceX = dx / distance * force;
                        const forceY = dy / distance * force;
                        
                        sourcePos.vx += forceX;
                        sourcePos.vy += forceY;
                        targetPos.vx -= forceX;
                        targetPos.vy -= forceY;
                    }
                });
                
                // Update positions and apply damping
                nodePositions.forEach((pos) => {
                    pos.vx *= DAMPING;
                    pos.vy *= DAMPING;
                    
                    pos.x += pos.vx;
                    pos.y += pos.vy;
                    
                    // Keep nodes within bounds
                    pos.x = Math.max(100, Math.min(width - 100, pos.x));
                    pos.y = Math.max(100, Math.min(height - 100, pos.y));
                });
            }
            
            return nodePositions;
        }
        
        // Run the simulation to get node positions
        const nodePositions = runSimulation();
        
        // Adjust SVG height to fit all nodes with some padding
        let minY = Infinity, maxY = -Infinity;
        nodePositions.forEach((pos) => {
            minY = Math.min(minY, pos.y - 50);
            maxY = Math.max(maxY, pos.y + 50);
        });
        
        const adjustedHeight = Math.max(height, maxY - minY + 200);
        svg.setAttribute('height', `${adjustedHeight}px`);
        
        // Group nodes by package for color coding
        const packageColors = {
            packages: '#ebf5fb', // default
            gatherer: '#e8f8f5',
            common: '#fef9e7',
            archive: '#f9ebf5',
            publisher: '#eafaf1',
            configurator: '#ebf0fa'
        };
        
        // First render edges so they appear behind nodes
        edges.forEach(edge => {
            const sourcePos = nodePositions.get(edge.source);
            const targetPos = nodePositions.get(edge.target);
            
            if (sourcePos && targetPos) {
                // Create curved path instead of straight line
                const path = document.createElementNS(svgNS, 'path');
                
                // Calculate curve control point (perpendicular to line)
                const dx = targetPos.x - sourcePos.x;
                const dy = targetPos.y - sourcePos.y;
                const midX = (sourcePos.x + targetPos.x) / 2;
                const midY = (sourcePos.y + targetPos.y) / 2;
                const length = Math.sqrt(dx * dx + dy * dy);
                const offsetX = -dy * 30 / length;
                const offsetY = dx * 30 / length;
                
                // Bezier curve path
                const pathData = `M ${sourcePos.x} ${sourcePos.y} 
                                  Q ${midX + offsetX} ${midY + offsetY} 
                                  ${targetPos.x} ${targetPos.y}`;
                                  
                path.setAttribute('d', pathData);
                path.setAttribute('class', `edge edge-${edge.source} edge-${edge.target}`);
                path.setAttribute('marker-end', 'url(#arrowhead)');
                svg.appendChild(path);
            }
        });
        
        // Then render nodes
        nodes.forEach(node => {
            const pos = nodePositions.get(node.id);
            if (!pos) return;
            
            const group = document.createElementNS(svgNS, 'g');
            group.setAttribute('class', 'node');
            group.setAttribute('transform', `translate(${pos.x}, ${pos.y})`);
            svg.appendChild(group);
            
            // Add tooltip for full path
            const title = document.createElementNS(svgNS, 'title');
            title.textContent = node.path;
            group.appendChild(title);
            
            // Determine package for color coding
            let packageType = 'packages';
            if (node.label.includes('gatherer')) packageType = 'gatherer';
            else if (node.label.includes('common')) packageType = 'common';
            else if (node.label.includes('archive')) packageType = 'archive';
            else if (node.label.includes('publisher')) packageType = 'publisher';
            else if (node.label.includes('configurator')) packageType = 'configurator';
            
            // Measure text to create properly sized box
            const tempText = document.createElementNS(svgNS, 'text');
            tempText.textContent = node.filename;
            tempText.style.fontSize = "12px";
            tempText.style.fontFamily = "sans-serif";
            svg.appendChild(tempText);
            const textBBox = tempText.getBBox();
            svg.removeChild(tempText);
            
            const rectWidth = Math.max(textBBox.width + 2 * textPadding, 80);
            const rectHeight = Math.max(textBBox.height + 2 * textPadding, 30);
            
            const rect = document.createElementNS(svgNS, 'rect');
            rect.setAttribute('x', -rectWidth / 2);
            rect.setAttribute('y', -rectHeight / 2);
            rect.setAttribute('width', rectWidth);
            rect.setAttribute('height', rectHeight);
            rect.setAttribute('fill', packageColors[packageType]);
            group.appendChild(rect);
            
            const text = document.createElementNS(svgNS, 'text');
            text.textContent = node.filename;
            group.appendChild(text);
            
            // Add mouse interaction for better usability
            group.addEventListener('mouseover', () => {
                const allConnectedEdges = svg.querySelectorAll(`edge-${node.id}`);
                allConnectedEdges.forEach(edge => {
                    edge.classList.add('edge-highlighted');
                });
                rect.classList.add('node-highlighted');
            });
            
            group.addEventListener('mouseout', () => {
                const allConnectedEdges = svg.querySelectorAll(`.edge-${node.id}`);
                allConnectedEdges.forEach(edge => {
                    edge.classList.remove('edge-highlighted');
                });
                rect.classList.remove('node-highlighted');
            });
            
            group.addEventListener('click', () => {
                alert(`File: ${node.path}`);
            });
        });
        
        // Add legend for package colors
        const legendY = 30;
        const legendX = 20;
        const legendSpacing = 100;
        
        Object.entries(packageColors).forEach(([name, color], index) => {
            const group = document.createElementNS(svgNS, 'g');
            group.setAttribute('class', 'legend-item');
            svg.appendChild(group);
            
            const rect = document.createElementNS(svgNS, 'rect');
            rect.setAttribute('x', legendX + index * legendSpacing);
            rect.setAttribute('y', legendY);
            rect.setAttribute('width', 15);
            rect.setAttribute('height', 15);
            rect.setAttribute('fill', color);
            rect.setAttribute('stroke', '#3498db');
            group.appendChild(rect);
            
            const text = document.createElementNS(svgNS, 'text');
            text.setAttribute('x', legendX + index * legendSpacing + 20);
            text.setAttribute('y', legendY + 12);
            text.setAttribute('class', 'legend-text');
            text.textContent = name;
            group.appendChild(text);
        });
    }
    }
});