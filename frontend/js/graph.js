// Tải graph từ backend và vẽ lên bản đồ.

// 7 trạng thái edge: "1"|"2"|"5"|"flooded"|"closed"|"oneway_ab"|"oneway_ba"
// (oneway_ab: chỉ đi từ node1_id → node2_id theo sorted order; oneway_ba: ngược lại)
const EDGE_STYLE = {
    "1":        { color: "#16a34a", weight: 3, dashArray: null, opacity: 0.55 }, // thông
    "2":        { color: "#f59e0b", weight: 3, dashArray: null, opacity: 0.6 },  // chậm
    "5":        { color: "#dc2626", weight: 4, dashArray: null, opacity: 0.7 },  // tắc
    "flooded":  { color: "#1d4ed8", weight: 4, dashArray: null, opacity: 0.75 }, // ngập
    "closed":   { color: "#374151", weight: 3, dashArray: "6,6", opacity: 0.7 }, // cấm
    "oneway_ab":{ color: "#f97316", weight: 4, dashArray: null, opacity: 0.75 }, // 1 chiều →
    "oneway_ba":{ color: "#f97316", weight: 4, dashArray: null, opacity: 0.75 }, // 1 chiều ←
};

function edgeStateOf(data) {
    if (data.road_status === "closed") return "closed";
    if (data.road_status === "flooded") return "flooded";
    if (data.is_oneway === 1) return "oneway_ab";
    if (data.is_oneway === 2) return "oneway_ba";
    return String(data.traffic_level);
}

// Tính bearing (góc CSS rotate) cho mũi tên 1 chiều.
// "▶" mặc định trỏ phải (east = 0°); rotate theo chiều kim đồng hồ.
function bearingDeg(from, to) {
    const dy = -(to.lat - from.lat); // screen y đảo so với lat
    const dx = to.lon - from.lon;
    return Math.atan2(dy, dx) * 180 / Math.PI;
}

function makeArrowMarker(data) {
    const a = APP.nodesById[data.node1_id];
    const b = APP.nodesById[data.node2_id];
    if (!a || !b) return null;
    const mid = [(a.lat + b.lat) / 2, (a.lon + b.lon) / 2];

    // oneway_ab: a → b; oneway_ba: b → a
    const from = data.is_oneway === 1 ? a : b;
    const to = data.is_oneway === 1 ? b : a;
    const angle = bearingDeg(from, to);

    const icon = L.divIcon({
        className: "oneway-arrow",
        html: `<span style="transform: rotate(${angle}deg);">▶</span>`,
        iconSize: [18, 18],
        iconAnchor: [9, 9],
    });
    return L.marker(mid, { icon: icon, interactive: false });
}

function applyEdgeStyle(line) {
    const data = line._edgeData;
    const state = edgeStateOf(data);
    const style = EDGE_STYLE[state] || EDGE_STYLE["1"];
    line.setStyle(style);

    // Quản lý arrow marker (gắn vào line._arrow)
    const needArrow = state === "oneway_ab" || state === "oneway_ba";
    if (line._arrow) {
        APP.map.removeLayer(line._arrow);
        line._arrow = null;
    }
    if (needArrow) {
        const arrow = makeArrowMarker(data);
        if (arrow) {
            arrow.addTo(APP.map);
            line._arrow = arrow;
        }
    }
}

function trafficColor(level) {
    // Giữ lại cho code cũ; trả về màu theo traffic_level đơn thuần.
    if (level === 5) return "#dc2626";
    if (level === 2) return "#f59e0b";
    return "#16a34a";
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
                    { weight: 3, opacity: 0.55 }
                );
                line._edgeData = {
                    node1_id: e.node1_id,
                    node2_id: e.node2_id,
                    traffic_level: e.traffic_level,
                    road_status: e.road_status || "normal",
                    is_oneway: e.is_oneway || 0,
                };
                line.addTo(APP.map);
                applyEdgeStyle(line);
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
