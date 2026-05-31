"""Flask app: định nghĩa các REST endpoint cho frontend và phục vụ file tĩnh."""
import os
import sys

# Đảm bảo thư mục backend nằm trong sys.path để Vercel import được các module local
sys.path.append(os.path.dirname(os.path.abspath(__file__)))

from flask import Flask, jsonify, request, send_from_directory
from flask_cors import CORS

import database
import graph

# Chỉ định thư mục frontend làm static_folder
frontend_dir = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "frontend"))
app = Flask(__name__, static_folder=frontend_dir, static_url_path="")
CORS(app)

# Nạp dữ liệu đồ thị khi khởi chạy ứng dụng
database.init_schema()


@app.route("/")
def index():
    return send_from_directory(frontend_dir, "index.html")


@app.route("/map")
@app.route("/map/")
def map_page():
    return send_from_directory(frontend_dir, "map.html")

@app.get("/api/graph")
def api_graph():
    return jsonify({
        "nodes": database.get_all_nodes(),
        "edges": database.get_all_edges(),
    })


@app.post("/api/find-path")
def api_find_path():
    body = request.get_json(silent=True) or {}
    start = body.get("start") or {}
    end = body.get("end") or {}
    departure_hour = body.get("departure_hour")
    
    try:
        s_lat = float(start["lat"])
        s_lon = float(start["lon"])
        e_lat = float(end["lat"])
        e_lon = float(end["lon"])
        if departure_hour is not None:
            departure_hour = int(departure_hour)
    except (KeyError, TypeError, ValueError):
        return jsonify({"error": "Thiếu hoặc sai định dạng start/end/departure_hour"}), 400

    paths = graph.find_paths(s_lat, s_lon, e_lat, e_lon, K=3, departure_hour=departure_hour)
    return jsonify({"paths": paths})


@app.post("/api/traffic")
def api_traffic():
    """Cập nhật state của 1 cạnh.

    Body: {node1_id, node2_id, traffic_level (1|2|5),
           road_status ('normal'|'flooded'|'closed'),
           is_oneway (0|1|2)}

    Tương thích ngược: nếu chỉ truyền `level` (tên cũ), coi như chỉ đổi traffic_level
    và mặc định road_status='normal', is_oneway=0.
    """
    body = request.get_json(silent=True) or {}
    n1 = body.get("node1_id")
    n2 = body.get("node2_id")
    level = body.get("traffic_level", body.get("level"))
    road_status = body.get("road_status", "normal")
    is_oneway = body.get("is_oneway", 0)

    if not n1 or not n2:
        return jsonify({"error": "node1_id, node2_id bắt buộc"}), 400
    try:
        level = int(level)
        is_oneway = int(is_oneway)
    except (TypeError, ValueError):
        return jsonify({"error": "traffic_level và is_oneway phải là số nguyên"}), 400
    if level not in (1, 2, 5):
        return jsonify({"error": "traffic_level phải là 1, 2 hoặc 5"}), 400
    if road_status not in ("normal", "flooded", "closed"):
        return jsonify({"error": "road_status không hợp lệ"}), 400
    if is_oneway not in (0, 1, 2):
        return jsonify({"error": "is_oneway phải là 0, 1 hoặc 2"}), 400

    database.update_edge_state(n1, n2, level, road_status, is_oneway)
    return jsonify({"ok": True})


@app.post("/api/traffic/randomize")
def api_traffic_randomize():
    body = request.get_json(silent=True) or {}
    count = body.get("count")
    if count is not None:
        try:
            count = int(count)
            if count < 1:
                count = None
        except (TypeError, ValueError):
            count = None
    changes = database.randomize_traffic(count=count)
    return jsonify({"changes": changes})


@app.post("/api/traffic/reset")
def api_traffic_reset():
    changes = database.reset_traffic()
    return jsonify({"changes": changes})


@app.post("/api/traffic/demo")
def api_traffic_demo():
    """Random hoá một số cạnh sang flooded/closed/oneway để demo nhanh."""
    body = request.get_json(silent=True) or {}
    n_flooded = int(body.get("n_flooded", 30))
    n_closed = int(body.get("n_closed", 15))
    n_oneway = int(body.get("n_oneway", 35))
    changes = database.demo_special_states(n_flooded, n_closed, n_oneway)
    return jsonify({"changes": changes})


@app.post("/api/traffic/schedule/update")
def api_traffic_schedule_update():
    """Cập nhật danh sách lịch trình tắc đường/cấm đường theo giờ của một cạnh."""
    body = request.get_json(silent=True) or {}
    n1 = body.get("node1_id")
    n2 = body.get("node2_id")
    schedules = body.get("schedules")
    if not n1 or not n2 or schedules is None:
        return jsonify({"error": "node1_id, node2_id và schedules là bắt buộc"}), 400

    success = database.update_edge_schedules(n1, n2, schedules)
    if success:
        return jsonify({"ok": True})
    return jsonify({"error": "Không tìm thấy cạnh cần cập nhật"}), 404


if __name__ == "__main__":
    app.run(host="127.0.0.1", port=5000, debug=True)
