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
    import json
    import os

    print("Đang phân tích dữ liệu OSM và tạo đồ thị...")
    nodes_dict = {}
    edges_dict = {}  # key: (node1_id, node2_id) sorted
    
    for way in data.get("elements", []):
        geom = way.get("geometry") or []
        tags = way.get("tags") or {}
        street_name = tags.get("name")
        for i, pt in enumerate(geom):
            curr_id = node_id(pt["lat"], pt["lon"])
            nodes_dict[curr_id] = {
                "id": curr_id,
                "lat": pt["lat"],
                "lon": pt["lon"]
            }

            if i > 0:
                prev = geom[i - 1]
                prev_id = node_id(prev["lat"], prev["lon"])
                dist = haversine_km(prev["lat"], prev["lon"], pt["lat"], pt["lon"])
                a, b = sorted([prev_id, curr_id])
                
                if (a, b) not in edges_dict:
                    edges_dict[(a, b)] = {
                        "node1_id": a,
                        "node2_id": b,
                        "distance_km": round(dist, 5),
                        "traffic_level": 1,
                        "road_status": "normal",
                        "is_oneway": 0,
                        "street_name": street_name
                    }
                else:
                    if street_name and not edges_dict[(a, b)]["street_name"]:
                        edges_dict[(a, b)]["street_name"] = street_name

    output_path = os.path.join(os.path.dirname(__file__), "graph_data.json")
    
    graph_data = {
        "nodes": list(nodes_dict.values()),
        "edges": list(edges_dict.values())
    }
    
    with open(output_path, "w", encoding="utf-8") as f:
        json.dump(graph_data, f, ensure_ascii=False, indent=2)
        
    print(f"Đã ghi vào file {output_path}. (Đã xử lý {len(nodes_dict)} nodes unique, {len(edges_dict)} edges unique)")


if __name__ == "__main__":
    data = fetch_osm()
    build_graph(data)

