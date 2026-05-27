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

function updateFindButtonState() {
    const startVal = document.getElementById("start-input") ? document.getElementById("start-input").value.trim() : "";
    const endVal = document.getElementById("end-input") ? document.getElementById("end-input").value.trim() : "";
    const findBtn = document.getElementById("find-btn");
    if (!findBtn) return;

    // Kích hoạt nút nếu cả hai ô đều có nội dung chữ
    if (startVal.length >= 2 && endVal.length >= 2) {
        findBtn.disabled = false;
    } else {
        findBtn.disabled = true;
    }
}

// Bounding box của Quận Hai Bà Trưng (minLon, minLat, maxLon, maxLat)
const HBT_BOUNDS = { minLat: 20.990, maxLat: 21.031, minLon: 105.829, maxLon: 105.882 };

function isInHBT(lat, lon) {
    return lat >= HBT_BOUNDS.minLat && lat <= HBT_BOUNDS.maxLat &&
           lon >= HBT_BOUNDS.minLon && lon <= HBT_BOUNDS.maxLon;
}

function resolveAddress(query) {
    // Bước 1: Tìm trong viewbox bounded - ưu tiên gợi ý trong khu vực
    const url = `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(query)}&format=json&limit=20&viewbox=105.829,21.031,105.882,20.990&bounded=1&countrycodes=vn&addressdetails=1&accept-language=vi`;
    
    return fetch(url, { headers: { "Accept": "application/json" } })
        .then((r) => r.json())
        .then((data) => {
            // Lọc nghiêm ngặt: ưu tiên kết quả có chứa "Hai Bà Trưng" trong địa chỉ
            const filtered = data.filter((item) => {
                const disp = (item.display_name || "").toLowerCase();
                const addr = item.address || {};
                const sub = (addr.suburb || "").toLowerCase();
                const dist = (addr.district || "").toLowerCase();
                const cityDist = (addr.city_district || "").toLowerCase();
                const county = (addr.county || "").toLowerCase();

                const hasName = disp.includes("hai bà trưng") || disp.includes("hai ba trung");
                const hasSub = sub.includes("hai bà trưng") || sub.includes("hai ba trung");
                const hasDist = dist.includes("hai bà trưng") || dist.includes("hai ba trung");
                const hasCityDist = cityDist.includes("hai bà trưng") || cityDist.includes("hai ba trung");
                const hasCounty = county.includes("hai bà trưng") || county.includes("hai ba trung");

                return hasName || hasSub || hasDist || hasCityDist || hasCounty;
            });

            // Tìm thấy trong bộ lọc nghiêm ngặt → trả về ngay
            if (filtered.length > 0) {
                const item = filtered[0];
                return {
                    lat: parseFloat(item.lat),
                    lon: parseFloat(item.lon),
                    display_name: item.display_name
                };
            }

            // Fallback: dùng kết quả đầu tiên trong viewbox (dù không có chữ "Hai Bà Trưng")
            // vì bounded=1 đã đảm bảo kết quả nằm trong bbox của quận
            if (data.length > 0) {
                const item = data[0];
                const lat = parseFloat(item.lat);
                const lon = parseFloat(item.lon);
                // Kiểm tra thêm bằng toạ độ để chắc chắn nằm trong bbox
                if (isInHBT(lat, lon)) {
                    return { lat, lon, display_name: item.display_name };
                }
            }

            return null;
        });
}

function setStartPoint(lat, lon, addressName) {
    if (APP.startMarker) APP.map.removeLayer(APP.startMarker);
    APP.startCoord = { lat, lon };
    APP.startMarker = L.marker([lat, lon], { title: "Điểm đầu" })
        .addTo(APP.map)
        .bindPopup("Điểm đầu");
    const input = document.getElementById("start-input");
    if (input) input.value = addressName;
    updateFindButtonState();
}

function setEndPoint(lat, lon, addressName) {
    if (APP.endMarker) APP.map.removeLayer(APP.endMarker);
    APP.endCoord = { lat, lon };
    APP.endMarker = L.marker([lat, lon], { title: "Điểm cuối" })
        .addTo(APP.map)
        .bindPopup("Điểm cuối");
    const input = document.getElementById("end-input");
    if (input) input.value = addressName;
    updateFindButtonState();
}

// Click bản đồ để chọn điểm đầu / điểm cuối
APP.map.on("click", (e) => {
    const { lat, lng } = e.latlng;
    const coordTxt = `${lat.toFixed(5)}, ${lng.toFixed(5)}`;
    if (!APP.startCoord) {
        setStartPoint(lat, lng, "đang xác định địa chỉ...");
        reverseGeocode(lat, lng).then((addr) => {
            const startInput = document.getElementById("start-input");
            if (startInput && startInput.value === "đang xác định địa chỉ...") {
                startInput.value = addr || coordTxt;
                updateFindButtonState();
            }
        });
    } else if (!APP.endCoord) {
        setEndPoint(lat, lng, "đang xác định địa chỉ...");
        reverseGeocode(lat, lng).then((addr) => {
            const endInput = document.getElementById("end-input");
            if (endInput && endInput.value === "đang xác định địa chỉ...") {
                endInput.value = addr || coordTxt;
                updateFindButtonState();
            }
        });
    }
});

function setupAutocomplete(inputId, suggestionsId, isStart) {
    const input = document.getElementById(inputId);
    const suggestions = document.getElementById(suggestionsId);
    let debounceTimeout = null;

    input.addEventListener("input", () => {
        clearTimeout(debounceTimeout);
        const query = input.value.trim();
        updateFindButtonState();

        if (query.length < 2) {
            suggestions.innerHTML = "";
            suggestions.style.display = "none";
            return;
        }

        debounceTimeout = setTimeout(() => {
            const url = `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(query)}&format=json&limit=20&viewbox=105.829,21.031,105.882,20.990&bounded=1&countrycodes=vn&addressdetails=1&accept-language=vi`;
            
            fetch(url, { headers: { "Accept": "application/json" } })
                .then((r) => r.json())
                .then((data) => {
                    suggestions.innerHTML = "";
                    
                    // Tầng 1: ưu tiên kết quả có chứa "Hai Bà Trưng" trong địa chỉ
                    const strictFiltered = data.filter((item) => {
                        const disp = (item.display_name || "").toLowerCase();
                        const addr = item.address || {};
                        const sub = (addr.suburb || "").toLowerCase();
                        const dist = (addr.district || "").toLowerCase();
                        const cityDist = (addr.city_district || "").toLowerCase();
                        const county = (addr.county || "").toLowerCase();

                        return disp.includes("hai bà trưng") || disp.includes("hai ba trung") ||
                               sub.includes("hai bà trưng") || sub.includes("hai ba trung") ||
                               dist.includes("hai bà trưng") || dist.includes("hai ba trung") ||
                               cityDist.includes("hai bà trưng") || cityDist.includes("hai ba trung") ||
                               county.includes("hai bà trưng") || county.includes("hai ba trung");
                    });

                    // Tầng 2: fallback - bổ sung các kết quả nằm trong bbox nhưng không ghi rõ quận
                    const usedIds = new Set(strictFiltered.map((i) => i.place_id));
                    const fallback = data.filter((item) => {
                        if (usedIds.has(item.place_id)) return false;
                        const lat = parseFloat(item.lat);
                        const lon = parseFloat(item.lon);
                        return isInHBT(lat, lon);
                    });

                    const finalResults = [...strictFiltered, ...fallback].slice(0, 5);

                    if (finalResults.length === 0) {
                        suggestions.style.display = "none";
                        return;
                    }

                    finalResults.forEach((item) => {
                        const div = document.createElement("div");
                        div.className = "suggestion-item";
                        div.innerText = item.display_name;
                        div.title = item.display_name;

                        div.addEventListener("click", () => {
                            const lat = parseFloat(item.lat);
                            const lon = parseFloat(item.lon);
                            
                            if (isStart) {
                                setStartPoint(lat, lon, item.display_name);
                            } else {
                                setEndPoint(lat, lon, item.display_name);
                            }
                            
                            APP.map.flyTo([lat, lon], 16);
                            suggestions.innerHTML = "";
                            suggestions.style.display = "none";
                        });
                        suggestions.appendChild(div);
                    });
                    suggestions.style.display = "block";
                })
                .catch((err) => {
                    console.error("Lỗi tìm kiếm gợi ý:", err);
                });
        }, 400);
    });

    // Bắt sự kiện nhấn Enter để tự nhận diện địa điểm đầu tiên
    input.addEventListener("keydown", (e) => {
        if (e.key === "Enter") {
            e.preventDefault();
            const query = input.value.trim();
            if (query.length < 2) return;

            clearTimeout(debounceTimeout);
            suggestions.innerHTML = "";
            suggestions.style.display = "none";

            setStatus("Đang tự động xác định vị trí...");
            resolveAddress(query).then((res) => {
                if (res) {
                    if (isStart) {
                        setStartPoint(res.lat, res.lon, res.display_name);
                        const nextInput = document.getElementById("end-input");
                        if (nextInput) nextInput.focus();
                    } else {
                        setEndPoint(res.lat, res.lon, res.display_name);
                    }
                    APP.map.flyTo([res.lat, res.lon], 16);
                    setStatus("Đã xác định vị trí.");

                    // Tự tìm đường nếu cả 2 ô đã có nội dung
                    const startInput = document.getElementById("start-input");
                    const endInput = document.getElementById("end-input");
                    if (startInput && startInput.value.trim() && endInput && endInput.value.trim()) {
                        const findBtn = document.getElementById("find-btn");
                        if (findBtn) findBtn.click();
                    }
                } else {
                    setStatus(`Không tìm thấy địa điểm: "${query}"`);
                }
            });
        }
    });

    document.addEventListener("click", (e) => {
        if (!input.contains(e.target) && !suggestions.contains(e.target)) {
            suggestions.innerHTML = "";
            suggestions.style.display = "none";
        }
    });
}

// Khởi tạo autocomplete cho 2 ô nhập liệu
setupAutocomplete("start-input", "start-suggestions", true);
setupAutocomplete("end-input", "end-suggestions", false);

// Xuất các hàm giải quyết địa chỉ cho các file JS khác dùng chung
window.resolveAddress = resolveAddress;
window.setStartPoint = setStartPoint;
window.setEndPoint = setEndPoint;

document.getElementById("reset-btn").addEventListener("click", () => {
    if (APP.startMarker) APP.map.removeLayer(APP.startMarker);
    if (APP.endMarker) APP.map.removeLayer(APP.endMarker);
    APP.startMarker = null;
    APP.endMarker = null;
    APP.startCoord = null;
    APP.endCoord = null;
    
    const startInput = document.getElementById("start-input");
    const endInput = document.getElementById("end-input");
    if (startInput) startInput.value = "";
    if (endInput) endInput.value = "";
    
    const startSugg = document.getElementById("start-suggestions");
    const endSugg = document.getElementById("end-suggestions");
    if (startSugg) { startSugg.innerHTML = ""; startSugg.style.display = "none"; }
    if (endSugg) { endSugg.innerHTML = ""; endSugg.style.display = "none"; }

    updateFindButtonState();
    document.getElementById("results").innerHTML = "Chưa có kết quả.";
    APP.pathLayers.forEach((l) => APP.map.removeLayer(l));
    APP.pathLayers = [];
});
