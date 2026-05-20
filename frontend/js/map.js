// Khởi tạo bản đồ Leaflet, quản lý state toàn cục.

const API_BASE = "http://127.0.0.1:5000";

const APP = {
    map: null,
    edgeLayers: [],      // các polyline của graph (edges)
    edgesByKey: {},      // "a|b" (sorted) -> polyline (để cập nhật màu nhanh)
    nodeMarkers: [],     // chấm tròn của các node
    pathLayers: [],      // các polyline của 3 đường tìm được
    startMarker: null,
    endMarker: null,
    startCoord: null,    // {lat, lon}
    endCoord: null,
    graphData: null,     // {nodes, edges}
    nodesById: {},       // id -> {lat, lon}
};

APP.map = L.map("map").setView([21.0125, 105.8546], 14);
L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
    attribution: "&copy; OpenStreetMap",
}).addTo(APP.map);

function setStatus(msg) {
    document.getElementById("status").innerText = msg;
}

// Reverse geocode toạ độ -> địa chỉ ngắn gọn qua Nominatim (OSM).
// Có rate limit 1 req/s, đủ thoải mái với user click thủ công.
function reverseGeocode(lat, lon) {
    const url =
        "https://nominatim.openstreetmap.org/reverse" +
        `?lat=${lat}&lon=${lon}&format=json&zoom=18&addressdetails=1` +
        "&accept-language=vi";
    return fetch(url, { headers: { "Accept": "application/json" } })
        .then((r) => r.json())
        .then((data) => {
            const a = data.address || {};
            const road = a.road || a.pedestrian || a.residential || a.path;
            const suburb = a.suburb || a.quarter || a.neighbourhood;
            if (road && suburb) return `${road}, ${suburb}`;
            if (road) return road;
            if (data.display_name) return data.display_name.split(",").slice(0, 2).join(",");
            return null;
        })
        .catch(() => null);
}

function fillPointInfo(elemId, lat, lon) {
    const el = document.getElementById(elemId);
    const coordTxt = `${lat.toFixed(5)}, ${lon.toFixed(5)}`;
    el.innerText = "đang xác định địa chỉ...";
    reverseGeocode(lat, lon).then((addr) => {
        el.innerText = addr || coordTxt;
    });
}

// Click bản đồ để chọn điểm đầu / điểm cuối
APP.map.on("click", (e) => {
    const { lat, lng } = e.latlng;
    if (!APP.startCoord) {
        APP.startCoord = { lat, lon: lng };
        APP.startMarker = L.marker([lat, lng], { title: "Điểm đầu" })
            .addTo(APP.map)
            .bindPopup("Điểm đầu");
        fillPointInfo("start-info", lat, lng);
    } else if (!APP.endCoord) {
        APP.endCoord = { lat, lon: lng };
        APP.endMarker = L.marker([lat, lng], { title: "Điểm cuối" })
            .addTo(APP.map)
            .bindPopup("Điểm cuối");
        fillPointInfo("end-info", lat, lng);
        document.getElementById("find-btn").disabled = false;
    }
});

document.getElementById("reset-btn").addEventListener("click", () => {
    if (APP.startMarker) APP.map.removeLayer(APP.startMarker);
    if (APP.endMarker) APP.map.removeLayer(APP.endMarker);
    APP.startMarker = null;
    APP.endMarker = null;
    APP.startCoord = null;
    APP.endCoord = null;
    document.getElementById("start-info").innerText = "chưa chọn";
    document.getElementById("end-info").innerText = "chưa chọn";
    document.getElementById("find-btn").disabled = true;
    document.getElementById("results").innerHTML = "Chưa có kết quả.";
    APP.pathLayers.forEach((l) => APP.map.removeLayer(l));
    APP.pathLayers = [];
});
