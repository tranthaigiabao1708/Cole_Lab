# Đề bài Thực hành: Phân tích Video trận đấu & Lập Heatmap nhiệt sân bóng đá

- **Mã bài:** `ai-cv-football-heatmap`
- **Bộ Simulator:** `cole.cv-football-heatmap`
- **Chuyên môn:** Computer Vision & Video Analytics (Kỹ sư AI)
- **Mức độ:** Trung cấp – Nâng cao (Chuẩn doanh nghiệp)

---

## 1. Bối cảnh & Mục tiêu nghiệp vụ
Trong phân tích thể thao chuyên nghiệp (Sports Analytics), việc theo dõi vị trí cầu thủ và phân tích mật độ di chuyển (Heatmap) giúp ban huấn luyện đánh giá thể lực, kỷ luật cự ly đội hình và chiến thuật kiểm soát thế trận.

**Mục tiêu bài thực hành**:
1. Xây dựng bộ phát hiện và phân loại cầu thủ hai đội (`team_red` vs `team_yellow`), trọng tài và trái bóng trên từng frame ảnh.
2. Theo dõi liên tục trên luồng video clip trận đấu thực tế (`test_videos/bundesliga_match_clip.mp4`).
3. Chuyển đổi tọa độ pixel trên màn hình camera sang tọa độ sân bóng tiêu chuẩn 105m x 68m để sinh ra **ma trận bản đồ nhiệt (Pitch Heatmap)**.

---

## 2. Cấu trúc thư mục dữ liệu (Đã mount sẵn)
Khi học viên mở Workspace, hệ thống đã chuẩn bị sẵn 3 thư mục dữ liệu:
```text
📦 workspace/
 ┣ 📂 data/
 ┃ ┣ 📁 train/                    <-- 15 frames ảnh trận đấu Full HD (1920x1080) + nhãn annotations.json
 ┃ ┣ 📁 test/                     <-- 5 frames ảnh kiểm thử độc lập (đánh giá mAP / F1)
 ┃ ┗ 🎬 test_videos/              <-- Video clip Bundesliga 30s thực tế + ground_truth_heatmap.json
 ┣ 📂 solution/
 ┃ ┗ 🐍 predict.py                <-- [FILE BÀI LÀM] Học viên hoàn thiện class VideoAnalyzer
 ┗ 📄 README.md
```

---

## 3. Quy chuẩn bài nộp (Contract Interface)
Học viên hoàn thiện các phương thức trong lớp `VideoAnalyzer` tại `solution/predict.py`:

```python
class VideoAnalyzer:
    def process_frame(self, frame: np.ndarray) -> dict:
        """Nhận vào frame ảnh -> Trả về danh sách bounding boxes và nhãn"""
        pass

    def analyze_video(self, video_path: str) -> dict:
        """Đọc video clip -> Trả về ma trận heatmap kích thước 14x21 (lưới 5x5m)"""
        pass
```

---

## 4. Tiêu chí đánh giá & Nghiệm thu tự động (Autograder)
Hệ thống Autograder sẽ chạy kiểm thử độc lập không internet bên trong container:
1. **Độ chính xác nhận diện (mAP@0.5)**: Tối thiểu **75%** trên 5 frame test ẩn.
2. **Độ tương quan bản đồ nhiệt (Heatmap Correlation)**: Tối thiểu **80%** so khớp với `ground_truth_heatmap.json`.
3. **Tốc độ xử lý video (Performance)**: Đạt tối thiểu **≥ 15 FPS** khi chạy video tracking.
