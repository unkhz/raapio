// web/main.js
document.addEventListener('DOMContentLoaded', () => {
    const svg = document.getElementById('graph-svg');
    const svgNS = "http://www.w3.org/2000/svg";

    // Placeholder for actual data loading
    fetch('visualization_data.json')
        .then(response => response.json())
        .then(data => {
            renderGraph(data.nodes, data.edges);
        })
        .catch(error => console.error('Error loading graph data:', error));

    function renderGraph(nodes, edges) {
        if (!svg) return;
        svg.innerHTML = ''; // Clear previous graph

        const width = svg.clientWidth;
        const height = svg.clientHeight;
        const nodeRadius = 60; // Approximate radius for layout
        const textPadding = 5; // Padding for text within node rect

        // Simple circular layout
        const numNodes = nodes.length;
        const centerX = width / 2;
        const centerY = height / 2;
        const layoutRadius = Math.min(width, height) / 2 - nodeRadius * 1.5; // Adjusted layoutRadius for better spacing

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

            // Estimate text width to size the rectangle
            const tempText = document.createElementNS(svgNS, 'text');
            tempText.style.fontSize = "10px"; // Ensure consistent font size for measurement
            tempText.style.fontFamily = "sans-serif"; // Ensure consistent font family
            tempText.textContent = node.label;
            // Append temporarily to get bounding box, then remove.
            svg.appendChild(tempText);
            const textBBox = tempText.getBBox();
            svg.removeChild(tempText);

            const rectWidth = Math.max(textBBox.width + 2 * textPadding, 60); // Min width
            const rectHeight = Math.max(textBBox.height + 2 * textPadding, 30); // Min height
            
            const rect = document.createElementNS(svgNS, 'rect');
            rect.setAttribute('x', -rectWidth / 2);
            rect.setAttribute('y', -rectHeight / 2);
            rect.setAttribute('width', String(rectWidth));
            rect.setAttribute('height', String(rectHeight));
            group.appendChild(rect);

            const text = document.createElementNS(svgNS, 'text');
            text.textContent = node.label;
            // text.setAttribute('x', '0'); // Centered by text-anchor in CSS
            // text.setAttribute('y', '0'); // Centered by dominant-baseline in CSS
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
                // Insert lines before nodes so nodes are on top
                svg.insertBefore(line, svg.firstChild);
            }
        });
    }
});
