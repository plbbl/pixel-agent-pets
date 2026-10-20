"""Create transparent, chunked HD runtime sprites from the approved videos.

Uses the same 20Hz frame axis as the lightweight assets. Never upscales an 80px atlas.
See build-showcase.py for the local source manifest and Python dependency arguments.
"""
import argparse, hashlib, json, math, sys
from pathlib import Path
parser=argparse.ArgumentParser(description=__doc__)
parser.add_argument('--sources',required=True,type=Path)
parser.add_argument('--dependencies',action='append',default=[])
args=parser.parse_args();sys.path[:0]=args.dependencies
import cv2
import numpy as np
from PIL import Image, ImageChops
from asset_processing import matte,root_track
ROOT=Path(__file__).resolve().parents[1];OUT=ROOT/'assets-hd';OUT.mkdir(exist_ok=True)
manifest_file=OUT/'manifest.json'
manifest=json.loads(manifest_file.read_text()) if manifest_file.exists() else {'version':1,'processingVersion':2,'paletteColors':256,'characters':{}}
for character,items in json.loads(args.sources.read_text()).items():
    base=json.loads((ROOT/'assets'/character/'manifest.json').read_text())['animations']
    animations=manifest['characters'].setdefault(character,{'animations':{}})['animations']
    for action,source in items.items():
        if animations.get(action) and all((OUT/f).is_file() for variant in animations[action].values() for f in variant['files']):continue
        original=Path(source['path']).resolve();assert hashlib.sha256(original.read_bytes()).hexdigest()==source['sha256']
        speed=1.55 if character=='deepseek' and action=='fast' else 1
        cap=cv2.VideoCapture(str(original));rate=cap.get(cv2.CAP_PROP_FPS);frames=[];i=0;next_sample=0
        while True:
            ok,im=cap.read()
            if not ok:break
            time=i/rate/speed;i+=1
            if time+1e-6<next_sample:continue
            frames.append(im);next_sample+=.05
        cap.release();assert len(frames)==base[action]['frames'],f'Frame axis mismatch {character}/{action}'
        first=matte(frames[0],character);reference,track=root_track(frames,character,action,first)
        yy,_=np.nonzero(first);scale=54/(reference[1]-yy.min())
        directory=OUT/character/action;directory.mkdir(parents=True,exist_ok=True);variants={}
        for level in [160,320]:
            factor=level/80;width=round(base[action]['width']*factor);cells=[];previous=None
            for im,(cx,baseline) in zip(frames,track):
                alpha=matte(im,character)
                if np.count_nonzero(alpha)>=200:
                    image=Image.fromarray(np.dstack((cv2.cvtColor(im,cv2.COLOR_BGR2RGB),alpha)))
                    image=image.resize((round(im.shape[1]*scale*factor),round(im.shape[0]*scale*factor)),Image.Resampling.BOX)
                    cell=Image.new('RGBA',(width,level));cell.alpha_composite(image,(round(width/2-cx*scale*factor),round(67*factor-baseline*scale*factor)))
                    pixels=np.asarray(cell).copy();pixels[:,:,3]=np.where(pixels[:,:,3]>=128,255,0);pixels[pixels[:,:,3]==0,:3]=0
                    previous=Image.fromarray(pixels)
                assert previous is not None
                cells.append(previous)
            # One palette for the whole action prevents palette flicker at chunk boundaries.
            full=Image.new('RGBA',(width*4,level*math.ceil(len(cells)/4)))
            for index,cell in enumerate(cells):full.paste(cell,(index%4*width,index//4*level))
            alpha=full.getchannel('A')
            rgb=full.convert('RGB').quantize(colors=255,method=Image.Quantize.FASTOCTREE,dither=Image.Dither.NONE)
            indexed=rgb.point(lambda value:value+1)
            indexed.putpalette([0,0,0]+rgb.getpalette('RGB')[:255*3]);indexed.info['transparency']=0
            indexed.paste(0,mask=ImageChops.invert(alpha))
            assert ImageChops.difference(alpha,indexed.convert('RGBA').getchannel('A')).getbbox() is None
            full=indexed
            files=[]
            for offset in range(0,len(cells),16):
                count=min(16,len(cells)-offset);top=offset//4*level
                sheet=full.crop((0,top,width*4,top+level*math.ceil(count/4)))
                filename=f'{character}/{action}/{level}-{offset//16}.png'
                sheet.save(OUT/filename,optimize=True);files.append(filename)
            variants[str(level)]={'width':width,'height':level,'columns':4,'chunkFrames':16,'frames':len(frames),'fps':base[action]['fps'],'files':files}
        animations[action]=variants;manifest_file.write_text(json.dumps(manifest,ensure_ascii=False,indent=2)+'\n')
        print(character,action,len(frames),'160/320 chunks',flush=True);del frames
