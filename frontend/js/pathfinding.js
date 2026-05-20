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
        div.innerHTML = `
            <span class="badge">${p.rank}</span>
            <strong>Đường ${p.rank}</strong><br>
            ${p.distance_km} km &middot; ~${p.estimated_minutes} phút
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
    if (!APP.startCoord || !APP.endCoord) return;
    clearPaths();
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
});
