window.GRIT_API_URL =
  location.hostname === "localhost" ||
  location.hostname === "127.0.0.1" ||
  location.protocol === "file:"
    ? "http://localhost:3000"
    : "";
