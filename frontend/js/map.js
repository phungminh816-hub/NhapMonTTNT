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

// Click bản đồ để chọn điểm đầu / điểm cuối
APP.map.on("click", (e) => {
    const { lat, lng } = e.latlng;
    if (!APP.startCoord) {
        APP.startCoord = { lat, lon: lng };
        APP.startMarker = L.marker([lat, lng], { title: "Điểm đầu" })
            .addTo(APP.map)
            .bindPopup("Điểm đầu");
        document.getElementById("start-info").innerText =
            `${lat.toFixed(5)}, ${lng.toFixed(5)}`;
    } else if (!APP.endCoord) {
        APP.endCoord = { lat, lon: lng };
        APP.endMarker = L.marker([lat, lng], { title: "Điểm cuối" })
            .addTo(APP.map)
            .bindPopup("Điểm cuối");
        document.getElementById("end-info").innerText =
            `${lat.toFixed(5)}, ${lng.toFixed(5)}`;
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
