"""Convert Unity-baked effect sequences into js/fx for this game, reusing 5_LAO_Defence/tools/build_fx.py.

python tools/build_fx_run.py [src_dir] name ...
  src_dir defaults to E:/LAO_MINI_GAME/_fxbake_lr/fx (the bake project's output: <name>.json + reference frames)
"""
import os, sys

DEF = r"E:/LAO_MINI_GAME/5_LAO_Defence/tools"
sys.path.insert(0, DEF)
import build_fx  # noqa: E402

HERE = os.path.dirname(os.path.abspath(__file__))
args = sys.argv[1:]
src = args.pop(0) if args and os.path.isdir(args[0]) else r"E:/LAO_MINI_GAME/_fxbake_lr/fx"
build_fx.SRC = src
build_fx.OUT = os.path.join(HERE, "..", "js", "fx")
names = args or sorted(os.path.splitext(f)[0] for f in os.listdir(src) if f.endswith(".json"))
for n in names:
    build_fx.build(n)
    print("baked", n)
