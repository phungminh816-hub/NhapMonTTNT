# Tìm đường bộ — Quận Hai Bà Trưng

Bài tập môn **Nhập môn Trí tuệ Nhân tạo**: hệ thống tìm đường bộ trên bản đồ thực của Quận Hai Bà Trưng, Hà Nội. Người dùng chọn 2 điểm bất kỳ trên bản đồ, hệ thống tìm và hiển thị **3 đường đi khác nhau** bằng thuật toán A\* kết hợp penalty trên cạnh đã dùng. Có module mô phỏng traffic (thông thoáng / chậm / tắc) để A\* tự điều chỉnh trọng số theo tình trạng giao thông.

---

## Tính năng

- Bản đồ Quận Hai Bà Trưng (~4845 nodes, ~5172 edges) lấy từ OpenStreetMap qua Overpass API.
- Click 2 điểm trên bản đồ → tìm 3 đường đi khác biệt rõ rệt, hiển thị bằng 3 màu khác nhau.
- Mỗi đường hiển thị tổng quãng đường (km) và thời gian ước tính (phút) dựa trên tốc độ giả định 30 km/h.
- Mô phỏng traffic:
  - Click trực tiếp vào đoạn đường để xoay vòng trạng thái: thông thoáng → chậm → tắc → thông thoáng.
  - Random toàn bộ traffic (phân bố 70% thông / 20% chậm / 10% tắc).
  - Đặt lại tất cả về thông thoáng.
  - Bật/Tắt **mô phỏng auto**: mỗi 5 giây tự random 50 cạnh.
- Khi traffic thay đổi, lần tìm đường tiếp theo sẽ tính lại theo trọng số mới.

---

## Cấu trúc hệ thống

```
┌──────────────────────────────────┐
│  Frontend (HTML + Leaflet.js)    │
│  - Vẽ bản đồ, nodes, edges       │
│  - UI chọn điểm, hiển thị kết quả│
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

Ba tầng tách rời, giao tiếp qua REST API thuần. Frontend chỉ là file tĩnh, không cần build tool. Backend không state — toàn bộ trạng thái nằm trong SQLite.

---

## Cấu trúc project

```
MapNhapMonTTNT2/
├── README.md
├── CLAUDE.md                 # Hướng dẫn cho Claude Code
├── .gitignore
├── graph.db                  # SQLite DB (đi kèm project, không cần build lại)
│
├── backend/
│   ├── app.py                # Flask app + REST endpoints
│   ├── graph.py              # A* + penalty-based K-paths
│   ├── database.py           # CRUD trên SQLite
│   └── osm_loader.py         # Tải dữ liệu OSM (chạy 1 lần)
│
└── frontend/
    ├── index.html            # Khung HTML + sidebar
    ├── style.css             # Toàn bộ CSS
    └── js/
        ├── map.js            # Khởi tạo Leaflet + state APP toàn cục
        ├── graph.js          # Tải graph từ backend, vẽ edges
        ├── pathfinding.js    # Gọi /api/find-path, vẽ 3 đường
        └── traffic.js        # Click đổi traffic + nút random/reset/auto
```

---

## Mô tả các file quan trọng

### Backend

| File | Vai trò |
|------|---------|
| [backend/app.py](backend/app.py) | Khởi tạo Flask app, định nghĩa 5 endpoint: `/api/graph`, `/api/find-path`, `/api/traffic`, `/api/traffic/randomize`, `/api/traffic/reset`. Bật CORS để frontend gọi từ origin khác. |
| [backend/graph.py](backend/graph.py) | Logic tìm đường. Hàm `astar()` nhận thêm tham số `edge_penalties` để áp hệ số phạt; `penalty_k_paths()` chạy A\* K lần, mỗi lần phạt các cạnh thuộc đường vừa tìm; `find_paths()` là entry point từ API. |
| [backend/database.py](backend/database.py) | Tất cả thao tác SQLite: tạo schema, CRUD nodes/edges, cập nhật traffic, randomize, reset. Key cạnh luôn lưu dạng `sorted((node1, node2))` để truy vấn không phụ thuộc thứ tự. |
| [backend/osm_loader.py](backend/osm_loader.py) | Chạy **1 lần** lúc khởi tạo project: gọi Overpass API với area `3609421134` (Quận Hai Bà Trưng), lọc các loại đường `primary|secondary|tertiary|residential`, tính khoảng cách Haversine giữa các điểm liên tiếp, ghi vào `graph.db`. Sau khi đã có file `graph.db` không cần chạy lại. |

### Frontend

| File | Vai trò |
|------|---------|
| [frontend/index.html](frontend/index.html) | Layout 2 cột: sidebar (chọn điểm, kết quả, panel traffic) + map. Load 4 file JS theo thứ tự: `map.js` → `graph.js` → `pathfinding.js` → `traffic.js`. |
| [frontend/style.css](frontend/style.css) | Toàn bộ CSS: layout flex, button, badge số thứ tự đường, màu nền cho 3 đường (xanh dương / đỏ / xanh lá), dot màu chú thích traffic. |
| [frontend/js/map.js](frontend/js/map.js) | Khởi tạo Leaflet map, định nghĩa object state toàn cục `APP` (chia sẻ giữa các file JS), xử lý click bản đồ chọn điểm đầu/cuối, nút Đặt lại. |
| [frontend/js/graph.js](frontend/js/graph.js) | Gọi `GET /api/graph`, vẽ tất cả edges thành polyline màu theo `traffic_level`, đăng ký vào `APP.edgesByKey` để cập nhật màu nhanh khi traffic đổi. |
| [frontend/js/pathfinding.js](frontend/js/pathfinding.js) | Khi bấm "Tìm 3 đường đi": gọi `POST /api/find-path`, vẽ 3 polyline đậm chồng lên map, render sidebar danh sách kết quả. Click vào kết quả để highlight đường tương ứng. |
| [frontend/js/traffic.js](frontend/js/traffic.js) | Click polyline → POST `/api/traffic` để xoay trạng thái 1→2→5→1. Quản lý nút Random / Reset / Auto simulation (`setInterval` 5s, random 50 cạnh). |

### Database schema

```sql
CREATE TABLE nodes (
    id   TEXT PRIMARY KEY,    -- "lat_lon" format
    lat  REAL NOT NULL,
    lon  REAL NOT NULL
);

CREATE TABLE edges (
    node1_id      TEXT NOT NULL,    -- sorted(a, b)
    node2_id      TEXT NOT NULL,
    distance_km   REAL NOT NULL,
    traffic_level INTEGER NOT NULL DEFAULT 1,   -- 1=thông, 2=chậm, 5=tắc
    PRIMARY KEY (node1_id, node2_id)
);
```

---

## Thuật toán

### 1. A\* (A-star)

Tìm đường ngắn nhất từ `start` đến `goal` trên graph có trọng số.

- **Trọng số mỗi cạnh** = `distance_km × traffic_level`
  - Traffic level 1 (thông): trọng số = khoảng cách thật.
  - Level 2 (chậm): trọng số ×2 → A\* "thấy" đoạn đường dài gấp đôi → có xu hướng tránh.
  - Level 5 (tắc): trọng số ×5 → gần như sẽ vòng tránh trừ khi không có lựa chọn khác.
- **Heuristic `h(n)`** = khoảng cách Haversine thẳng từ `n` đến `goal`.
  - Haversine cho khoảng cách trên mặt cầu Trái Đất, công thức trong [backend/graph.py:9](backend/graph.py#L9).
  - Luôn ≤ khoảng cách thật → heuristic **admissible**, A\* đảm bảo tìm được đường tối ưu.
- Khi user click toạ độ bất kỳ, ta snap về node gần nhất bằng `find_nearest_node()` (duyệt linear, đủ nhanh với ~5000 nodes).

### 2. Penalty-based K alternative paths

Để tìm **3 đường khác nhau** thay vì 3 đường tối ưu giống hệt:

```
penalties = {}                   # edge_key -> hệ số phạt tích luỹ
for k in range(K):
    path = A*(start, goal, edge_penalties=penalties)
    if path đã có trong kết quả: dừng
    thêm path vào kết quả
    với mỗi cạnh trong path:
        penalties[cạnh] *= 3.0   # lần sau cạnh này "đắt" gấp 3
```

- Lần 1: A\* bình thường → đường tối ưu thật.
- Lần 2, 3: các cạnh đã đi bị nhân ×3 trọng số → A\* bị "đẩy" sang đường khác.
- Hệ số phạt **tích luỹ**: nếu một cạnh nằm trên cả đường 1 và 2 thì lần 3 nó bị phạt ×9.

**Khác với Yen's K-Shortest Paths**: không đảm bảo K đường ngắn nhất tuyệt đối, nhưng cho ra các đường **khác biệt rõ trên bản đồ** — phù hợp mục tiêu minh hoạ trực quan. Yen's từng được thử nhưng 3 đường ra chênh lệch <1% (2.18, 2.19, 2.20 km), nhìn trên bản đồ gần như trùng nhau.

### 3. Ước tính thời gian

```
estimated_minutes = distance_km / 30 × 60
```

Giả định tốc độ trung bình 30 km/h (xe máy trong nội đô, có cả đèn đỏ và rẽ). Đây là giá trị tham khảo, không phản ánh điều kiện thực tế.

### 4. Phân bố random traffic

Khi bấm "Random toàn bộ" hoặc khi auto simulation chạy, mỗi cạnh được gán level theo phân bố:

| Level | Trạng thái     | Xác suất |
|-------|----------------|----------|
| 1     | Thông thoáng   | 70%      |
| 2     | Chậm           | 20%      |
| 5     | Tắc            | 10%      |

Phân bố này phản ánh tình trạng giao thông trung bình giờ cao điểm: phần lớn đường vẫn đi được, một số đoạn chậm, ít đoạn tắc nặng.

---

## API Endpoints

| Method | Endpoint | Body / Query | Response |
|--------|----------|--------------|----------|
| GET    | `/api/graph` | — | `{nodes: [{id, lat, lon}], edges: [{node1_id, node2_id, distance_km, traffic_level}]}` |
| POST   | `/api/find-path` | `{start: {lat, lon}, end: {lat, lon}}` | `{paths: [{rank, nodes: [...], distance_km, estimated_minutes}]}` |
| POST   | `/api/traffic` | `{node1_id, node2_id, level}` (level ∈ {1,2,5}) | `{ok: true}` |
| POST   | `/api/traffic/randomize` | `{count?: int}` (null = toàn bộ) | `{changes: [{node1_id, node2_id, traffic_level}]}` |
| POST   | `/api/traffic/reset` | — | `{changes: [...]}` (chỉ cạnh có level ≠ 1) |

---

## Cách chạy

### Yêu cầu

- Git
- Python 3.10+ (đã test trên 3.14) — cài kèm `pip`
- Trình duyệt web bất kỳ

### Bước 1 — Clone repo

```bash
git clone https://github.com/vietanhx9/NhapMonTTNT.git
cd NhapMonTTNT
```

> File `graph.db` đã đi kèm repo, không cần build lại từ OSM.

### Bước 2 — Cài thư viện Python

```bash
pip install flask flask-cors requests
```

> `sqlite3` đã có sẵn trong thư viện chuẩn của Python, không cần cài thêm.

### Bước 3 — Chạy backend

```bash
cd backend
python app.py
```

Server Flask sẽ chạy ở `http://127.0.0.1:5000`. Để cửa sổ terminal này mở.

### Bước 4 — Mở frontend

Mở **file mới** (không tắt terminal backend) → mở `frontend/index.html` bằng trình duyệt:
- **Cách 1**: double-click trực tiếp file `frontend/index.html`.
- **Cách 2 (khuyến nghị nếu dùng VS Code)**: cài extension *Live Server* → chuột phải vào `index.html` → *Open with Live Server*.

Bản đồ sẽ tự load. Click 2 điểm trên bản đồ rồi bấm **Tìm 3 đường đi** để thử.

### (Tuỳ chọn) Tải lại dữ liệu OSM

File `graph.db` đã đi kèm project, không cần làm gì thêm. Nếu muốn build lại từ đầu:

```bash
# Windows PowerShell: set UTF-8 trước để tránh UnicodeEncodeError
$env:PYTHONIOENCODING = "utf-8"

cd backend
python osm_loader.py
```

Lệnh này xoá-tạo lại `graph.db`, tải mới từ Overpass API. Mất khoảng 30–60 giây.

---

## Giới hạn đã biết

- `find_nearest_node()` duyệt linear toàn bộ nodes — chậm nếu graph lớn hơn nhiều. Có thể tối ưu bằng KD-Tree hoặc spatial index của SQLite (R\*Tree).
- Penalty-based K-paths không đảm bảo tối ưu; với một số cặp điểm có thể thiếu đường thứ 3 khi đồ thị bị chia cắt nhiều.
- Tốc độ 30 km/h cố định — không phân biệt loại đường primary / residential.
- Mô phỏng auto chạy hoàn toàn ở client (`setInterval`); đóng tab thì dừng. Backend không có scheduler.
