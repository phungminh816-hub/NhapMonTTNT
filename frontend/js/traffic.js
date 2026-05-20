// Click vào edge để chuyển trạng thái: 1 -> 2 -> 5 -> flooded -> closed
// -> oneway_ab -> oneway_ba -> 1.

const STATE_CYCLE = [
    "1", "2", "5", "flooded", "closed", "oneway_ab", "oneway_ba",
];

const STATE_LABEL = {
    "1": "thông thoáng",
    "2": "chậm",
    "5": "tắc",
    "flooded": "ngập lụt",
    "closed": "cấm đường",
    "oneway_ab": "1 chiều (→)",
    "oneway_ba": "1 chiều (←)",
};

// Quy đổi state -> 3 trường DB (traffic_level, road_status, is_oneway).
function stateToFields(state) {
    if (state === "flooded")    return { traffic_level: 1, road_status: "flooded", is_oneway: 0 };
    if (state === "closed")     return { traffic_level: 1, road_status: "closed",  is_oneway: 0 };
    if (state === "oneway_ab")  return { traffic_level: 1, road_status: "normal",  is_oneway: 1 };
    if (state === "oneway_ba")  return { traffic_level: 1, road_status: "normal",  is_oneway: 2 };
    return { traffic_level: parseInt(state, 10), road_status: "normal", is_oneway: 0 };
}

function nextStateOf(line) {
    const cur = edgeStateOf(line._edgeData);
    const idx = STATE_CYCLE.indexOf(cur);
    return STATE_CYCLE[(idx + 1) % STATE_CYCLE.length];
}

function attachTrafficHandlers() {
    APP.edgeLayers.forEach((line) => {
        line.on("click", (e) => {
            L.DomEvent.stopPropagation(e);
            const next = nextStateOf(line);
            const fields = stateToFields(next);

            fetch(`${API_BASE}/api/traffic`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    node1_id: line._edgeData.node1_id,
                    node2_id: line._edgeData.node2_id,
                    ...fields,
                }),
            })
                .then((r) => r.json())
                .then((res) => {
                    if (res.ok) {
                        Object.assign(line._edgeData, fields);
                        applyEdgeStyle(line);
                        setStatus(`Cập nhật: ${STATE_LABEL[next]}`);
                    } else {
                        setStatus(`Lỗi cập nhật: ${res.error || ""}`);
                    }
                })
                .catch(() => setStatus("Lỗi gọi API traffic."));
        });
    });
}

// Áp dụng changes batch từ randomize/reset.
// Nếu change có đủ field (road_status, is_oneway) → update full state.
// Nếu chỉ có traffic_level → update riêng traffic_level (giữ road_status/is_oneway).
function applyTrafficChanges(changes) {
    changes.forEach((c) => {
        const key = [c.node1_id, c.node2_id].sort().join("|");
        const line = APP.edgesByKey[key];
        if (!line) return;
        if ("traffic_level" in c) line._edgeData.traffic_level = c.traffic_level;
        if ("road_status" in c)   line._edgeData.road_status = c.road_status;
        if ("is_oneway" in c)     line._edgeData.is_oneway = c.is_oneway;
        applyEdgeStyle(line);
    });
}

function callRandomize(count) {
    return fetch(`${API_BASE}/api/traffic/randomize`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ count: count }),
    })
        .then((r) => r.json())
        .then((data) => applyTrafficChanges(data.changes || []));
}

function callResetTraffic() {
    return fetch(`${API_BASE}/api/traffic/reset`, { method: "POST" })
        .then((r) => r.json())
        .then((data) => applyTrafficChanges(data.changes || []));
}

function callDemoSpecial() {
    return fetch(`${API_BASE}/api/traffic/demo`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ n_flooded: 30, n_closed: 15, n_oneway: 35 }),
    })
        .then((r) => r.json())
        .then((data) => applyTrafficChanges(data.changes || []));
}

document.getElementById("random-btn").addEventListener("click", () => {
    setStatus("Đang random toàn bộ traffic...");
    callRandomize(null)
        .then(() => setStatus("Đã random toàn bộ traffic."))
        .catch(() => setStatus("Lỗi random traffic."));
});

document.getElementById("demo-special-btn").addEventListener("click", () => {
    setStatus("Đang demo điều kiện đặc biệt (ngập / cấm / 1 chiều)...");
    callDemoSpecial()
        .then(() => setStatus("Đã set ngẫu nhiên 30 ngập, 15 cấm, 35 một chiều."))
        .catch(() => setStatus("Lỗi gọi API demo."));
});

document.getElementById("reset-traffic-btn").addEventListener("click", () => {
    setStatus("Đang reset trạng thái cạnh...");
    callResetTraffic()
        .then(() => setStatus("Đã đặt lại tất cả: thông thoáng, không cấm, hai chiều."))
        .catch(() => setStatus("Lỗi reset traffic."));
});

// Auto simulation: mỗi 5s random 50 cạnh
let autoSimTimer = null;
const AUTO_SIM_INTERVAL_MS = 5000;
const AUTO_SIM_COUNT = 50;

document.getElementById("auto-sim-btn").addEventListener("click", () => {
    const btn = document.getElementById("auto-sim-btn");
    const statusEl = document.getElementById("auto-sim-status");
    if (autoSimTimer === null) {
        autoSimTimer = setInterval(() => {
            callRandomize(AUTO_SIM_COUNT).catch(() => {});
        }, AUTO_SIM_INTERVAL_MS);
        btn.innerText = "Tắt mô phỏng auto";
        statusEl.innerText = `Đang chạy: mỗi 5s random ${AUTO_SIM_COUNT} cạnh.`;
        setStatus("Mô phỏng auto: BẬT");
    } else {
        clearInterval(autoSimTimer);
        autoSimTimer = null;
        btn.innerText = "Bật mô phỏng auto";
        statusEl.innerText = "";
        setStatus("Mô phỏng auto: TẮT");
    }
});
