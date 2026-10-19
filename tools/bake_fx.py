"""Bake original Unity effects that 5_LAO_Defence never needed (member bullets + their hits) for this game.

python tools/bake_fx.py            copy prefabs (GUIDs kept) into the bake project, run Unity, convert, register meta
Needs Unity 6000.0.58f2 and the bake project E:/LAO_MINI_GAME/_fxbake_lr (Assets/Editor/RefFx.cs).
"""
import glob, json, os, re, subprocess, sys

DEF = r"E:/LAO_MINI_GAME/5_LAO_Defence/tools"
sys.path.insert(0, DEF)
sys.path.insert(0, os.path.join(DEF, "unity_ref"))
import setup as S  # noqa: E402  (copy_asset with the GUID index)

HERE = os.path.dirname(os.path.abspath(__file__))
PROJ = r"E:/LAO_MINI_GAME/_fxbake_lr"
UNITY = r"C:/Program Files/Unity/Hub/Editor/6000.0.58f2/Editor/Unity.exe"
AB = r"E:/LAO_Google_QA/Assets/AssetBundleResource"
S.PROJ = PROJ

# member -> its own original bullet (Bullet_Effect) or strike effect
BULLETS = ["daphne_bullet", "FX_blackLilith_bullet", "Hraesvelgr_skill1_Lazer_bullet", "Khan_NS2_skill1_bullet",
           "Sylphid_NS1_skill2_bullet", "Brunhild_N_Skill1_bullet", "Titania_NS2_Skill1_bullet"]
STATICS = ["FX_HIT_Labiata_skill_2", "Saraqael_skill1_elec_hit", "Saraqael_skill2_Last_Hit", "LRL_skill2_glow",
           "Banshee_skill2_Ground_Hit", "Empress_skill2_swing_Hit", "Titania_skill1_iceKnife_hit",
           # signature skill effects (replace the procedural beams / glows)
           "Kunoichi_skill2_Sword_first_line_F", "Kunoichi_skill2_Hit_FX_F", "KunoichiZero_skill2_first_hit_F",
           "Brunhild_N_Skill2_A", "Brunhild_N_Skill1_A", "Brunhild_N_Skill1_Hit",
           "Empris_skill2_ground_Ice_road", "Empress_skill2_ice_first_Hit", "Empris_skill2_bomb_particle",
           "Saraqael_skill1_elec_lazer", "Saraqael_skill2_Last_Big_Hit", "Saraqael_skill2_Fire_lighting",
           "Labiata_skill2_blade_swing", "Labiata_skill1_hit", "brownie_shoot",
           "handgun_shot", "sniper_hit", "Emy_skill2_fire", "LRL_bling"] + sys.argv[1:]


def find_prefab(name):
    hits = glob.glob(f"{AB}/**/{name}.prefab", recursive=True)
    return hits[0].replace("\\", "/") if hits else None


def field(text, key, default=None):
    m = re.search(key + r": ([^\s]+)", text)
    return m.group(1) if m else default


def main():
    copied, jobs, meta = set(), [], {}
    statics = list(STATICS)
    for b in BULLETS:
        p = find_prefab(b)
        if not p: print("missing bullet", b); continue
        txt = open(p, encoding="utf-8", errors="ignore").read()
        T = float(field(txt, "_projectileEndTime", "0.2"))
        typ = int(field(txt, "_projectileType", "0") or 0)
        hit = field(txt, "_hitEffectName", "")
        rel = S.copy_asset(p, copied)
        jobs.append(f"{b}|{rel}|proj|{T}|8.0|{T + 0.1}|0:0,1:1")
        meta[b] = {"type": 0 if typ in (0, 3) and T <= 0.3 else 1, "T": T, "hit": hit if hit and hit != "noHit_m" else "", "hitScale": 1.0}
        if hit and hit != "noHit_m" and hit not in statics: statics.append(hit)
    for s in statics:
        p = find_prefab(s)
        if not p: print("missing static", s); continue
        rel = S.copy_asset(p, copied)
        jobs.append(f"{s}|{rel}|static|0|0|-1|")
    done = lambda j: os.path.exists(os.path.join(PROJ, "fx", j.split("|")[0] + ".json"))
    todo = [j for j in jobs if not done(j)]  # a re-run only bakes what is still missing
    open(os.path.join(PROJ, "fx_jobs.txt"), "w", encoding="utf-8").write("\n".join(todo) + "\n")
    print(len(jobs), "jobs,", len(todo), "to bake,", len(copied), "files copied")
    # with a GPU device: the reference frames are rendered (-nographics crashes on some particle shaders)
    r = subprocess.run([UNITY, "-batchmode", "-projectPath", PROJ, "-executeMethod", "RefFx.Run", "-logFile", os.path.join(PROJ, "fx.log")])
    print("unity exit", r.returncode)
    names = [j.split("|")[0] for j in jobs if os.path.exists(os.path.join(PROJ, "fx", j.split("|")[0] + ".json"))]
    print("baked json:", names)
    subprocess.run([sys.executable, os.path.join(HERE, "build_fx_run.py"), *names], check=True)
    # register the new projectiles (type / flight time / hit) in js/fx/_meta.js
    mp = os.path.join(HERE, "..", "js", "fx", "_meta.js")
    src = open(mp, encoding="utf-8").read()
    data = json.loads(src[src.index("=") + 1:].rstrip().rstrip(";"))
    for k, v in meta.items():
        if k in names:
            if v["hit"] and v["hit"] not in names: v["hit"] = ""
            data["meta"][k] = v
    open(mp, "w", encoding="utf-8").write("window.FX_META=" + json.dumps(data) + ";\n")
    print("meta", {k: v for k, v in meta.items() if k in names})


if __name__ == "__main__":
    main()
