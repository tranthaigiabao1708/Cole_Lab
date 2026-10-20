import hashlib
import shutil
from pathlib import Path

from .config import settings


class LocalStorage:
    """Content-addressed blob storage on local disk (ADR 0006).

    Bucket classes mirror the production layout: `public`, `private`, `answer_key`.
    Keys are `<bucket>/<sha256[:2]>/<sha256>`; identical content is stored once.
    """

    BUCKETS = ("public", "private", "answer_key")

    def __init__(self, root: Path):
        self.root = root

    def _path(self, key: str) -> Path:
        p = (self.root / key).resolve()
        if self.root.resolve() not in p.parents:
            raise ValueError("invalid storage key")
        return p

    def put_bytes(self, bucket: str, data: bytes) -> tuple[str, str, int]:
        assert bucket in self.BUCKETS
        sha = hashlib.sha256(data).hexdigest()
        key = f"{bucket}/{sha[:2]}/{sha}"
        path = self._path(key)
        if not path.exists():
            path.parent.mkdir(parents=True, exist_ok=True)
            tmp = path.with_suffix(".tmp")
            tmp.write_bytes(data)
            tmp.replace(path)
        return key, sha, len(data)

    def put_file(self, bucket: str, src: Path) -> tuple[str, str, int]:
        h = hashlib.sha256()
        with src.open("rb") as f:
            for chunk in iter(lambda: f.read(1 << 20), b""):
                h.update(chunk)
        sha = h.hexdigest()
        key = f"{bucket}/{sha[:2]}/{sha}"
        path = self._path(key)
        if not path.exists():
            path.parent.mkdir(parents=True, exist_ok=True)
            shutil.copyfile(src, path)
        return key, sha, src.stat().st_size

    def get_bytes(self, key: str) -> bytes:
        return self._path(key).read_bytes()

    def local_path(self, key: str) -> Path:
        return self._path(key)


storage = LocalStorage(settings.storage_dir)
