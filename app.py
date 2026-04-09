from pathlib import Path
from fastapi import FastAPI, HTTPException, Query, Request
from fastapi.openapi.docs import get_redoc_html
from fastapi.responses import HTMLResponse
from fastapi.staticfiles import StaticFiles
from starlette.templating import Jinja2Templates
from databricks.sdk.runtime import dbutils
from databricks import sql
import requests
import time

# les noms des secrets (scope et clés) ont été modifiés par rapport à l'environnement de production.
SERVER_HOSTNAME = dbutils.secrets.get(scope="api-secrets", key="Databricks-ServerHostName")
WAREHOUSE_ID = dbutils.secrets.get(scope="api-secrets", key="WarehouseID")
ACCESS_TOKEN = dbutils.secrets.get(scope="api-secrets", key="Secret-Databricks")

BASE_DIR = Path(__file__).resolve().parent
P_FILES = ""
P_FILE_LIST = [t.strip() for t in P_FILES.split(",")]

app = FastAPI(redoc_url=None)
app.mount("/static", StaticFiles(directory="static"), name="static")
templates = Jinja2Templates(directory="templates")

def _db_headers():
    return {"Authorization": f"Bearer {ACCESS_TOKEN}", "Content-Type": "application/json"}

def _warehouse_url(path: str):
    return f"https://{SERVER_HOSTNAME}{path}"

def start_warehouse(warehouse_id: str, timeout_sec: int = 60, poll_interval: int = 2):
    requests.post(_warehouse_url(f"/api/2.0/sql/warehouses/{warehouse_id}/start"), headers=_db_headers(), timeout=10)
    deadline = time.time() + timeout_sec
    while time.time() < deadline:
        r = requests.get(_warehouse_url(f"/api/2.0/sql/warehouses/{warehouse_id}"), headers=_db_headers(), timeout=10)
        r.raise_for_status()
        state = r.json().get("state")
        if state in ("RUNNING", "RUNNING_OPTIMIZED"):
            return True
        if state in ("STOPPED", "DELETED", "DELETING", "FAILED"):
            raise RuntimeError(f"Warehouse state: {state}")
        time.sleep(poll_interval)
    raise TimeoutError("Warehouse start timed out")

conn = None

@app.on_event("startup")
def on_startup():
    global conn
    start_warehouse(WAREHOUSE_ID)
    conn = sql.connect(server_hostname=SERVER_HOSTNAME, http_path=f"/sql/1.0/warehouses/{WAREHOUSE_ID}", access_token=ACCESS_TOKEN)

@app.get("/redoc", include_in_schema=False)
def redoc():
    return get_redoc_html(title="databricks API", openapi_url=app.openapi_url, redoc_js_url="https://cdn.jsdelivr.net/npm/redoc@2/bundles/redoc.standalone.js")

@app.get("/", response_class=HTMLResponse, tags=["ui"])
def home(request: Request):
    return templates.TemplateResponse("home.html", {"request": request, "tables": P_FILE_LIST})

@app.get("/columns/{table}")
def get_columns(table: str):
    if table not in P_FILE_LIST:
        raise HTTPException(status_code=400, detail="Invalid table")
    cur = conn.cursor()
    cur.execute(f"SELECT * FROM catalog.{table} LIMIT 1")
    return [c[0] for c in cur.description]

@app.get("/rowcount/{table}")
def get_row_count(table: str):
    if table not in P_FILE_LIST:
        raise HTTPException(status_code=400, detail="Invalid table")
    cur = conn.cursor()
    cur.execute(f"SELECT COUNT(*) FROM catalog.schema.{table}")
    return {"row_count": cur.fetchone()[0]}

def make_route(table_name: str):
    async def route(top: int = Query(10, ge=1, le=5000), col: list[str] = Query(default=[]), val: list[str] = Query(default=[])):
        if table_name not in P_FILE_LIST:
            raise HTTPException(status_code=400, detail="Invalid table")
        cur = conn.cursor()
        cur.execute(f"SELECT * FROM catalog.schema.{table_name} LIMIT 1")
        valid_cols = [c[0] for c in cur.description]
        where, params = [], []
        for c, v in zip(col, val):
            if c in valid_cols:
                where.append(f"{c} = ?"); params.append(v)
        q = f"SELECT * FROM catalog.schema.{table_name}"
        if where: q += " WHERE " + " AND ".join(where)
        q += f" LIMIT {top}"
        cur.execute(q, params)
        rows = cur.fetchall()
        return [dict(zip(valid_cols, r)) for r in rows]
    route.__name__ = f"get_{table_name}"
    return route

for t in P_FILE_LIST:
    app.add_api_route(f"/{t}", make_route(t), methods=["GET"], tags=["data"])
