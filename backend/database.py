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
            street_name TEXT,
            PRIMARY KEY (node1_id, node2_id),
            FOREIGN KEY (node1_id) REFERENCES nodes(id),
            FOREIGN KEY (node2_id) REFERENCES nodes(id)
        )
    """)
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
        "SELECT node1_id, node2_id, distance_km, traffic_level, street_name FROM edges"
    ).fetchall()
    conn.close()
    return [dict(r) for r in rows]


def update_traffic(node1_id, node2_id, level):
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


def reset_traffic():
    """Đặt tất cả cạnh về level 1. Trả về list cạnh đã đổi."""
    conn = get_connection()
    rows = conn.execute(
        "SELECT node1_id, node2_id FROM edges WHERE traffic_level != 1"
    ).fetchall()
    changes = [
        {"node1_id": r["node1_id"], "node2_id": r["node2_id"], "traffic_level": 1}
        for r in rows
    ]
    conn.execute("UPDATE edges SET traffic_level = 1 WHERE traffic_level != 1")
    conn.commit()
    conn.close()
    return changes
