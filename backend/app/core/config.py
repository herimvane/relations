class Settings:
    cors_origins: list[str] = ["http://localhost:5173", "http://127.0.0.1:5173"]
    cors_origin_regex: str = r"http://(localhost|127\.0\.0\.1):517\d"


settings = Settings()
