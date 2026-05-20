// Click vào edge để chuyển trạng thái traffic: 1 -> 2 -> 5 -> 1.

const TRAFFIC_CYCLE = { 1: 2, 2: 5, 5: 1 };

function trafficLabel(level) {
    if (level === 5) return "tắc";
    if (level === 2) return "chậm";
    return "thông thoáng";
}

function attachTrafficHandlers() {
    APP.edgeLayers.forEach((line) => {
        line.on("click", (e) => {
            L.DomEvent.stopPropagation(e);
            const data = line._edgeData;
            const next = TRAFFIC_CYCLE[data.traffic_level] || 1;

            fetch(`${API_BASE}/api/traffic`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    node1_id: data.node1_id,
                    node2_id: data.node2_id,
                    level: next,
                }),
            })
                .then((r) => r.json())
                .then((res) => {
                    if (res.ok) {
                        data.traffic_level = next;
                        line.setStyle({ color: trafficColor(next) });
                        setStatus(`Cập nhật traffic: ${trafficLabel(next)}`);
                    } else {
                        setStatus("Lỗi cập nhật traffic.");
                    }
                })
                .catch(() => setStatus("Lỗi gọi API traffic."));
        });
    });
}

function applyTrafficChanges(changes) {
    changes.forEach((c) => {
        const key = [c.node1_id, c.node2_id].sort().join("|");
        const line = APP.edgesByKey[key];
        if (!line) return;
        line._edgeData.traffic_level = c.traffic_level;
        line.setStyle({ color: trafficColor(c.traffic_level) });
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

document.getElementById("random-btn").addEventListener("click", () => {
    setStatus("Đang random toàn bộ traffic...");
    callRandomize(null)
        .then(() => setStatus("Đã random toàn bộ traffic."))
        .catch(() => setStatus("Lỗi random traffic."));
});

document.getElementById("reset-traffic-btn").addEventListener("click", () => {
    setStatus("Đang reset traffic...");
    callResetTraffic()
        .then(() => setStatus("Đã reset traffic về thông thoáng."))
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
