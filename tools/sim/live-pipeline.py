"""A live check of the whole privacy pipeline against the deployed site: a small game (3 invented people, one marked organizer) is created, left to run
through its schedule, and the lifecycle tick (the scheduled job's own call) is made until the report e-mail goes out.
Usage: python tools/sim/live-pipeline.py <alias-email>   (the report is e-mailed to that address; takes about 16 minutes)"""
import json, sys, time, urllib.request, urllib.error
BASE = "https://corporate-tambola.pages.dev"
G = 1692803367
email = sys.argv[1]
secrets = dict(l.strip().split("=", 1) for l in open(r"C:\ct\tambola\config\live-secrets.txt") if "=" in l)

def call(method, path, body=None, headers=None):
    h = {"content-type": "application/json", "user-agent": "tambola-live-check", **(headers or {})}
    req = urllib.request.Request(BASE + path, method=method, headers=h, data=None if body is None else json.dumps(body).encode())
    try:
        with urllib.request.urlopen(req, timeout=30) as r: return r.status, json.loads(r.read() or b"{}")
    except urllib.error.HTTPError as e:
        try: return e.code, json.loads(e.read() or b"{}")
        except Exception: return e.code, {}
def log(*a): print(time.strftime("%H:%M:%S"), *[str(x).encode("ascii", "replace").decode() for x in a], flush=True)

st, s = call("POST", "/api/start", {"email": email}); log("account", st, "exists" if s.get("exists") else "ok")
tok = {"x-organizer": s["token"]}
rnd = lambda t: int((t - G) // 3) + 1
start_ms = time.time() + 100
eid = "LIVEPIPE" + str(int(time.time()) % 100000)
log("create", call("POST", "/api/z", {"id": eid, "startRound": rnd(start_ms), "callSeconds": 6, "cap": 20}, tok)[0])
log("invites", call("PATCH", f"/api/z/{eid}/settings", {"invites": {"on": True, "per": 4, "cats": ["family", "colleagues"]}}, tok)[0])
log("publish", call("POST", f"/api/z/{eid}/publish", {"email": email, "phone": "9811122233"}, tok)[0])
people = [("Olga Organizer", "9876500001", None), ("Guest \u0905\u0928\u093f\u0924\u093e", "9876500002", 1), ("Bala Nair", "9876500003", 2)]
for i, (name, ph, frm) in enumerate(people, 1):
    body = {"phone": ph, "name": name, "device": str(i).zfill(32).replace("0", "a")}
    if frm: body.update({"from": frm, "cat": "colleagues"})
    st, r = call("POST", f"/api/z/{eid}/join", body); log("join", name.split()[0], st, r.get("pid"))
log("mark organizer", call("POST", f"/api/z/{eid}/mark", {"phone": "9876500001", "role": "organizer"}, tok)[0])
st, names = call("GET", f"/api/z/{eid}/participants", None, tok); log("participants endpoint carries names?", "Olga" in json.dumps(names) or "Bala" in json.dumps(names))
pids = ",".join(p["pid"] for p in names["participants"])
st, nm = call("GET", f"/api/z/{eid}/names?pids={pids}", None, tok); log("names (organizer only)", sorted(nm.get("names", {}).values()))
st, life = call("GET", f"/api/z/{eid}/life", None, tok); log("life", json.dumps(life))
end_ms = life["endMs"] / 1000
log("waiting for the game to end at", time.strftime("%H:%M:%S", time.localtime(end_ms)), "then the report starts 3 minutes later")
while time.time() < end_ms + 200: time.sleep(20)
for i in range(40):
    st, r = call("POST", "/api/lifecycle/tick", {}, {"x-cron-key": secrets["CRON_KEY"]}); log("tick", st, json.dumps(r))
    st, life = call("GET", f"/api/z/{eid}/life", None, tok)
    if life.get("reportSent"): break
    time.sleep(20)
log("report sent:", life.get("reportSent"), "state:", life.get("reportState"))
print("EID", eid)
