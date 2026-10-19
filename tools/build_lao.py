"""Pull original Last Origin assets into the runner (python tools/build_lao.py [voice|sfx|ann|cutin|icons|all]).

voice : per member skill / sortie / MVP / retreat lines (mp3)        -> assets/voice/<id>_<k>.mp3
sfx   : per member skill sounds (wav, downmixed to 22 kHz mono)     -> assets/csfx/<id>_s1.wav, _s2.wav
ann   : minigame announcer lines (wav, 22 kHz mono)                 -> assets/ann/<name>.wav
cutin : upper-body crops of the full-body illustrations (webp)      -> assets/cut/<id>.webp
icons : resource icons from the UI atlas for jellies / coins (webp) -> assets/img/res_<name>.webp
"""
import glob, os, re, shutil, sys, wave
import numpy as np
from PIL import Image

AB = 'E:/LAO_Google_QA/Assets/AssetBundleResource'
ABS = 'E:/LAO_Google_QA/Assets/AssetBundleResourceSub'
ANN = 'E:/LAO_MINI_GAME/미니게임 음성/음성파일'
OUT = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..')

# member id -> (voice folder, fullbody name, sfx folder)
M = {
    'brownie': ('Brownie', 'BR_Brownie', 'Brownie'), 'leprechaun': ('Leprechaun', 'BR_Leprechaun', 'Leprechaun'),
    'valkyrie': ('Valkyrie', 'BR_Valkyrie', 'Valkyrie'), 'zero': ('KunoichiZero', 'DS_KunoichiZero', 'Kunoichi'),
    'phoenix': ('Phoenix', 'BR_Phoenix', None), 'labiata': ('Labiata', '3P_Labiata', 'Labiata'), 'lrl': ('LRL', 'PECS_LRL', 'LRL'),
    'harpy': ('Harpy', 'BR_Harpy', None), 'impet': ('Impet', 'BR_Impet', 'Impet'), 'gnome': ('Gnome', 'BR_Gnome', None),
    'daphne': ('Daphne', '3P_Daphne', 'Daphne'), 'banshee': ('Banshee', 'BR_Banshee', 'Banshee'), 'sylphid': ('Sylphid', 'BR_Sylphid', 'Sylphid'),
    'raven': ('Raven', 'BR_Raven', None), 'nymph': ('Nymph', 'BR_Nymph', 'Nymph'), 'amy': ('Amy', 'BR_Amy', 'Amy'),
    'saraqael': ('Saraqael', 'DS_Saraqael', None), 'thetis': ('Thetis', 'BR_Thetis', None), 'undine': ('Undine', 'BR_Undine', None),
    'hraesvelgr': ('Hraesvelgr', 'BR_Hraesvelgr', None), 'hela': ('Hela', 'BR_Hela', None), 'azazel': ('Azazel', 'DS_Azazel', 'Azazel'),
    'leona': ('Leona', 'BR_Leona', 'Leona'), 'blacklilith': ('BlackLilith', '3P_BlackLilith', 'BlackLilith'), 'tiamat': ('Tiamat', 'ST_Tiamat', 'Tiamat'),
    'khan': ('Khan', 'BR_Khan', 'Khan'), 'brunhild': ('Brunhild', 'BR_Brunhild', None), 'titania': ('Titania', '3P_Titania', None),
    'empress': ('Empress', 'PECS_Empress', None),
}


def wav_small(src, dst, max_sec=2.6, rate=22050):
    """downmix / resample a PCM wav to 16-bit mono (linear interpolation), with a short fade out"""
    with wave.open(src, 'rb') as w:
        ch, sw, fr, n = w.getnchannels(), w.getsampwidth(), w.getframerate(), w.getnframes()
        raw = w.readframes(n)
    if sw == 2:
        a = np.frombuffer(raw, np.int16).astype(np.float32) / 32768
    elif sw == 3:
        b = np.frombuffer(raw, np.uint8).reshape(-1, 3)
        a = ((b[:, 0].astype(np.int32) | (b[:, 1].astype(np.int32) << 8) | (b[:, 2].astype(np.int32) << 16)) << 8 >> 8).astype(np.float32) / 8388608
    elif sw == 4:
        a = np.frombuffer(raw, np.int32).astype(np.float32) / 2147483648
    elif sw == 1:
        a = (np.frombuffer(raw, np.uint8).astype(np.float32) - 128) / 128
    else:
        raise ValueError(sw)
    a = a.reshape(-1, ch).mean(axis=1)
    a = a[: int(fr * max_sec)]
    m = max(1, int(len(a) * rate / fr))
    a = np.interp(np.linspace(0, len(a) - 1, m), np.arange(len(a)), a)
    f = min(len(a), int(rate * 0.12))
    if f: a[-f:] *= np.linspace(1, 0, f)
    os.makedirs(os.path.dirname(dst), exist_ok=True)
    with wave.open(dst, 'wb') as w:
        w.setnchannels(1); w.setsampwidth(2); w.setframerate(rate)
        w.writeframes((np.clip(a, -1, 1) * 32767).astype(np.int16).tobytes())


def voice():
    out = os.path.join(OUT, 'assets/voice')
    os.makedirs(out, exist_ok=True)
    got = 0
    for mid, (vf, _, _) in M.items():
        for key, sit in [('skill', 'SpSkill'), ('start', 'StageStart'), ('mvp', 'MVP'), ('hurt', 'Retreat')]:
            cands = [f for f in glob.glob(f'{AB}/Sounds/Voice/{vf}/*_{sit}.mp3')]
            if not cands and key == 'skill':
                cands = glob.glob(f'{AB}/Sounds/Voice/{vf}NS1/*_{sit}.mp3')
            if cands:
                shutil.copyfile(sorted(cands)[0], f'{out}/{mid}_{key}.mp3'); got += 1
            else:
                print('  no voice', mid, sit)
    print('voice files', got)


def pick(files, pats):
    for p in pats:
        c = [f for f in files if re.search(p, os.path.basename(f), re.I)]
        if c:
            full = [f for f in c if 'FULL' in f.upper()]
            return (full or sorted(c, key=len))[0]
    return None


def sfx():
    got = 0
    for mid, (_, _, sf) in M.items():
        if not sf: continue
        files = glob.glob(f'{AB}/Sounds/SFX/Character/{sf}/*.wav')
        s1 = pick(files, [r'skill1', r'spell1', r'sound_01', r'Fly_Sound_02', r'Noise'])
        s2 = pick(files, [r'skill2', r'spell2', r'sound_02', r'Fly_Sound_03', r'Noise'])
        for k, f in (('s1', s1), ('s2', s2)):
            if f:
                try: wav_small(f, os.path.join(OUT, f'assets/csfx/{mid}_{k}.wav')); got += 1
                except Exception as e: print('  sfx fail', mid, f, e)
    print('char sfx', got)


ANN_PICK = ['GameStart-1', 'GameStart-2', 'StageStart-1', 'Combo-1', 'Combo-2', 'Combo-3', 'Good-1', 'Great-1', 'Nice-1', 'Perfect-1', 'Aamazing-1',
            'BossAlert-1', 'Danger-1', 'Becareful-1', 'HP_Low-1', 'StageClear-1', 'Clear-1', 'GameOver-1', 'LevelUp-1', 'Success-1', 'Hit-1', 'Miss-1']


def ann():
    for n in ANN_PICK:
        wav_small(f'{ANN}/Minigame_Voice_{n}.wav', os.path.join(OUT, f'assets/ann/{n}.wav'), max_sec=3.0)
    print('announcer', len(ANN_PICK))


def cutin():
    out = os.path.join(OUT, 'assets/cut')
    os.makedirs(out, exist_ok=True)
    for mid, (_, fb, _) in M.items():
        base = f'{ABS}/Texture/FullbodyImg/FullbodyIMG_{fb}_N'
        if os.path.exists(base + '.png'):
            im = Image.open(base + '.png').convert('RGBA')
        else:
            parts = sorted(glob.glob(base + '_[pP]art*.png'))
            if not parts:
                # whole-body art only exists for a skin: fall back to it
                alt = sorted(glob.glob(f'{ABS}/Texture/FullbodyImg/FullbodyIMG_{fb}_NS*.png'))
                if not alt: print('  no fullbody', mid); continue
                im = Image.open(alt[0]).convert('RGBA')
            else:
                im = Image.new('RGBA', Image.open(parts[0]).size)
                for p in parts: im.alpha_composite(Image.open(p).convert('RGBA'))
        bb = im.getchannel('A').point(lambda v: 255 if v > 24 else 0).getbbox()
        if not bb: continue
        x0, y0, x1, y1 = bb
        w = x1 - x0
        # upper body: a 4:3 box from the top of the figure, centred on the upper half
        top = im.crop((x0, y0, x1, y0 + max(1, (y1 - y0) // 2))).getchannel('A').point(lambda v: 255 if v > 24 else 0).getbbox()
        cx = x0 + ((top[0] + top[2]) // 2 if top else w // 2)
        cw = min(w, int((y1 - y0) * 0.55)); ch = int(cw * 0.78)
        box = (max(0, cx - cw // 2), y0, min(im.width, cx + cw // 2), min(im.height, y0 + ch))
        crop = im.crop(box)
        crop.thumbnail((560, 560), Image.LANCZOS)
        crop.save(f'{out}/{mid}.webp', quality=86)
    print('cut-ins', len(glob.glob(out + '/*.webp')))


def atlas_rects(prefab):
    txt = open(prefab, encoding='utf8', errors='ignore').read()
    rects = {}
    for m in re.finditer(r'name: (\S+)\s+x: (\d+)\s+y: (\d+)\s+width: (\d+)\s+height: (\d+)', txt):
        rects[m.group(1)] = tuple(int(m.group(i)) for i in range(2, 6))
    return rects


def icons():
    want = {'power': 'UI_Icon_Currency_Power', 'nutrient': 'UI_Icon_Currency_Nutrient', 'metal': 'UI_Icon_Currency_Metal',
            'parts': 'UI_Icon_Consumable_Resource_Parts_T3', 'goldcoin': 'Old Gold', 'medal': 'OrcaMedal', 'goldbar': 'GoldBar'}
    done = {}
    for name in ['ItemIcon_Consumable', 'ItemIcon_ShopItem', 'masterAtlas']:
        png = f'{AB}/Atlas/{name}.png'
        pre = [p for p in glob.glob(f'{AB}/Atlas/{name}.*') if p.endswith(('.prefab', '.asset'))]
        if not os.path.exists(png) or not pre: continue
        rects = atlas_rects(pre[0])
        im = None
        for k, pat in want.items():
            if k in done: continue
            hit = [n for n in rects if pat.replace(' ', '') in n.replace(' ', '') and not n.endswith(('_S', '_Pic'))]
            if not hit: continue
            n = sorted(hit, key=len)[0]
            x, y, w, h = rects[n]
            im = im or Image.open(png).convert('RGBA')
            crop = im.crop((x, y, x + w, y + h))
            os.makedirs(os.path.join(OUT, 'assets/img'), exist_ok=True)
            crop.save(os.path.join(OUT, f'assets/img/res_{k}.webp'), quality=92)
            done[k] = n
    print('icons', done)


if __name__ == '__main__':
    what = sys.argv[1:] or ['all']
    for f in (voice, sfx, ann, cutin, icons):
        if 'all' in what or f.__name__ in what:
            f()
