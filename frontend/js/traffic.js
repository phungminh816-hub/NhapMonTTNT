// Click vào edge để chuyển trạng thái: 1 -> 2 -> 5 -> flooded -> closed
// -> oneway_ab -> oneway_ba -> 1.

const STATE_CYCLE = [
    "1", "2", "5", "flooded", "closed", "oneway_ab", "oneway_ba",
];

const STATE_LABEL = {
    "1": "Thông thoáng",
    "2": "Chậm",
    "5": "Tắc đường",
    "flooded": "Ngập lụt",
    "closed": "Cấm đường",
    "oneway_ab": "Một chiều (→)",
    "oneway_ba": "Một chiều (←)",
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

function saveSchedules(line, schedules, popup) {
    fetch(`${API_BASE}/api/traffic/schedule/update`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
            node1_id: line._edgeData.node1_id,
            node2_id: line._edgeData.node2_id,
            schedules: schedules
        })
    })
    .then(r => r.json())
    .then(res => {
        if (res.ok) {
            line._edgeData.schedules = schedules;
            applyEdgeStyle(line);
            if (typeof updateLegendStats === "function") updateLegendStats();
            setStatus("Đã cập nhật lịch trình của đoạn đường.");
            // Đóng popup cũ
            APP.map.closePopup();
            
            // Tự động tìm lại đường đi
            if (APP.startCoord && APP.endCoord) {
                document.getElementById("find-btn").click();
            }
        } else {
            setStatus("Lỗi lưu lịch trình: " + (res.error || ""));
        }
    })
    .catch(() => setStatus("Lỗi gọi API lưu lịch trình."));
}

function showEdgePopup(line, latlng) {
    const data = line._edgeData;
    const name = data.street_name || "Đoạn đường không tên";
    const schedules = data.schedules || [];
    const currentState = edgeStateOf(data);

    let schedsHtml = "";
    if (schedules.length > 0) {
        schedsHtml = `
            <div style="margin-top: 8px; border-top: 1px solid #eee; padding-top: 6px;">
                <strong style="font-size: 11px; display: block; margin-bottom: 4px;">Lịch trình đã lên:</strong>
                <ul style="margin: 0; padding-left: 14px; font-size: 11px; max-height: 85px; overflow-y: auto; color: #4b5563;">
                    ${schedules.map((s, idx) => `
                        <li style="margin-bottom: 2px;">
                            ${s.start_hour}h-${s.end_hour}h: ${STATE_LABEL[edgeStateOf(s)]}
                            <a href="#" class="delete-sched-btn" data-idx="${idx}" style="color: #dc2626; margin-left: 4px; text-decoration: none; font-weight: bold;">[Xoá]</a>
                        </li>
                    `).join("")}
                </ul>
            </div>
        `;
    }

    const popupContent = `
        <div class="edge-popup" style="width: 220px; font-family: sans-serif; font-size: 12px; color: #1f2937; line-height: 1.4;">
            <strong style="font-size: 13px; color: #111; display: block; margin-bottom: 2px;">${name}</strong>
            <span style="font-size: 11px; color: #6b7280; display: block; margin-bottom: 8px;">Trạng thái hiện tại: ${STATE_LABEL[currentState]}</span>
            
            <div style="margin-top: 8px;">
                <label style="font-weight: 600; display: block; margin-bottom: 2px; font-size: 11px; color: #374151;">Thay đổi trạng thái nền:</label>
                <select id="popup-state-select" style="width: 100%; padding: 4px; font-size: 11px; border-radius: 4px; border: 1px solid #d1d5db; outline: none; background: #fff; cursor: pointer;">
                    ${STATE_CYCLE.map(s => `<option value="${s}" ${currentState === s ? 'selected' : ''}>${STATE_LABEL[s]}</option>`).join("")}
                </select>
            </div>

            <div style="margin-top: 10px; border-top: 1px solid #eee; padding-top: 8px;">
                <strong style="font-size: 11px; display: block; margin-bottom: 4px; color: #374151;">Nhập thông tin đường bị tắc hoặc nghẽn theo giờ:</strong>
                <div style="display: flex; gap: 4px; margin-bottom: 6px;">
                    <input type="number" id="sched-start" placeholder="Từ (h)" min="0" max="23" style="width: 50px; padding: 4px; font-size: 11px; border: 1px solid #d1d5db; border-radius: 4px; outline: none; text-align: center;">
                    <input type="number" id="sched-end" placeholder="Đến (h)" min="1" max="24" style="width: 50px; padding: 4px; font-size: 11px; border: 1px solid #d1d5db; border-radius: 4px; outline: none; text-align: center;">
                    <select id="sched-state" style="flex: 1; padding: 4px; font-size: 11px; border: 1px solid #d1d5db; border-radius: 4px; outline: none; background: #fff; cursor: pointer;">
                        <option value="5">Tắc đường</option>
                        <option value="closed">Cấm đường</option>
                        <option value="flooded">Ngập lụt</option>
                        <option value="2">Chậm</option>
                    </select>
                </div>
                <button id="popup-add-sched-btn" style="width: 100%; padding: 6px; font-size: 11px; background: #2563eb; color: #fff; border: none; border-radius: 4px; cursor: pointer; font-weight: bold; transition: background 0.2s;">Thêm lịch trình</button>
            </div>
            ${schedsHtml}
        </div>
    `;

    const popup = L.popup()
        .setLatLng(latlng)
        .setContent(popupContent)
        .openOn(APP.map);

    // Bắt sự kiện sau khi popup được render vào DOM
    setTimeout(() => {
        const select = document.getElementById("popup-state-select");
        if (select) {
            select.addEventListener("change", () => {
                const next = select.value;
                const fields = stateToFields(next);
                
                fetch(`${API_BASE}/api/traffic`, {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({
                        node1_id: data.node1_id,
                        node2_id: data.node2_id,
                        ...fields,
                    }),
                })
                .then((r) => r.json())
                .then((res) => {
                    if (res.ok) {
                        Object.assign(data, fields);
                        applyEdgeStyle(line);
                        if (typeof updateLegendStats === "function") updateLegendStats();
                        setStatus(`Đã cập nhật trạng thái nền: ${STATE_LABEL[next]}`);
                        
                        // Tự động tìm lại đường đi
                        if (APP.startCoord && APP.endCoord) {
                            document.getElementById("find-btn").click();
                        }
                        
                        APP.map.closePopup();
                    } else {
                        setStatus(`Lỗi cập nhật: ${res.error || ""}`);
                    }
                })
                .catch(() => setStatus("Lỗi gọi API cập nhật trạng thái nền."));
            });
        }

        const addBtn = document.getElementById("popup-add-sched-btn");
        if (addBtn) {
            addBtn.addEventListener("click", () => {
                const startInput = document.getElementById("sched-start");
                const endInput = document.getElementById("sched-end");
                const start = parseInt(startInput.value, 10);
                const end = parseInt(endInput.value, 10);
                const state = document.getElementById("sched-state").value;
                
                if (isNaN(start) || isNaN(end) || start < 0 || start > 23 || end < 1 || end > 24 || start >= end) {
                    alert("Thời gian không hợp lệ! Vui lòng nhập: Từ (0-23h), Đến (1-24h) và Từ < Đến.");
                    return;
                }
                
                const fields = stateToFields(state);
                const newSchedule = {
                    start_hour: start,
                    end_hour: end,
                    ...fields
                };
                
                const newSchedules = [...schedules, newSchedule];
                saveSchedules(line, newSchedules, popup);
            });
        }

        document.querySelectorAll(".delete-sched-btn").forEach(btn => {
            btn.addEventListener("click", (evt) => {
                evt.preventDefault();
                const idx = parseInt(btn.getAttribute("data-idx"), 10);
                const newSchedules = schedules.filter((_, i) => i !== idx);
                saveSchedules(line, newSchedules, popup);
            });
        });
    }, 50);
}

function attachTrafficHandlers() {
    APP.edgeLayers.forEach((line) => {
        line.on("click", (e) => {
            L.DomEvent.stopPropagation(e);
            showEdgePopup(line, e.latlng);
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

    if (typeof updateLegendStats === "function") {
        updateLegendStats();
    }

    // Tự động tìm lại đường đi nếu đang hiển thị
    if (changes.length > 0 && APP.startCoord && APP.endCoord) {
        const findBtn = document.getElementById("find-btn");
        if (findBtn && !findBtn.disabled) {
            findBtn.click();
        }
    }
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
    setStatus("Đang demo điều kiện đặc biệt (Ngập lụt / Cấm đường / Một chiều)...");
    callDemoSpecial()
        .then(() => setStatus("Đã đặt ngẫu nhiên 30 ngập lụt, 15 cấm đường, 35 một chiều."))
        .catch(() => setStatus("Lỗi gọi API demo."));
});

document.getElementById("reset-traffic-btn").addEventListener("click", () => {
    setStatus("Đang reset trạng thái cạnh...");
    callResetTraffic()
        .then(() => setStatus("Đã đặt lại tất cả: Thông thoáng, không cấm đường, hai chiều."))
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
