"""Flask app: định nghĩa các REST endpoint cho frontend."""
from flask import Flask, jsonify, request
from flask_cors import CORS

import database
import graph

app = Flask(__name__)
CORS(app)

# Auto-migrate schema (thêm road_status, is_oneway nếu DB cũ chưa có)
database.init_schema()


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
    try:
        s_lat = float(start["lat"])
        s_lon = float(start["lon"])
        e_lat = float(end["lat"])
        e_lon = float(end["lon"])
    except (KeyError, TypeError, ValueError):
        return jsonify({"error": "Thiếu hoặc sai định dạng start/end"}), 400

    paths = graph.find_paths(s_lat, s_lon, e_lat, e_lon, K=3)
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


if __name__ == "__main__":
    app.run(host="127.0.0.1", port=5000, debug=True)
