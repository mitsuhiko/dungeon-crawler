"""Bake the :technoblade Easter egg onto the unchanged character-v1 UV atlas.
Adapted from the user-provided reference: pink pig face, jeweled gold crown,
red royal coat with white trim, gold buttons, chain-patterned trousers and black boots.
This is a paint layer on the game's rounded hero, not a replacement Minecraft mesh.

Blender -b blender/character.blend --python blender/skin_technoblade.py
The private screenshot is not copied into the game or required to regenerate this texture.
"""
from pathlib import Path
import sys
import numpy as np
import bpy
sys.path.insert(0,str(Path(__file__).resolve().parent))
from skin_ninjajavamc import bake, save_png


def paint(points):
    x,y,z=points.T
    cell=np.floor(points/.04).astype(np.int64)
    noise=((cell[:,0]*73856093)^(cell[:,1]*19349663)^(cell[:,2]*83492791))%5
    pink=np.array([[220,151,156],[231,168,170],[210,139,145],[224,156,160],[237,176,176]],np.uint8)
    red=np.array([[164,9,17],[183,12,19],[199,16,23],[173,7,16],[191,13,20]],np.uint8)
    gray=np.array([[48,48,49],[58,57,58],[65,64,65],[43,43,45],[53,52,53]],np.uint8)
    colors=pink[noise].copy()
    coat=(z>.70)&(z<1.45)
    colors[coat]=red[noise[coat]]
    # White shirt, narrow ermine coat borders, and three gold buttons on the front.
    front=y<-.075
    shirt=coat&front&(np.abs(x)<.085)&(z>.78)
    colors[shirt]=[237,237,224]
    trim=coat&front&(np.abs(x)>.085)&(np.abs(x)<.115)&(z>.76)
    colors[trim]=[191,196,190]
    hem=coat&(z<.76)&(np.abs(x)<.25)
    colors[hem]=[224,227,213]
    collar=front&(z>1.33)&(z<1.43)&(np.abs(x)<.16)
    colors[collar]=[238,237,220]
    for height in [.88,1.05,1.22]:
        button=shirt&(np.abs(x)<.022)&(np.abs(z-height)<.023)
        colors[button]=[246,210,39]
    # The cuffs stop before the pink hands; no red paint leaking onto fingers.
    cuff=(np.abs(x)>.30)&(z>.89)&(z<.99)
    colors[cuff]=[225,225,212]
    hands=(np.abs(x)>.29)&(z<.89)&(z>.59)
    colors[hands]=pink[noise[hands]]
    trousers=(z<.70)&(np.abs(x)<.3)
    colors[trousers]=gray[noise[trousers]]
    chain=trousers&(z>.27)&(z<.62)&(y<-.025)
    pattern=(np.floor((x+z)*16).astype(np.int64)%5==0)|(np.floor((x-z)*16).astype(np.int64)%5==0)
    colors[chain&pattern]=[139,140,137]
    boots=z<.16
    colors[boots]=[17,17,19]
    # Square eyes and a two-nostril pig snout, only on the face (-Y).
    face=(z>1.47)&(y<-.14)
    whites=face&(np.abs(np.abs(x)-.10)<.037)&(z>1.725)&(z<1.785)
    colors[whites]=[246,241,225]
    pupils=whites&(np.abs(np.abs(x)-.09)<.019)
    colors[pupils]=[20,13,16]
    snout=face&(np.abs(x)<.10)&(z>1.58)&(z<1.68)&(y<-.19)
    colors[snout]=[237,170,175]
    nostrils=snout&(np.abs(np.abs(x)-.043)<.018)&(z>1.61)&(z<1.64)
    colors[nostrils]=[155,86,99]
    # The crown wraps round the scalp; alternate high teeth leave pink gaps between them.
    angle=np.arctan2(x,-y)
    teeth=(np.floor((angle+np.pi)*12/np.pi).astype(np.int64)%2)==0
    crown=(z>1.835)&((z<1.89)|teeth)
    colors[crown]=[233,193,27]
    edge=crown&(z>1.835)&(z<1.85)
    colors[edge]=[168,135,15]
    gems=face&crown&(z>1.855)&(z<1.885)
    colors[gems&(np.abs(x)<.028)]=[43,74,205]
    colors[gems&(np.abs(x+.14)<.025)]=[160,39,87]
    colors[gems&(np.abs(x-.14)<.025)]=[77,167,68]
    return colors


if __name__=='__main__':
    root=Path(__file__).resolve().parent.parent
    save_png(root/'assets/skins/technoblade.png',bake(bpy.data.objects['Character'],paint))
