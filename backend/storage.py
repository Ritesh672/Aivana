# where uploaded files live: supabase storage when configured, otherwise a
# local folder. the rest of the app only calls save / load / delete
import httpx

from config import SUPABASE_BUCKET, SUPABASE_SERVICE_KEY, SUPABASE_URL, UPLOAD_DIR


class LocalStorage:
    def __init__(self, root):
        self.root = root

    def _path(self, key):
        path = (self.root / key).resolve()
        if not path.is_relative_to(self.root.resolve()):
            raise ValueError("invalid storage key")
        return path

    def save(self, key, data, content_type):
        path = self._path(key)
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_bytes(data)

    def load(self, key):
        return self._path(key).read_bytes()

    def delete(self, key):
        self._path(key).unlink(missing_ok=True)


class SupabaseStorage:
    """Supabase storage through its rest api, in a private bucket."""

    def __init__(self, url, service_key, bucket):
        self.base = f"{url}/storage/v1"
        self.bucket = bucket
        self.headers = {"Authorization": f"Bearer {service_key}", "apikey": service_key}
        self._bucket_ready = False

    def _ensure_bucket(self):
        if self._bucket_ready:
            return
        response = httpx.post(
            f"{self.base}/bucket", headers=self.headers, timeout=30,
            json={"id": self.bucket, "name": self.bucket, "public": False},
        )
        # an existing bucket answers with an "already exists" error, which is fine
        if response.status_code >= 400 and "exist" not in response.text.lower():
            response.raise_for_status()
        self._bucket_ready = True

    def save(self, key, data, content_type):
        self._ensure_bucket()
        response = httpx.post(
            f"{self.base}/object/{self.bucket}/{key}", content=data, timeout=120,
            headers={**self.headers, "Content-Type": content_type, "x-upsert": "true"},
        )
        response.raise_for_status()

    def load(self, key):
        response = httpx.get(f"{self.base}/object/{self.bucket}/{key}", headers=self.headers, timeout=120)
        response.raise_for_status()
        return response.content

    def delete(self, key):
        response = httpx.request(
            "DELETE", f"{self.base}/object/{self.bucket}", headers=self.headers, timeout=30,
            json={"prefixes": [key]},
        )
        response.raise_for_status()


def _make_storage():
    if SUPABASE_URL and SUPABASE_SERVICE_KEY:
        return SupabaseStorage(SUPABASE_URL, SUPABASE_SERVICE_KEY, SUPABASE_BUCKET)
    return LocalStorage(UPLOAD_DIR)


storage = _make_storage()
