# Tìm đường bộ — Quận Hai Bà Trưng

Bài tập môn **Nhập môn Trí tuệ Nhân tạo**: hệ thống tìm đường bộ trên bản đồ thực của Quận Hai Bà Trưng, Hà Nội. Người dùng có thể nhập địa điểm tìm kiếm hoặc click trực tiếp 2 điểm trên bản đồ. Hệ thống sẽ tìm và hiển thị **3 đường đi khác nhau** bằng thuật toán A* kết hợp penalty trên cạnh đã dùng. Có module mô phỏng traffic và các điều kiện đặc biệt (ngập lụt, cấm đường, một chiều) để A* tự điều chỉnh trọng số và hướng đi tương ứng.

---

## Tính năng

- **Bản đồ thực tế**: Bản đồ Quận Hai Bà Trưng (~4845 nodes, ~5172 edges) lấy từ OpenStreetMap qua Overpass API.
- **Tìm kiếm địa điểm**:
  - Hỗ trợ nhập trực tiếp Điểm đi và Điểm đến từ thanh tìm kiếm.
  - Tự động gợi ý địa chỉ (autocomplete) giới hạn trong phạm vi Quận Hai Bà Trưng bằng API Nominatim.
  - Nếu người dùng nhập tên địa điểm mà không chọn gợi ý, hệ thống tự động tìm kiếm vị trí phù hợp nhất trong quận để thực hiện tìm đường.
  - Hoặc click chọn trực tiếp 2 điểm trên bản đồ.
- **Tìm 3 đường đi khác biệt**: Tìm và hiển thị đồng thời 3 tuyến đường khác biệt rõ rệt bằng 3 màu sắc riêng biệt.
- **Thông tin chi tiết hành trình**: Mỗi tuyến đường hiển thị quãng đường (km), thời gian di chuyển dự kiến (phút) dựa trên tốc độ giả định 30 km/h và danh sách các tên đường sẽ đi qua.
- **Mô phỏng điều kiện đường bộ mở rộng (7 trạng thái)**:
  - *Thông thoáng*: traffic_level = 1 (màu xanh lá).
  - *Chậm*: traffic_level = 2 (màu vàng cam).
  - *Tắc*: traffic_level = 5 (màu đỏ).
  - *Ngập lụt*: road_status = 'flooded' (màu xanh dương, A* nhân thêm hệ số phạt FLOOD_PENALTY = 8.0).
  - *Cấm đường*: road_status = 'closed' (màu xám nét đứt, loại bỏ hoàn toàn khỏi graph tìm đường).
  - *Một chiều (a→b hoặc b→a)*: is_oneway = 1 hoặc 2 (màu cam, hiển thị kèm mũi tên chỉ hướng đi, A* chỉ cho đi một chiều).
- **Chức năng điều khiển traffic**:
  - Click trực tiếp vào đoạn đường để xoay vòng qua 7 trạng thái trên.
  - *Random toàn bộ traffic*: Phân bố ngẫu nhiên traffic thông thoáng (70%), chậm (20%), tắc (10%).
  - *Demo điều kiện đặc biệt*: Ngẫu nhiên tạo 30 cạnh ngập lụt, 15 cạnh cấm đường và 35 cạnh một chiều.
  - *Đặt lại tất cả*: Trả toàn bộ các cạnh về mặc định (thông thoáng, hai chiều, không ngập, không cấm).
  - *Mô phỏng auto*: Mỗi 5 giây tự random ngẫu nhiên 50 cạnh.

---

## Cấu trúc hệ thống

```
┌──────────────────────────────────┐
│  Frontend (HTML + Leaflet.js)    │
│  - Vẽ bản đồ, nodes, edges       │
│  - UI tìm kiếm, autocomplete     │
│  - Hiển thị kết quả & traffic    │
└──────────────┬───────────────────┘
               │  REST API (JSON)
               ▼
┌──────────────────────────────────┐
│  Backend (Python + Flask)        │
│  - Endpoints /api/*              │
│  - A* + penalty K-paths          │
└──────────────┬───────────────────┘
               │  sqlite3
               ▼
┌──────────────────────────────────┐
│  Database (SQLite — graph.db)    │
│  - Bảng nodes, edges             │
└──────────────────────────────────┘
```

Ba tầng tách rời, giao tiếp qua REST API thuần. Frontend chỉ là file tĩnh, không cần build tool. Backend không lưu state — toàn bộ trạng thái nằm trong SQLite.

---

## Cấu trúc project

```
NhapMonTTNT/
├── README.md
├── .gitignore
├── graph.db                  # SQLite DB (đi kèm project, không cần build lại)
│
├── backend/
│   ├── app.py                # Flask app + REST endpoints
│   ├── graph.py              # A* + penalty-based K-paths (xử lý cấm, ngập, 1 chiều)
│   ├── database.py           # CRUD trên SQLite (hỗ trợ auto-migrate & demo)
│   └── osm_loader.py         # Tải dữ liệu OSM kèm tên đường (chạy 1 lần)
│
└── frontend/
    ├── index.html            # Giao diện chính dạng 2 cột
    ├── style.css             # Định dạng layout, autocomplete dropdown và 7 màu đường
    └── js/
        ├── map.js            # Khởi tạo Leaflet, Nominatim Geocoding & Autocomplete
        ├── graph.js          # Tải graph, vẽ edges, hiển thị style 7 trạng thái & mũi tên một chiều
        ├── pathfinding.js    # Xử lý tìm đường qua API, vẽ 3 đường và render kết quả kèm tên đường
        └── traffic.js        # Gửi API cập nhật traffic, demo đặc biệt, reset, auto simulation
```

---

## Mô tả các file quan trọng

### Backend

| File | Vai trò |
|------|---------|
| [backend/app.py](backend/app.py) | Khởi tạo Flask app, định nghĩa 6 endpoint: `/api/graph`, `/api/find-path`, `/api/traffic`, `/api/traffic/randomize`, `/api/traffic/reset`, `/api/traffic/demo`. Bật CORS để frontend gọi từ origin khác. |
| [backend/graph.py](backend/graph.py) | Logic tìm đường. Hàm `load_graph()` xây dựng adjacency list bằng cách lọc bỏ cạnh cấm (`closed`), nhân hệ số phạt `FLOOD_PENALTY` cho cạnh ngập (`flooded`), và chỉ thêm cạnh theo hướng quy định cho đường một chiều (`oneway`). Hàm `astar()` tìm đường ngắn nhất, `penalty_k_paths()` tìm 3 đường khác nhau bằng cách phạt cạnh đã dùng. |
| [backend/database.py](backend/database.py) | Tất cả thao tác SQLite: tự động khởi tạo và kiểm tra cấu trúc bảng (auto-migrate), CRUD nodes/edges, cập nhật trạng thái cạnh, tạo trạng thái ngẫu nhiên và reset. Key cạnh luôn lưu dạng `sorted((node1, node2))` để truy vấn không phụ thuộc thứ tự. |
| [backend/osm_loader.py](backend/osm_loader.py) | Chạy **1 lần** lúc khởi tạo project: gọi Overpass API với area `3609421134` (Quận Hai Bà Trưng), lọc các loại đường `primary|secondary|tertiary|residential` kèm tên đường (`street_name`), tính khoảng cách Haversine và ghi vào `graph.db`. |

### Frontend

| File | Vai trò |
|------|---------|
| [frontend/index.html](frontend/index.html) | Giao diện chính gồm cột thanh bên (chứa panel tìm kiếm địa điểm, kết quả đường đi, bảng chú thích và điều khiển traffic) + bản đồ. |
| [frontend/style.css](frontend/style.css) | CSS cho giao diện, bao gồm kiểu dáng cho các ô nhập liệu autocomplete, dropdown danh sách gợi ý địa điểm, các nút bấm và kiểu hiển thị thông tin. |
| [frontend/js/map.js](frontend/js/map.js) | Khởi tạo bản đồ Leaflet, quản lý marker điểm đầu/cuối, reverse geocoding toạ độ khi click map thành địa chỉ thực tế và thiết lập tính năng tự động gợi ý địa chỉ (autocomplete) qua Nominatim API. |
| [frontend/js/graph.js](frontend/js/graph.js) | Gọi `GET /api/graph`, vẽ tất cả edges thành polyline. Áp dụng màu sắc và nét vẽ tương ứng với 7 trạng thái đường và vẽ mũi tên `▶` hướng đi đối với đường một chiều dựa trên góc xoay bearing. |
| [frontend/js/pathfinding.js](frontend/js/pathfinding.js) | Lắng nghe sự kiện tìm đường. Nếu người dùng gõ chữ nhưng chưa chọn gợi ý, tự động gọi API Nominatim để phân giải địa điểm phù hợp trong quận. Gọi `POST /api/find-path`, vẽ 3 đường đi và render danh sách tên đường đi qua ở sidebar. |
| [frontend/js/traffic.js](frontend/js/traffic.js) | Click polyline trên map để xoay vòng trạng thái cạnh qua 7 bước. Gửi request tương ứng tới backend. Lắng nghe các nút Random, Demo đặc biệt, Reset và quản lý trạng thái auto-simulation. |

### Database schema

```sql
CREATE TABLE nodes (
    id   TEXT PRIMARY KEY,    -- Toạ độ dạng "lat_lon"
    lat  REAL NOT NULL,
    lon  REAL NOT NULL
);

CREATE TABLE edges (
    node1_id      TEXT NOT NULL,
    node2_id      TEXT NOT NULL,
    distance_km   REAL NOT NULL,
    traffic_level INTEGER NOT NULL DEFAULT 1,     -- 1=thông, 2=chậm, 5=tắc
    road_status   TEXT NOT NULL DEFAULT 'normal',   -- 'normal', 'flooded', 'closed'
    is_oneway     INTEGER NOT NULL DEFAULT 0,     -- 0=hai chiều, 1=node1->node2, 2=node2->node1
    street_name   TEXT,                           -- Tên đường (nếu có)
    PRIMARY KEY (node1_id, node2_id),
    FOREIGN KEY (node1_id) REFERENCES nodes(id),
    FOREIGN KEY (node2_id) REFERENCES nodes(id)
);
```

---

## Thuật toán

### 1. A* (A-star) kết hợp xử lý trạng thái mở rộng

Tìm đường đi ngắn nhất từ `start` đến `goal` trên đồ thị trọng số động:

- **Logic xây dựng đồ thị kề (trong `load_graph`)**:
  - Loại bỏ hoàn toàn các cạnh có `road_status == 'closed'` (Cấm đường).
  - Đối với đường một chiều (`is_oneway` = 1 hoặc 2), chỉ thêm kết nối theo đúng chiều được phép đi vào adjacency list.
- **Trọng số mỗi cạnh**:
  - `weight = distance_km × traffic_level × (FLOOD_PENALTY if status == 'flooded' else 1.0)`
  - `traffic_level` đóng vai trò là hệ số phạt kẹt xe (Thông = 1, Chậm = 2, Tắc = 5).
  - Trạng thái ngập lụt (`flooded`) phạt thêm hệ số `FLOOD_PENALTY = 8.0` (đường ngập vẫn đi được nhưng đi rất chậm, thuật toán sẽ chỉ đi qua nếu không còn lựa chọn nào tốt hơn).
- **Heuristic `h(n)`** = khoảng cách Haversine đường chim bay từ `n` đến `goal`. Do khoảng cách đường chim bay luôn bé hơn hoặc bằng khoảng cách di chuyển thực tế nên heuristic này đảm bảo tính **admissible**, A* chắc chắn tìm được đường tối ưu nhất theo trọng số hiện tại.
- Khi người dùng chọn toạ độ bất kỳ, hệ thống sử dụng hàm `find_nearest_node()` tìm node gần nhất trong DB để làm điểm mốc bắt đầu chạy A*.

### 2. Penalty-based K alternative paths

Để tìm **3 đường đi khác nhau** tránh bị trùng lặp:

```
penalties = {}                   # edge_key -> hệ số phạt tích luỹ
for k in range(K):
    path = A*(start, goal, edge_penalties=penalties)
    if path đã có trong kết quả hoặc không tìm thấy: dừng
    thêm path vào kết quả
    với mỗi cạnh trong path:
        penalties[cạnh] *= 3.0   # nhân thêm hệ số phạt 3.0 cho các lượt tìm tiếp theo
```

- Lượt 1: Chạy A* bình thường → tìm được đường đi tối ưu tuyệt đối.
- Lượt 2, 3: Phạt các cạnh của tuyến đường trước đó (nhân hệ số phạt tích luỹ `3.0`), khiến A* có xu hướng tìm các ngã rẽ và các đoạn đường khác thay thế.

---

## API Endpoints

| Method | Endpoint | Body / Query | Response |
|--------|----------|--------------|----------|
| GET    | `/api/graph` | — | `{nodes: [{id, lat, lon}], edges: [{node1_id, node2_id, distance_km, traffic_level, road_status, is_oneway, street_name}]}` |
| POST   | `/api/find-path` | `{start: {lat, lon}, end: {lat, lon}}` | `{paths: [{rank, nodes: [...], distance_km, estimated_minutes, streets: [...]}]}` |
| POST   | `/api/traffic` | `{node1_id, node2_id, traffic_level, road_status, is_oneway}` | `{ok: true}` |
| POST   | `/api/traffic/randomize` | `{count?: int}` (null = toàn bộ) | `{changes: [{node1_id, node2_id, traffic_level}]}` |
| POST   | `/api/traffic/reset` | — | `{changes: [...]}` (đưa tất cả cạnh về traffic=1, road_status='normal', is_oneway=0) |
| POST   | `/api/traffic/demo` | `{n_flooded?: int, n_closed?: int, n_oneway?: int}` | `{changes: [...]}` |

---

## Cách chạy

### Yêu cầu

- Git
- Python 3.10+ (đã test trên 3.14) — kèm `pip`
- Trình duyệt web bất kỳ

### Bước 1 — Clone repo

```bash
git clone https://github.com/vietanhx9/NhapMonTTNT.git
cd NhapMonTTNT
```

### Bước 2 — Cài thư viện Python

```bash
pip install flask flask-cors requests
```

### Bước 3 — Chạy backend

```bash
cd backend
python app.py
```

Server Flask sẽ chạy ở `http://127.0.0.1:5000`. Hãy giữ cửa sổ terminal này hoạt động.

### Bước 4 — Mở frontend

Mở một cửa sổ mới và mở file `frontend/index.html` bằng trình duyệt:
- **Cách 1**: Click đúp trực tiếp vào file `frontend/index.html`.
- **Cách 2 (Khuyến nghị)**: Mở thư mục dự án bằng VS Code, cài đặt extension **Live Server**, click chuột phải vào `frontend/index.html` và chọn **Open with Live Server**.

Bản đồ sẽ tự động tải dữ liệu. Nhập địa điểm vào ô tìm kiếm hoặc click chọn 2 điểm trên bản đồ và bấm **Tìm 3 đường đi** để trải nghiệm.

---

## Giới hạn đã biết

- `find_nearest_node()` duyệt tuyến tính toàn bộ nodes — hiệu năng sẽ giảm nếu tập dữ liệu đồ thị quá lớn. Có thể tối ưu bằng KD-Tree hoặc tính năng spatial index (R*Tree) của SQLite.
- Cơ chế Penalty K-paths mang tính heuristic, đôi khi không thể tìm đủ 3 đường nếu đồ thị bị chia cắt quá nhiều bởi các điều kiện cấm đường hoặc đường một chiều.
- Ước tính thời gian dựa trên tốc độ mặc định 30 km/h cho tất cả loại đường, chưa phân biệt tốc độ tối đa cho phép trên các loại đường khác nhau (primary / residential).
- Auto simulation chạy bằng `setInterval` ở phía Client; tắt tab trình duyệt thì mô phỏng tự động dừng.
