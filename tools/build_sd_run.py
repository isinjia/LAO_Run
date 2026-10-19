"""Build extra SD rigs (enemies 5_LAO_Defence never used) into this game's js/sd, reusing 5_LAO_Defence/tools/build_sd.py.

python tools/build_sd_run.py e_Wasp_N e_Stinger_N ...   (e_<Name> = Model_MP_<Name> under AssetBundleResource/monster)
"""
import os, sys

DEF = r"E:/LAO_MINI_GAME/5_LAO_Defence/tools"
sys.path.insert(0, DEF)
import build_sd as B  # noqa: E402

B.OUT = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "js", "sd")
for uid in sys.argv[1:]:
    name = uid[2:]
    B.ENEMIES.setdefault(name, "Model_MP_" + name)
    try:
        B.build(uid)
    except Exception as e:  # one broken prefab never stops the rest
        print("FAIL", uid, e)
