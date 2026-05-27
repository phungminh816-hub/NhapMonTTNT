// Gọi API tìm đường và vẽ 3 đường lên bản đồ.

const PATH_COLORS = ["#2563eb", "#dc2626", "#16a34a"];

function clearPaths() {
    APP.pathLayers.forEach((l) => APP.map.removeLayer(l));
    APP.pathLayers = [];
}

function drawPath(pathObj, idx) {
    const latlngs = pathObj.nodes
        .map((nid) => APP.nodesById[nid])
        .filter(Boolean)
        .map((n) => [n.lat, n.lon]);
    if (latlngs.length < 2) return null;

    const line = L.polyline(latlngs, {
        color: PATH_COLORS[idx % PATH_COLORS.length],
        weight: 6,
        opacity: 0.85,
    }).addTo(APP.map);
    return line;
}

function renderResults(paths) {
    const container = document.getElementById("results");
    if (!paths.length) {
        container.innerHTML = "Không tìm thấy đường đi.";
        return;
    }

    container.innerHTML = "";
    paths.forEach((p, idx) => {
        const div = document.createElement("div");
        div.className = `result-item path-${idx}`;
        const streets = p.streets || [];
        const MAX_STREETS = 4;
        let streetsHtml = "";
        if (streets.length) {
            const shown = streets.slice(0, MAX_STREETS).join(" → ");
            const more = streets.length > MAX_STREETS
                ? ` … (+${streets.length - MAX_STREETS} tuyến)`
                : "";
            streetsHtml = `<div class="streets">qua: ${shown}${more}</div>`;
        }
        div.innerHTML = `
            <span class="badge">${p.rank}</span>
            <strong>Đường ${p.rank}</strong><br>
            ${p.distance_km} km &middot; ~${p.estimated_minutes} phút
            ${streetsHtml}
        `;
        div.addEventListener("click", () => {
            document.querySelectorAll(".result-item").forEach((el) =>
                el.classList.remove("active")
            );
            div.classList.add("active");
            APP.pathLayers.forEach((l, i) => {
                l.setStyle({ opacity: i === idx ? 1.0 : 0.3, weight: i === idx ? 7 : 4 });
                if (i === idx) l.bringToFront();
            });
        });
        container.appendChild(div);
    });
}

document.getElementById("find-btn").addEventListener("click", () => {
    const startVal = document.getElementById("start-input") ? document.getElementById("start-input").value.trim() : "";
    const endVal = document.getElementById("end-input") ? document.getElementById("end-input").value.trim() : "";
    if (!startVal || !endVal) return;

    clearPaths();
    setStatus("Đang xác định vị trí...");

    const runPathfinding = () => {
        setStatus("Đang tìm đường...");
        fetch(`${API_BASE}/api/find-path`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ start: APP.startCoord, end: APP.endCoord }),
        })
            .then((r) => r.json())
            .then((data) => {
                const paths = data.paths || [];
                paths.forEach((p, idx) => {
                    const line = drawPath(p, idx);
                    if (line) APP.pathLayers.push(line);
                });
                renderResults(paths);
                setStatus(`Tìm xong: ${paths.length} đường.`);
            })
            .catch((err) => {
                console.error(err);
                setStatus("Lỗi tìm đường.");
            });
    };

    const promises = [];

    // Nếu người dùng gõ chữ nhưng chưa chọn gợi ý (chưa có tọa độ thực tế), tự động tìm kiếm kết quả đầu tiên
    if (!APP.startCoord && startVal) {
        promises.push(
            window.resolveAddress(startVal).then((res) => {
                if (res) {
                    window.setStartPoint(res.lat, res.lon, res.display_name);
                    APP.map.flyTo([res.lat, res.lon], 15);
                } else {
                    throw new Error(`Không tìm thấy điểm đi: "${startVal}" ở Hai Bà Trưng`);
                }
            })
        );
    }

    if (!APP.endCoord && endVal) {
        promises.push(
            window.resolveAddress(endVal).then((res) => {
                if (res) {
                    window.setEndPoint(res.lat, res.lon, res.display_name);
                    APP.map.flyTo([res.lat, res.lon], 15);
                } else {
                    throw new Error(`Không tìm thấy điểm đến: "${endVal}" ở Hai Bà Trưng`);
                }
            })
        );
    }

    if (promises.length > 0) {
        Promise.all(promises)
            .then(() => {
                runPathfinding();
            })
            .catch((err) => {
                setStatus(err.message);
                console.error(err);
            });
    } else {
        runPathfinding();
    }
});
