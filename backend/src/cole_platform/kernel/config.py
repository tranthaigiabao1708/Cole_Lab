from pathlib import Path

from pydantic_settings import BaseSettings, SettingsConfigDict

REPO_ROOT = Path(__file__).resolve().parents[4]


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_prefix="COLE_", env_file=".env", extra="ignore")

    env: str = "dev"
    var_dir: Path = REPO_ROOT / "var"
    database_url: str = ""
    session_ttl_hours: int = 12
    cookie_secure: bool = False
    cors_origins: list[str] = ["http://localhost:5173", "http://127.0.0.1:5173"]

    # Runner (execution plane). API/worker never talk to Docker directly.
    runner_url: str = "http://127.0.0.1:8090"
    runner_token: str = "dev-runner-token-change-me"

    # Content packages (assignments, course seeds)
    content_dir: Path = REPO_ROOT / "content"
    simulators_dir: Path = REPO_ROOT / "simulators"

    @property
    def storage_dir(self) -> Path:
        return self.var_dir / "storage"

    @property
    def workspaces_dir(self) -> Path:
        return self.var_dir / "workspaces"

    @property
    def datasets_dir(self) -> Path:
        return self.var_dir / "datasets"

    @property
    def exchange_dir(self) -> Path:
        return self.var_dir / "exchange"

    # LLM gateway (Phase 5). provider=mock is deterministic and clearly labelled; real providers via env.
    llm_provider: str = "mock"
    llm_base_url: str = ""
    llm_api_key: str = ""
    llm_model: str = "mock-deterministic-1"
    llm_run_budget_tokens: int = 200_000
    # How containers reach the API's gateway (Docker Desktop: host.docker.internal).
    llm_upstream_for_containers: str = "http://host.docker.internal:8000/api/llm"

    worker_poll_s: float = 1.0
    # Seconds beyond a run's own timeout before the worker declares it lost (chaos: worker crash mid-run).
    stale_run_grace_s: int = 180
    stale_scan_interval_s: float = 30.0

    # Unit prices for cost/run (docs/design/13 §2). 0 = not configured; no price is assumed until Q-02/Q-03 are settled.
    price_vcpu_hour_usd: float = 0.0
    price_gb_ram_hour_usd: float = 0.0

    @property
    def db_url(self) -> str:
        return self.database_url or f"sqlite:///{(self.var_dir / 'cole.db').as_posix()}"


settings = Settings()
