"""Tải dữ liệu đường xá Quận Hai Bà Trưng từ Overpass API và lưu vào SQLite.

Chạy 1 lần: python osm_loader.py
"""
import math
import requests
import database

AREA_ID = 3609421134  # Quận Hai Bà Trưng, Hà Nội
OVERPASS_URL = "https://overpass-api.de/api/interpreter"
QUERY = f"""
[out:json];
area({AREA_ID})->.a;
way["highway"~"primary|secondary|tertiary|residential"](area.a);
out geom;
"""


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


def node_id(lat, lon):
    return f"{lat}_{lon}"


def fetch_osm():
    print("Đang tải dữ liệu OSM từ Overpass API...")
    headers = {"User-Agent": "MapNhapMonTTNT2/1.0 (academic project)"}
    resp = requests.post(
        OVERPASS_URL, data={"data": QUERY}, headers=headers, timeout=180
    )
    resp.raise_for_status()
    return resp.json()


def build_graph(data):
    print("Đang tạo schema DB...")
    database.init_schema()

    conn = database.get_connection()
    node_count = 0
    edge_count = 0

    for way in data.get("elements", []):
        geom = way.get("geometry") or []
        for i, pt in enumerate(geom):
            curr_id = node_id(pt["lat"], pt["lon"])
            database.insert_node(conn, curr_id, pt["lat"], pt["lon"])
            node_count += 1

            if i > 0:
                prev = geom[i - 1]
                prev_id = node_id(prev["lat"], prev["lon"])
                dist = haversine_km(prev["lat"], prev["lon"], pt["lat"], pt["lon"])
                database.insert_edge(conn, prev_id, curr_id, dist)
                edge_count += 1

    conn.commit()
    conn.close()
    print(f"Đã ghi vào DB. (Đã xử lý {node_count} điểm, {edge_count} cạnh)")


if __name__ == "__main__":
    data = fetch_osm()
    build_graph(data)
    nodes = database.get_all_nodes()
    edges = database.get_all_edges()
    print(f"Tổng số nodes trong DB: {len(nodes)}")
    print(f"Tổng số edges trong DB: {len(edges)}")
