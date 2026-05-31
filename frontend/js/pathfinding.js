// Gọi API tìm đường và vẽ 3 đường lên bản đồ.

const PATH_COLORS = ["#2563eb", "#dc2626", "#16a34a"];

APP.departureHour = 12;

// Lắng nghe sự kiện trượt chọn giờ khởi hành
document.addEventListener("DOMContentLoaded", () => {
    const slider = document.getElementById("departure-hour-slider");
    const valDisplay = document.getElementById("departure-hour-val");
    if (slider && valDisplay) {
        slider.value = APP.departureHour;
        valDisplay.innerText = APP.departureHour;

        slider.addEventListener("input", () => {
            APP.departureHour = parseInt(slider.value, 10);
            valDisplay.innerText = APP.departureHour;
        });

        // Tự động tìm lại đường đi khi thay đổi giờ khởi hành
        slider.addEventListener("change", () => {
            if (APP.startCoord && APP.endCoord) {
                document.getElementById("find-btn").click();
            }
        });
    }
});

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

    const pathColor = PATH_COLORS[idx % PATH_COLORS.length];

    // 1. Vẽ đường nối nét đứt từ Điểm đi (startCoord) đến node đầu tiên của đường đi nếu khoảng cách > 0
    if (APP.startCoord) {
        const startLatLng = [APP.startCoord.lat, APP.startCoord.lon];
        const distDiff = Math.abs(APP.startCoord.lat - latlngs[0][0]) > 0.00001 || 
                         Math.abs(APP.startCoord.lon - latlngs[0][1]) > 0.00001;
        if (distDiff) {
            const startConnector = L.polyline([startLatLng, latlngs[0]], {
                color: pathColor,
                weight: 4,
                opacity: 0.75,
                dashArray: "6, 6"
            }).addTo(APP.map);
            APP.pathLayers.push(startConnector);
        }
    }

    // 2. Vẽ đường nối nét đứt từ node cuối cùng đến Điểm đến (endCoord) nếu khoảng cách > 0
    if (APP.endCoord) {
        const endLatLng = [APP.endCoord.lat, APP.endCoord.lon];
        const distDiff = Math.abs(APP.endCoord.lat - latlngs[latlngs.length - 1][0]) > 0.00001 || 
                         Math.abs(APP.endCoord.lon - latlngs[latlngs.length - 1][1]) > 0.00001;
        if (distDiff) {
            const endConnector = L.polyline([latlngs[latlngs.length - 1], endLatLng], {
                color: pathColor,
                weight: 4,
                opacity: 0.75,
                dashArray: "6, 6"
            }).addTo(APP.map);
            APP.pathLayers.push(endConnector);
        }
    }

    // 3. Khởi tạo polyline rỗng cho đường chính
    const line = L.polyline([], {
        color: pathColor,
        weight: 6,
        opacity: 0.85,
    }).addTo(APP.map);

    // Hiệu ứng vẽ động từ từ từ điểm đi đến điểm đến
    let i = 0;
    const delay = Math.max(4, Math.min(25, 400 / latlngs.length)); // Tự động căn chỉnh độ trễ dựa trên độ dài đường
    const animateDraw = () => {
        if (i < latlngs.length) {
            line.addLatLng(latlngs[i]);
            i++;
            setTimeout(animateDraw, delay);
        }
    };
    animateDraw();

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
            body: JSON.stringify({ 
                start: APP.startCoord, 
                end: APP.endCoord,
                departure_hour: APP.departureHour
            }),
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
