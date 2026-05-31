"""Đọc/ghi đồ thị in-memory từ file JSON tĩnh graph_data.json."""
import json
import os

GRAPH_DATA_PATH = os.path.join(os.path.dirname(__file__), "graph_data.json")

# Biến lưu trữ in-memory
_nodes = []
_edges = []
_edges_by_key = {}  # tuple (a, b) sorted -> edge dict


def _load_if_needed():
    global _nodes, _edges, _edges_by_key
    if not _nodes:
        if os.path.exists(GRAPH_DATA_PATH):
            try:
                with open(GRAPH_DATA_PATH, "r", encoding="utf-8") as f:
                    data = json.load(f)
                    _nodes = data.get("nodes", [])
                    _edges = data.get("edges", [])
                    _edges_by_key = {}
                    for e in _edges:
                        a, b = sorted([e["node1_id"], e["node2_id"]])
                        _edges_by_key[(a, b)] = e
            except Exception as ex:
                print(f"Error loading graph_data.json: {ex}")
        else:
            print(f"Warning: {GRAPH_DATA_PATH} not found.")


def _save_to_file():
    """Ghi lại thay đổi vào file JSON nếu có thể (chỉ cho local development).

    Khi host trên Vercel, hệ thống tập tin là Read-only nên thao tác ghi sẽ
    bị bỏ qua mà không làm crash ứng dụng.
    """
    try:
        graph_data = {
            "nodes": _nodes,
            "edges": _edges
        }
        with open(GRAPH_DATA_PATH, "w", encoding="utf-8") as f:
            json.dump(graph_data, f, ensure_ascii=False, indent=2)
    except Exception as ex:
        print(f"Skipping file write (read-only filesystem): {ex}")


def init_schema():
    _load_if_needed()


def get_all_nodes():
    _load_if_needed()
    return _nodes


def get_all_edges():
    _load_if_needed()
    return _edges


def update_edge_state(node1_id, node2_id, traffic_level, road_status, is_oneway):
    _load_if_needed()
    a, b = sorted([node1_id, node2_id])
    edge = _edges_by_key.get((a, b))
    if edge:
        edge["traffic_level"] = traffic_level
        edge["road_status"] = road_status
        edge["is_oneway"] = is_oneway
        _save_to_file()


def update_traffic(node1_id, node2_id, level):
    _load_if_needed()
    a, b = sorted([node1_id, node2_id])
    edge = _edges_by_key.get((a, b))
    if edge:
        edge["traffic_level"] = level
        _save_to_file()


def _random_level():
    import random
    r = random.random()
    if r < 0.70:
        return 1
    if r < 0.90:
        return 2
    return 5


def randomize_traffic(count=None):
    _load_if_needed()
    import random
    edges_to_update = list(_edges_by_key.values())
    if count is not None and count < len(edges_to_update):
        edges_to_update = random.sample(edges_to_update, count)

    changes = []
    for edge in edges_to_update:
        lvl = _random_level()
        edge["traffic_level"] = lvl
        changes.append({
            "node1_id": edge["node1_id"],
            "node2_id": edge["node2_id"],
            "traffic_level": lvl
        })
    _save_to_file()
    return changes


def demo_special_states(n_flooded=30, n_closed=15, n_oneway=35):
    _load_if_needed()
    import random
    all_edges = list(_edges_by_key.values())
    total_need = n_flooded + n_closed + n_oneway
    if total_need > len(all_edges):
        total_need = len(all_edges)
        n_flooded = total_need // 3
        n_closed = total_need // 3
        n_oneway = total_need - n_flooded - n_closed

    # Đưa tất cả các cạnh về trạng thái bình thường trước
    for edge in all_edges:
        edge["road_status"] = "normal"
        edge["is_oneway"] = 0

    picked = random.sample(all_edges, total_need)
    flooded = picked[:n_flooded]
    closed = picked[n_flooded:n_flooded + n_closed]
    oneway = picked[n_flooded + n_closed:]

    changes = []
    for edge in flooded:
        edge["road_status"] = "flooded"
        edge["is_oneway"] = 0
        changes.append({
            "node1_id": edge["node1_id"],
            "node2_id": edge["node2_id"],
            "road_status": "flooded",
            "is_oneway": 0
        })

    for edge in closed:
        edge["road_status"] = "closed"
        edge["is_oneway"] = 0
        changes.append({
            "node1_id": edge["node1_id"],
            "node2_id": edge["node2_id"],
            "road_status": "closed",
            "is_oneway": 0
        })

    for edge in oneway:
        direction = random.choice([1, 2])
        edge["road_status"] = "normal"
        edge["is_oneway"] = direction
        changes.append({
            "node1_id": edge["node1_id"],
            "node2_id": edge["node2_id"],
            "road_status": "normal",
            "is_oneway": direction
        })

    _save_to_file()
    return changes


def reset_traffic():
    _load_if_needed()
    changes = []
    for edge in _edges:
        if edge["traffic_level"] != 1 or edge["road_status"] != "normal" or edge["is_oneway"] != 0:
            edge["traffic_level"] = 1
            edge["road_status"] = "normal"
            edge["is_oneway"] = 0
            changes.append({
                "node1_id": edge["node1_id"],
                "node2_id": edge["node2_id"],
                "traffic_level": 1,
                "road_status": "normal",
                "is_oneway": 0
            })
    _save_to_file()
    return changes


def update_edge_schedules(node1_id, node2_id, schedules):
    """Cập nhật danh sách lịch trình tắc đường theo giờ cho một cạnh cụ thể."""
    _load_if_needed()
    a, b = sorted([node1_id, node2_id])
    edge = _edges_by_key.get((a, b))
    if edge:
        edge["schedules"] = schedules
        _save_to_file()
        return True
    return False
