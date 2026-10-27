"""Export the local Qualmos prototype from the authored .blend.
Blender -b --python blender/qualmos.py -- [source.blend] [output.glb]
Input must have the 14 Boss* concept actions. Joins parts into one skinned mesh
with <=12 material primitives, as render/enemymodel.js requires.
"""
from pathlib import Path
import math, sys
import bpy

ROOT=Path(__file__).resolve().parents[1]
args=sys.argv[sys.argv.index('--')+1:] if '--' in sys.argv else []
source=Path(args[0]) if args else ROOT/'blender/qualmos.blend'
output=Path(args[1]) if len(args)>1 else ROOT/'assets/qualmos.glb'
bpy.ops.wm.open_mainfile(filepath=str(source))
rig=bpy.data.objects['BOSS RIG | Select to view actions']
rig.animation_data.action=None
for t in rig.animation_data.nla_tracks:t.mute=True
bpy.context.scene.frame_set(1)
for p in rig.pose.bones:
    p.location=(0,0,0);p.rotation_euler=(0,0,0);p.scale=(1,1,1)
bpy.context.view_layer.update()
# A death clip rather than reusing an attack as the death pose.
action=bpy.data.actions.new('BossDeath');action.use_fake_user=True
rig.animation_data.action=action
for f in range(1,77):
    t=(f-1)/75;u=min(1,t/.75);u=u*u*(3-2*u)
    for p in rig.pose.bones:
        p.location=(0,0,0);p.rotation_euler=(0,0,0);p.scale=(1,1,1)
    rig.pose.bones['body'].rotation_euler.x=.6*u
    rig.pose.bones['head'].rotation_euler.x=.4*u
    rig.pose.bones['body'].location.y=-.6*u
    for side,s in [('L',1),('R',-1)]:rig.pose.bones['arm.'+side].rotation_euler.z=s*.3*u
    for p in rig.pose.bones:
        p.keyframe_insert('location',frame=f,group=p.name)
        p.keyframe_insert('rotation_euler',frame=f,group=p.name)
        p.keyframe_insert('scale',frame=f,group=p.name)
rig.animation_data.action=None
for p in rig.pose.bones:
    p.location=(0,0,0);p.rotation_euler=(0,0,0);p.scale=(1,1,1)
bpy.context.view_layer.update()
# Join at the rest pose; leave one armature modifier, preserving all vertex groups.
meshes=[o for o in bpy.data.collections['BOSS | Amphibious creature concept'].objects if o.type=='MESH']
bpy.ops.object.select_all(action='DESELECT')
for o in meshes:o.select_set(True)
bpy.context.view_layer.objects.active=meshes[0]
bpy.ops.object.join()
body=bpy.context.object;body.name='QualmosBody'
# Decimate before skinning for a responsive prototype, not a production retopology.
mod=body.modifiers.new('Prototype mesh reduction','DECIMATE');mod.ratio=.42
bpy.ops.object.modifier_move_up(modifier=mod.name)
bpy.ops.object.modifier_apply(modifier=mod.name)
body.parent=rig
rig.name='QualmosRig'
assert len(body.data.materials)<=12,len(body.data.materials)
bpy.ops.object.select_all(action='DESELECT');body.select_set(True);rig.select_set(True)
bpy.context.view_layer.objects.active=rig
for a in bpy.data.actions:
    if a.name.startswith('Boss'):a.use_fake_user=True
bpy.data.actions['BossWalk']['speed']=1.7
bpy.ops.export_scene.gltf(filepath=str(output),export_format='GLB',use_selection=True,
    export_animations=True,export_animation_mode='ACTIONS',export_force_sampling=True,
    export_frame_range=False,export_extras=True,export_cameras=False,export_lights=False,
    export_texcoords=False)
print('QUALMOS_EXPORTED',output,len(body.data.vertices),'vertices',len(body.data.materials),'materials')
