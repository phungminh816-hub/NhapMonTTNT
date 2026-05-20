// Tải graph từ backend và vẽ lên bản đồ.

function trafficColor(level) {
    if (level === 5) return "#dc2626"; // tắc
    if (level === 2) return "#f59e0b"; // chậm
    return "#16a34a";                  // thông thoáng
}

function loadGraph() {
    setStatus("Đang tải graph từ backend...");
    fetch(`${API_BASE}/api/graph`)
        .then((r) => r.json())
        .then((data) => {
            APP.graphData = data;
            APP.nodesById = {};
            data.nodes.forEach((n) => {
                APP.nodesById[n.id] = { lat: n.lat, lon: n.lon };
            });

            // Vẽ edges
            data.edges.forEach((e) => {
                const a = APP.nodesById[e.node1_id];
                const b = APP.nodesById[e.node2_id];
                if (!a || !b) return;
                const line = L.polyline(
                    [[a.lat, a.lon], [b.lat, b.lon]],
                    {
                        color: trafficColor(e.traffic_level),
                        weight: 3,
                        opacity: 0.55,
                    }
                );
                line._edgeData = {
                    node1_id: e.node1_id,
                    node2_id: e.node2_id,
                    traffic_level: e.traffic_level,
                };
                line.addTo(APP.map);
                APP.edgeLayers.push(line);
                const key = [e.node1_id, e.node2_id].sort().join("|");
                APP.edgesByKey[key] = line;
            });

            setStatus(
                `Đã tải ${data.nodes.length} nodes, ${data.edges.length} edges.`
            );

            // Gắn handler click cho edges (định nghĩa trong traffic.js)
            if (typeof attachTrafficHandlers === "function") {
                attachTrafficHandlers();
            }
        })
        .catch((err) => {
            console.error(err);
            setStatus("Lỗi tải graph. Backend có đang chạy không?");
        });
}

loadGraph();
