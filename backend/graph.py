"""Thuật toán tìm đường: A* và penalty-based K alternative paths."""
import math
import heapq
import database

SPEED_KMH = 30.0  # tốc độ giả định để ước tính thời gian
FLOOD_PENALTY = 8.0  # hệ số phạt thêm cho cạnh ngập lụt (đi được nhưng rất chậm)


def haversine_km(lat1, lon1, lat2, lon2):
    R = 6371.0
    dlat = math.radians(lat2 - lat1)
    dlon = math.radians(lon2 - lon1)
    a = (
        math.sin(dlat / 2) ** 2
        + math.cos(math.radians(lat1))
        * math.cos(math.radians(lat2))
        * math.sin(dlon / 2) ** 2
    )
    return R * 2 * math.atan2(math.sqrt(a), math.sqrt(1 - a))


def load_graph():
    """Tải toàn bộ graph từ DB vào memory, xử lý cả road_status và is_oneway.

    - road_status='closed': bỏ qua cạnh hoàn toàn (không thêm vào adj).
    - road_status='flooded': nhân thêm FLOOD_PENALTY vào trọng số (đi được nhưng chậm).
    - is_oneway=0: thêm cả 2 chiều (a→b và b→a).
    - is_oneway=1: chỉ thêm chiều a→b (theo node sorted).
    - is_oneway=2: chỉ thêm chiều b→a.

    Trả về:
      nodes: dict[id] -> (lat, lon)
      adj:   dict[id] -> list[(neighbor_id, distance_km, effective_traffic, street_name)]
    """
    nodes = {}
    for n in database.get_all_nodes():
        nodes[n["id"]] = (n["lat"], n["lon"])

    adj = {nid: [] for nid in nodes}
    for e in database.get_all_edges():
        a, b = e["node1_id"], e["node2_id"]
        d = e["distance_km"]
        t = e["traffic_level"]
        s = e.get("street_name")
        status = e.get("road_status") or "normal"
        oneway = e.get("is_oneway") or 0

        if status == "closed":
            continue  # cạnh bị cấm hoàn toàn

        # Bake flood penalty vào trọng số traffic. astar.weight = dist * traffic * penalty
        eff_t = t * FLOOD_PENALTY if status == "flooded" else t

        if oneway == 0:
            adj[a].append((b, d, eff_t, s))
            adj[b].append((a, d, eff_t, s))
        elif oneway == 1:
            adj[a].append((b, d, eff_t, s))
        elif oneway == 2:
            adj[b].append((a, d, eff_t, s))
    return nodes, adj


def find_nearest_node(nodes, lat, lon):
    """Tìm node gần nhất với toạ độ (lat, lon)."""
    best_id = None
    best_dist = float("inf")
    for nid, (nlat, nlon) in nodes.items():
        d = haversine_km(lat, lon, nlat, nlon)
        if d < best_dist:
            best_dist = d
            best_id = nid
    return best_id


def astar(nodes, adj, start, goal, edge_penalties=None):
    """Tìm đường ngắn nhất từ start tới goal bằng A*.

    edge_penalties: dict[edge_key -> multiplier] — nhân thêm vào trọng số cạnh.
        edge_key là tuple sorted((a, b)). Mặc định không phạt.
    Trả về (path: list[node_id], cost: float) hoặc (None, inf).
    """
    edge_penalties = edge_penalties or {}

    if start not in nodes or goal not in nodes:
        return None, float("inf")

    goal_lat, goal_lon = nodes[goal]

    def h(nid):
        lat, lon = nodes[nid]
        return haversine_km(lat, lon, goal_lat, goal_lon)

    g_score = {start: 0.0}
    came_from = {}
    open_heap = [(h(start), 0.0, start)]

    while open_heap:
        f, g, current = heapq.heappop(open_heap)
        if current == goal:
            path = [current]
            while current in came_from:
                current = came_from[current]
                path.append(current)
            path.reverse()
            return path, g

        if g > g_score.get(current, float("inf")):
            continue

        for nbr, dist, traffic, _ in adj.get(current, []):
            edge_key = tuple(sorted((current, nbr)))
            penalty = edge_penalties.get(edge_key, 1.0)
            weight = dist * traffic * penalty
            tentative_g = g + weight
            if tentative_g < g_score.get(nbr, float("inf")):
                g_score[nbr] = tentative_g
                came_from[nbr] = current
                heapq.heappush(open_heap, (tentative_g + h(nbr), tentative_g, nbr))

    return None, float("inf")


def path_cost(adj, path):
    """Tính tổng cost (distance * traffic) của một path."""
    total = 0.0
    for i in range(len(path) - 1):
        a, b = path[i], path[i + 1]
        for nbr, dist, traffic, _ in adj[a]:
            if nbr == b:
                total += dist * traffic
                break
    return total


def path_distance_km(adj, path):
    """Tính tổng quãng đường (không nhân traffic) của một path."""
    total = 0.0
    for i in range(len(path) - 1):
        a, b = path[i], path[i + 1]
        for nbr, dist, traffic, _ in adj[a]:
            if nbr == b:
                total += dist
                break
    return total


def path_streets(adj, path):
    """Tính list tên đường unique theo thứ tự xuất hiện trên path.

    Bỏ qua các cạnh không có tên (street_name = None).
    Gộp các cạnh liên tiếp cùng tên thành 1 entry.
    """
    streets = []
    for i in range(len(path) - 1):
        a, b = path[i], path[i + 1]
        for nbr, _, _, name in adj[a]:
            if nbr == b:
                if name and (not streets or streets[-1] != name):
                    streets.append(name)
                break
    return streets


def penalty_k_paths(nodes, adj, start, goal, K=3, penalty=3.0):
    """Tìm K đường đi khác nhau bằng cách phạt cạnh đã dùng.

    Lần 1: A* bình thường.
    Lần k > 1: nhân trọng số các cạnh thuộc các đường trước với `penalty`
    để A* bị "đẩy" sang đường khác. Khác Yen's: không đảm bảo K đường
    ngắn nhất tuyệt đối, nhưng cho ra các đường khác biệt rõ trên bản đồ.
    """
    paths = []
    penalties = {}  # edge_key -> tổng penalty đã tích luỹ

    for _ in range(K):
        path, _ = astar(nodes, adj, start, goal, edge_penalties=penalties)
        if path is None:
            break
        if path in paths:
            break  # không tìm được đường mới khác
        paths.append(path)

        # Tăng penalty cho mọi cạnh thuộc path vừa tìm
        for i in range(len(path) - 1):
            key = tuple(sorted((path[i], path[i + 1])))
            penalties[key] = penalties.get(key, 1.0) * penalty

    return paths


def estimated_minutes(distance_km):
    return distance_km / SPEED_KMH * 60.0


def find_paths(start_lat, start_lon, end_lat, end_lon, K=3):
    """Endpoint chính: nhận toạ độ start/end, trả về K đường đi."""
    nodes, adj = load_graph()
    if not nodes:
        return []

    start = find_nearest_node(nodes, start_lat, start_lon)
    goal = find_nearest_node(nodes, end_lat, end_lon)
    if start is None or goal is None or start == goal:
        return []

    paths = penalty_k_paths(nodes, adj, start, goal, K=K)
    result = []
    for rank, p in enumerate(paths, start=1):
        dist = path_distance_km(adj, p)
        result.append({
            "rank": rank,
            "nodes": p,
            "distance_km": round(dist, 3),
            "estimated_minutes": round(estimated_minutes(dist), 2),
            "streets": path_streets(adj, p),
        })
    return result
