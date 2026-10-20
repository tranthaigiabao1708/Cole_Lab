import os

import uvicorn

if __name__ == "__main__":
    uvicorn.run("cole_runner.app:app", host=os.environ.get("COLE_RUNNER_HOST", "127.0.0.1"),
                port=int(os.environ.get("COLE_RUNNER_PORT", "8090")), log_level="info")
