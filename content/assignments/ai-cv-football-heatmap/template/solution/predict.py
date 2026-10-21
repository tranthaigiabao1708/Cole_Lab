"""
HỌC VIÊN HOÀN THIỆN CÁC PHƯƠNG THỨC TRONG LỚP VideoAnalyzer.
Hệ thống chấm điểm tự động (Autograder) sẽ trực tiếp nạp lớp này để kiểm thử:
1. Gọi process_frame(frame) trên tập ảnh test ẩn trong data/test/
2. Gọi analyze_video(video_path) trên video thực tế trong data/test_videos/
"""
import cv2
import numpy as np


class VideoAnalyzer:
    def __init__(self):
        """Khởi tạo mô hình detector hoặc nạp trọng số YOLO/OpenCV tại đây."""
        self.team_colors = {
            "team_red": [0, 0, 255],
            "team_yellow": [0, 255, 255]
        }
        self.pitch_length = 105.0 # Chiều dài sân (mét)
        self.pitch_width = 68.0   # Chiều rộng sân (mét)

    def process_frame(self, frame: np.ndarray) -> dict:
        """
        Xử lý 1 frame ảnh (OpenCV BGR ndarray).
        Trả về danh sách bounding boxes và nhãn cầu thủ/bóng.
        Format trả về:
        {
            'players_count': int,
            'boxes': [[x1, y1, x2, y2], ...],
            'labels': ['player_red', 'player_yellow', 'ball', 'referee'],
            'confidences': [0.95, ...]
        }
        """
        h, w, _ = frame.shape
        dummy_boxes = [
            [int(w * 0.4), int(h * 0.5), int(w * 0.45), int(h * 0.65)],
            [int(w * 0.6), int(h * 0.4), int(w * 0.65), int(h * 0.55)],
        ]
        return {
            "players_count": len(dummy_boxes),
            "boxes": dummy_boxes,
            "labels": ["player_red", "player_yellow"],
            "confidences": [0.92, 0.88]
        }

    def analyze_video(self, video_path: str) -> dict:
        """
        Đọc và theo dõi chuỗi video trận đấu.
        Trả về thống kê chuyển động và ma trận bản đồ nhiệt (Pitch Heatmap).
        """
        cap = cv2.VideoCapture(video_path)
        frame_count = 0
        total_players_seen = 0
        heatmap_grid = np.zeros((14, 21), dtype=float)

        while cap.isOpened():
            ret, frame = cap.read()
            if not ret:
                break
            frame_count += 1
            if frame_count % 5 == 0:
                res = self.process_frame(frame)
                total_players_seen += res["players_count"]
                heatmap_grid[6:8, 9:12] += 1.0

        cap.release()
        max_val = np.max(heatmap_grid)
        if max_val > 0:
            heatmap_grid = heatmap_grid / max_val

        return {
            "total_frames_processed": frame_count,
            "avg_players_per_frame": round(total_players_seen / max(1, frame_count // 5), 1),
            "heatmap_matrix": heatmap_grid.tolist(),
            "status": "completed"
        }


def predict(input_data: dict) -> dict:
    """Wrapper hỗ trợ gọi nhanh từ CLI hoặc Autograder kiểm tra ảnh đơn"""
    analyzer = VideoAnalyzer()
    frame = input_data.get("frame")
    if frame is None and "image_path" in input_data:
        frame = cv2.imread(input_data["image_path"])
    if frame is None:
        return {"error": "No valid frame provided"}
    return analyzer.process_frame(frame)
