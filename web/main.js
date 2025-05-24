// web/main.js
document.addEventListener('DOMContentLoaded', () => {
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
        
        const existingNodesAndEdges = svg.querySelectorAll('.node, .edge');
        existingNodesAndEdges.forEach(el => el.remove());

        const width = svg.clientWidth;
        const height = svg.clientHeight;
        const nodeRadius = 60; 
        const textPadding = 5; 

        const numNodes = nodes.length;
        const centerX = width / 2;
        const centerY = height / 2;
        const layoutRadius = Math.min(width, height) / 2 - nodeRadius * 2;

        const nodePositions = new Map();

        nodes.forEach((node, i) => {
            const angle = (i / numNodes) * 2 * Math.PI;
            const x = centerX + layoutRadius * Math.cos(angle);
            const y = centerY + layoutRadius * Math.sin(angle);
            nodePositions.set(node.id, { x, y });

            const group = document.createElementNS(svgNS, 'g');
            group.setAttribute('class', 'node');
            group.setAttribute('transform', `translate(${x}, ${y})`);
            svg.appendChild(group);

            // Add tooltip for full path
            const title = document.createElementNS(svgNS, 'title');
            title.textContent = node.path; // node.path contains the absolute path
            group.appendChild(title);

            const tempText = document.createElementNS(svgNS, 'text');
            tempText.textContent = node.label;
            // Append temporarily to svg for measurement, then remove.
            // Ensure consistent font size for measurement
            tempText.style.fontSize = "10px"; 
            tempText.style.fontFamily = "sans-serif";
            svg.appendChild(tempText); 
            const textBBox = tempText.getBBox();
            svg.removeChild(tempText);

            const rectWidth = Math.max(textBBox.width + 2 * textPadding, 60);
            const rectHeight = Math.max(textBBox.height + 2 * textPadding, 30);
            
            const rect = document.createElementNS(svgNS, 'rect');
            rect.setAttribute('x', -rectWidth / 2);
            rect.setAttribute('y', -rectHeight / 2);
            rect.setAttribute('width', rectWidth);
            rect.setAttribute('height', rectHeight);
            group.appendChild(rect);

            const text = document.createElementNS(svgNS, 'text');
            text.textContent = node.label;
            group.appendChild(text);
        });

        edges.forEach(edge => {
            const sourcePos = nodePositions.get(edge.source);
            const targetPos = nodePositions.get(edge.target);

            if (sourcePos && targetPos) {
                const line = document.createElementNS(svgNS, 'line');
                line.setAttribute('x1', String(sourcePos.x));
                line.setAttribute('y1', String(sourcePos.y));
                line.setAttribute('x2', String(targetPos.x));
                line.setAttribute('y2', String(targetPos.y));
                line.setAttribute('class', 'edge');
                svg.insertBefore(line, svg.querySelector('.node') || null);
            }
        });
    }
});
