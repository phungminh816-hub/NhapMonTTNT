"""Kết nối SQLite và các thao tác đọc/ghi graph."""
import sqlite3
import os

DB_PATH = os.path.join(os.path.dirname(__file__), "..", "graph.db")


def get_connection():
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    return conn


def init_schema():
    conn = get_connection()
    cur = conn.cursor()
    cur.execute("""
        CREATE TABLE IF NOT EXISTS nodes (
            id TEXT PRIMARY KEY,
            lat REAL NOT NULL,
            lon REAL NOT NULL
        )
    """)
    cur.execute("""
        CREATE TABLE IF NOT EXISTS edges (
            node1_id TEXT NOT NULL,
            node2_id TEXT NOT NULL,
            distance_km REAL NOT NULL,
            traffic_level INTEGER NOT NULL DEFAULT 1,
            road_status TEXT NOT NULL DEFAULT 'normal',
            is_oneway INTEGER NOT NULL DEFAULT 0,
            street_name TEXT,
            PRIMARY KEY (node1_id, node2_id),
            FOREIGN KEY (node1_id) REFERENCES nodes(id),
            FOREIGN KEY (node2_id) REFERENCES nodes(id)
        )
    """)
    # Migrate DB cũ: thêm 2 cột mới nếu chưa có.
    cur.execute("PRAGMA table_info(edges)")
    existing_cols = {row[1] for row in cur.fetchall()}
    if "road_status" not in existing_cols:
        cur.execute(
            "ALTER TABLE edges ADD COLUMN road_status TEXT NOT NULL DEFAULT 'normal'"
        )
    if "is_oneway" not in existing_cols:
        cur.execute(
            "ALTER TABLE edges ADD COLUMN is_oneway INTEGER NOT NULL DEFAULT 0"
        )
    cur.execute("CREATE INDEX IF NOT EXISTS idx_edges_node1 ON edges(node1_id)")
    cur.execute("CREATE INDEX IF NOT EXISTS idx_edges_node2 ON edges(node2_id)")
    conn.commit()
    conn.close()


def insert_node(conn, node_id, lat, lon):
    conn.execute(
        "INSERT OR IGNORE INTO nodes (id, lat, lon) VALUES (?, ?, ?)",
        (node_id, lat, lon),
    )


def insert_edge(conn, node1_id, node2_id, distance_km, street_name=None):
    a, b = sorted([node1_id, node2_id])
    conn.execute(
        "INSERT OR IGNORE INTO edges (node1_id, node2_id, distance_km, traffic_level, street_name) VALUES (?, ?, ?, 1, ?)",
        (a, b, distance_km, street_name),
    )


def get_all_nodes():
    conn = get_connection()
    rows = conn.execute("SELECT id, lat, lon FROM nodes").fetchall()
    conn.close()
    return [dict(r) for r in rows]


def get_all_edges():
    conn = get_connection()
    rows = conn.execute(
        "SELECT node1_id, node2_id, distance_km, traffic_level, "
        "road_status, is_oneway, street_name FROM edges"
    ).fetchall()
    conn.close()
    return [dict(r) for r in rows]


def update_edge_state(node1_id, node2_id, traffic_level, road_status, is_oneway):
    """Cập nhật toàn bộ state của 1 cạnh: traffic_level + road_status + is_oneway.

    is_oneway: 0=hai chiều, 1=cho phép a→b (theo node sorted), 2=cho phép b→a.
    road_status: 'normal' | 'flooded' | 'closed'.
    """
    a, b = sorted([node1_id, node2_id])
    conn = get_connection()
    conn.execute(
        "UPDATE edges SET traffic_level = ?, road_status = ?, is_oneway = ? "
        "WHERE node1_id = ? AND node2_id = ?",
        (traffic_level, road_status, is_oneway, a, b),
    )
    conn.commit()
    conn.close()


def update_traffic(node1_id, node2_id, level):
    """Cập nhật riêng traffic_level (giữ lại để tương thích ngược)."""
    a, b = sorted([node1_id, node2_id])
    conn = get_connection()
    conn.execute(
        "UPDATE edges SET traffic_level = ? WHERE node1_id = ? AND node2_id = ?",
        (level, a, b),
    )
    conn.commit()
    conn.close()


def _random_level():
    """Phân bố: 70% thông (1), 20% chậm (2), 10% tắc (5)."""
    import random
    r = random.random()
    if r < 0.70:
        return 1
    if r < 0.90:
        return 2
    return 5


def randomize_traffic(count=None):
    """Random traffic cho `count` cạnh (None = toàn bộ).

    Trả về list dict {node1_id, node2_id, traffic_level} của các cạnh đã đổi.
    """
    import random
    conn = get_connection()
    rows = conn.execute("SELECT node1_id, node2_id FROM edges").fetchall()
    edges = [(r["node1_id"], r["node2_id"]) for r in rows]
    if count is not None and count < len(edges):
        edges = random.sample(edges, count)

    changes = []
    for a, b in edges:
        lvl = _random_level()
        conn.execute(
            "UPDATE edges SET traffic_level = ? WHERE node1_id = ? AND node2_id = ?",
            (lvl, a, b),
        )
        changes.append({"node1_id": a, "node2_id": b, "traffic_level": lvl})
    conn.commit()
    conn.close()
    return changes


def demo_special_states(n_flooded=30, n_closed=15, n_oneway=35):
    """Random hoá một số cạnh sang các trạng thái đặc biệt để demo.

    - n_flooded cạnh -> road_status='flooded'
    - n_closed  cạnh -> road_status='closed'
    - n_oneway  cạnh -> is_oneway = 1 hoặc 2 (chia đôi)

    Các cạnh được chọn ngẫu nhiên KHÔNG trùng nhau. Trả về list cạnh đã đổi
    kèm full state để frontend update visualization.
    """
    import random
    conn = get_connection()
    rows = conn.execute("SELECT node1_id, node2_id FROM edges").fetchall()
    all_edges = [(r["node1_id"], r["node2_id"]) for r in rows]
    total_need = n_flooded + n_closed + n_oneway
    if total_need > len(all_edges):
        # graph quá nhỏ, scale down
        total_need = len(all_edges)
        n_flooded = total_need // 3
        n_closed = total_need // 3
        n_oneway = total_need - n_flooded - n_closed

    picked = random.sample(all_edges, total_need)
    flooded = picked[:n_flooded]
    closed = picked[n_flooded:n_flooded + n_closed]
    oneway = picked[n_flooded + n_closed:]

    changes = []
    for a, b in flooded:
        conn.execute(
            "UPDATE edges SET road_status='flooded', is_oneway=0 "
            "WHERE node1_id=? AND node2_id=?", (a, b),
        )
        changes.append({"node1_id": a, "node2_id": b, "road_status": "flooded", "is_oneway": 0})

    for a, b in closed:
        conn.execute(
            "UPDATE edges SET road_status='closed', is_oneway=0 "
            "WHERE node1_id=? AND node2_id=?", (a, b),
        )
        changes.append({"node1_id": a, "node2_id": b, "road_status": "closed", "is_oneway": 0})

    for a, b in oneway:
        direction = random.choice([1, 2])
        conn.execute(
            "UPDATE edges SET road_status='normal', is_oneway=? "
            "WHERE node1_id=? AND node2_id=?", (direction, a, b),
        )
        changes.append({"node1_id": a, "node2_id": b, "road_status": "normal", "is_oneway": direction})

    conn.commit()
    conn.close()
    return changes


def reset_traffic():
    """Đặt tất cả cạnh về trạng thái mặc định:
    traffic_level=1, road_status='normal', is_oneway=0.

    Trả về list cạnh đã đổi (kèm cả 3 trường để frontend reset visualization).
    """
    conn = get_connection()
    rows = conn.execute(
        "SELECT node1_id, node2_id FROM edges "
        "WHERE traffic_level != 1 OR road_status != 'normal' OR is_oneway != 0"
    ).fetchall()
    changes = [
        {
            "node1_id": r["node1_id"],
            "node2_id": r["node2_id"],
            "traffic_level": 1,
            "road_status": "normal",
            "is_oneway": 0,
        }
        for r in rows
    ]
    conn.execute(
        "UPDATE edges SET traffic_level = 1, road_status = 'normal', is_oneway = 0 "
        "WHERE traffic_level != 1 OR road_status != 'normal' OR is_oneway != 0"
    )
    conn.commit()
    conn.close()
    return changes
