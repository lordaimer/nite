import uvicorn
from config import API_CONFIG

if __name__ == "__main__":
    uvicorn.run(
        "main:app",
        host=API_CONFIG["host"],
        port=API_CONFIG["port"],
        reload=API_CONFIG["debug"]
    )
