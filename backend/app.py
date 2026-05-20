"""Flask app: định nghĩa các REST endpoint cho frontend."""
from flask import Flask, jsonify, request
from flask_cors import CORS

import database
import graph

app = Flask(__name__)
CORS(app)


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
    body = request.get_json(silent=True) or {}
    n1 = body.get("node1_id")
    n2 = body.get("node2_id")
    level = body.get("level")
    if not n1 or not n2 or level not in (1, 2, 5):
        return jsonify({"error": "node1_id, node2_id, level (1|2|5) bắt buộc"}), 400

    database.update_traffic(n1, n2, int(level))
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


if __name__ == "__main__":
    app.run(host="127.0.0.1", port=5000, debug=True)
