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


def load_graph(departure_hour=None):
    """Tải toàn bộ graph từ DB vào memory, xử lý cả road_status và is_oneway.

    - road_status='closed': bỏ qua cạnh hoàn toàn (không thêm vào adj).
    - road_status='flooded': nhân thêm FLOOD_PENALTY vào trọng số (đi được nhưng chậm).
    - is_oneway=0: thêm cả 2 chiều (a→b và b→a).
    - is_oneway=1: chỉ thêm chiều a→b (theo node sorted).
    - is_oneway=2: chỉ thêm chiều b→a.

    Trả về:
      nodes: dict[id] -> (lat, lon)
      adj:   dict[id] -> list[(neighbor_id, distance_km, effective_traffic, street_name)]
      adj_rev: dict[id] -> list[(neighbor_id, distance_km, effective_traffic, street_name)]
    """
    nodes = {}
    for n in database.get_all_nodes():
        nodes[n["id"]] = (n["lat"], n["lon"])

    adj = {nid: [] for nid in nodes}
    adj_rev = {nid: [] for nid in nodes}
    for e in database.get_all_edges():
        a, b = e["node1_id"], e["node2_id"]
        d = e["distance_km"]
        t = e["traffic_level"]
        s = e.get("street_name")
        status = e.get("road_status") or "normal"
        oneway = e.get("is_oneway") or 0

        # Áp dụng lịch trình tắc đường theo giờ nếu được cấu hình và có departure_hour
        schedules = e.get("schedules") or []
        if departure_hour is not None:
            for sched in schedules:
                if sched["start_hour"] <= departure_hour < sched["end_hour"]:
                    t = sched.get("traffic_level", t)
                    status = sched.get("road_status", status)
                    oneway = sched.get("is_oneway", oneway)
                    break

        if status == "closed":
            continue  # cạnh bị cấm hoàn toàn

        # Bake flood penalty vào trọng số traffic. astar.weight = dist * traffic * penalty
        eff_t = t * FLOOD_PENALTY if status == "flooded" else t

        if oneway == 0:
            adj[a].append((b, d, eff_t, s))
            adj[b].append((a, d, eff_t, s))
            adj_rev[b].append((a, d, eff_t, s))
            adj_rev[a].append((b, d, eff_t, s))
        elif oneway == 1:
            adj[a].append((b, d, eff_t, s))
            adj_rev[b].append((a, d, eff_t, s))
        elif oneway == 2:
            adj[b].append((a, d, eff_t, s))
            adj_rev[a].append((b, d, eff_t, s))
    return nodes, adj, adj_rev


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


def bidirectional_astar(nodes, adj, adj_rev, start, goal, edge_penalties=None):
    """Tìm đường ngắn nhất từ start tới goal bằng thuật toán A* hai chiều (Bidirectional A*).

    edge_penalties: dict[edge_key -> multiplier] — nhân thêm vào trọng số cạnh.
        edge_key là tuple sorted((a, b)). Mặc định không phạt.
    Trả về (path: list[node_id], cost: float) hoặc (None, inf).
    """
    edge_penalties = edge_penalties or {}

    if start not in nodes or goal not in nodes:
        return None, float("inf")
    if start == goal:
        return [start], 0.0

    goal_lat, goal_lon = nodes[goal]
    start_lat, start_lon = nodes[start]

    def h_f(nid):
        lat, lon = nodes[nid]
        return haversine_km(lat, lon, goal_lat, goal_lon)

    def h_b(nid):
        lat, lon = nodes[nid]
        return haversine_km(start_lat, start_lon, lat, lon)

    # Khởi tạo hướng đi xuôi (Forward) từ start
    g_f = {start: 0.0}
    came_from_f = {}
    open_f = [(h_f(start), 0.0, start)]
    visited_f = set()

    # Khởi tạo hướng đi ngược (Backward) từ goal
    g_b = {goal: 0.0}
    came_from_b = {}
    open_b = [(h_b(goal), 0.0, goal)]
    visited_b = set()

    mu = float("inf")
    best_intersect = None
    dist_start_goal = haversine_km(start_lat, start_lon, goal_lat, goal_lon)

    while open_f and open_b:
        # Điều kiện dừng tối ưu của Bidirectional A*
        if open_f[0][0] + open_b[0][0] >= mu + dist_start_goal:
            break

        # Chọn hướng mở rộng có priority f-score nhỏ hơn để cân bằng
        if open_f[0][0] <= open_b[0][0]:
            _, g, curr = heapq.heappop(open_f)
            if curr in visited_f:
                continue
            visited_f.add(curr)

            # Nếu node đã được duyệt bởi phía ngược, kiểm tra tổng cost
            if curr in visited_b:
                total_cost = g + g_b[curr]
                if total_cost < mu:
                    mu = total_cost
                    best_intersect = curr

            for nbr, dist, traffic, _ in adj.get(curr, []):
                edge_key = tuple(sorted((curr, nbr)))
                penalty = edge_penalties.get(edge_key, 1.0)
                weight = dist * traffic * penalty
                tentative_g = g + weight
                if tentative_g < g_f.get(nbr, float("inf")):
                    g_f[nbr] = tentative_g
                    came_from_f[nbr] = curr
                    heapq.heappush(open_f, (tentative_g + h_f(nbr), tentative_g, nbr))
                    
                    if nbr in g_b:
                        total_cost = tentative_g + g_b[nbr]
                        if total_cost < mu:
                            mu = total_cost
                            best_intersect = nbr
        else:
            _, g, curr = heapq.heappop(open_b)
            if curr in visited_b:
                continue
            visited_b.add(curr)

            # Nếu node đã được duyệt bởi phía xuôi, kiểm tra tổng cost
            if curr in visited_f:
                total_cost = g + g_f[curr]
                if total_cost < mu:
                    mu = total_cost
                    best_intersect = curr

            for nbr, dist, traffic, _ in adj_rev.get(curr, []):
                edge_key = tuple(sorted((curr, nbr)))
                penalty = edge_penalties.get(edge_key, 1.0)
                weight = dist * traffic * penalty
                tentative_g = g + weight
                if tentative_g < g_b.get(nbr, float("inf")):
                    g_b[nbr] = tentative_g
                    came_from_b[nbr] = curr
                    heapq.heappush(open_b, (tentative_g + h_b(nbr), tentative_g, nbr))
                    
                    if nbr in g_f:
                        total_cost = tentative_g + g_f[nbr]
                        if total_cost < mu:
                            mu = total_cost
                            best_intersect = nbr

    if best_intersect is None:
        return None, float("inf")

    # Tái tạo đường đi từ start -> giao điểm
    path_f = []
    curr = best_intersect
    while curr in came_from_f:
        path_f.append(curr)
        curr = came_from_f[curr]
    path_f.append(start)
    path_f.reverse()

    # Tái tạo đường đi từ giao điểm -> goal
    path_b = []
    curr = best_intersect
    while curr in came_from_b:
        curr = came_from_b[curr]
        path_b.append(curr)

    return path_f + path_b, mu


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


def penalty_k_paths(nodes, adj, adj_rev, start, goal, K=3, penalty=3.0):
    """Tìm K đường đi khác nhau bằng cách phạt cạnh đã dùng (sử dụng Bidirectional A*).

    Lần 1: Bidirectional A* bình thường.
    Lần k > 1: nhân trọng số các cạnh thuộc các đường trước với `penalty`
    để thuật toán bị "đẩy" sang đường khác.
    """
    paths = []
    penalties = {}  # edge_key -> tổng penalty đã tích luỹ

    for _ in range(K):
        path, _ = bidirectional_astar(nodes, adj, adj_rev, start, goal, edge_penalties=penalties)
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


def find_paths(start_lat, start_lon, end_lat, end_lon, K=3, departure_hour=None):
    """Endpoint chính: nhận toạ độ start/end, trả về K đường đi bằng A* hai chiều (hỗ trợ lọc theo giờ)."""
    nodes, adj, adj_rev = load_graph(departure_hour=departure_hour)
    if not nodes:
        return []

    start = find_nearest_node(nodes, start_lat, start_lon)
    goal = find_nearest_node(nodes, end_lat, end_lon)
    if start is None or goal is None or start == goal:
        return []

    paths = penalty_k_paths(nodes, adj, adj_rev, start, goal, K=K)
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
