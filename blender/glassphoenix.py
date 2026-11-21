"""Original rideable glass phoenix, with takeoff / flight / landing clips.
Blender -b --python blender/glassphoenix.py
Writes assets/glassphoenix.glb, blender/glassphoenix.blend and an ignored preview.
"""
from pathlib import Path
import math
import bpy
from mathutils import Vector, Quaternion
ROOT=Path(__file__).resolve().parents[1]
bpy.ops.wm.read_factory_settings(use_empty=True)
scene=bpy.context.scene
scene.render.fps=30

def mat(name,color,alpha=1,emission=0):
    m=bpy.data.materials.new(name);m.use_nodes=True
    p=m.node_tree.nodes.get('Principled BSDF')
    p.inputs['Base Color'].default_value=(*color,alpha)
    p.inputs['Alpha'].default_value=alpha
    p.inputs['Metallic'].default_value=.18;p.inputs['Roughness'].default_value=.15
    p.inputs['Emission Color'].default_value=(*color,1);p.inputs['Emission Strength'].default_value=emission
    if alpha<1:m.surface_render_method='DITHERED'
    return m
GLASS=mat('Phoenix | turquoise star-glass',(.12,.66,.62),.72,.08)
PALE=mat('Phoenix | clear feather tips',(.50,.90,.80),.65,.1)
AMBER=mat('Phoenix | amber fire in the glass',(1,.47,.07),1,.7)
DARK=mat('Phoenix | dark glass eyes',(.012,.045,.055),1,.03)
parts=[]
def finish(o,name,material,bone):
    o.name=name;o.data.materials.append(material)
    bpy.context.view_layer.objects.active=o
    bpy.ops.object.transform_apply(location=True,rotation=True,scale=True)
    parts.append((o,bone));return o

def orb(name,p,s,material=GLASS,bone='body'):
    bpy.ops.mesh.primitive_ico_sphere_add(subdivisions=2,radius=1,location=p)
    o=bpy.context.object;o.scale=s;return finish(o,name,material,bone)
def rod(name,a,b,r,material=AMBER,bone='body'):
    a,b=Vector(a),Vector(b);d=b-a
    bpy.ops.mesh.primitive_cone_add(vertices=6,radius1=r,radius2=r*.65,depth=d.length,location=(a+b)/2)
    o=bpy.context.object;o.rotation_euler=d.to_track_quat('Z','Y').to_euler()
    return finish(o,name,material,bone)
def feather(name,a,b,width,bone,material=GLASS):
    a,b=Vector(a),Vector(b);d=b-a
    across=Vector((0,1,.04)).cross(d).normalized()*width
    middle=a+d*.48
    thick=Vector((0,0,.035))
    rim=[a,middle+across,b,middle-across]
    vertices=[tuple(v+thick) for v in rim]+[tuple(v-thick) for v in rim]
    faces=[(0,1,2),(0,2,3),(4,6,5),(4,7,6),(0,4,5,1),(1,5,6,2),(2,6,7,3),(3,7,4,0)]
    mesh=bpy.data.meshes.new(name);mesh.from_pydata(vertices,[],faces);mesh.update()
    o=bpy.data.objects.new(name,mesh);scene.collection.objects.link(o);o.data.materials.append(material);parts.append((o,bone))
    rod(name+' | glowing quill',a,b,.012,AMBER,bone)
    return o
# Upright, swept-neck silhouette; forward is -Y, as on the game's other models.
orb('Phoenix | breast',(0,0,0),(.55,.78,.54))
orb('Phoenix | shoulders',(0,-.12,.25),(.48,.52,.48))
orb('Phoenix | rising neck',(0,-.47,.59),(.24,.31,.58))
orb('Phoenix | noble head',(0,-.67,1.03),(.24,.34,.26))
rod('Phoenix | pointed beak',(0,-.91,1.03),(0,-1.40,.98),.115,AMBER,'head')
for s in [-1,1]:
    orb('Phoenix | eye', (s*.205,-.79,1.10),(.047,.065,.047),DARK,'head')
    orb('Phoenix | eye fire',(s*.23,-.80,1.10),(.022,.03,.023),AMBER,'head')
for i in range(3):
    feather('Phoenix | crown feather %d'%i,((i-1)*.07,-.56,1.15),((i-1)*.20,.12+i*.1,1.45+math.cos((i-1)*.6)*.22),.085,'head',PALE)
orb('Phoenix | amber heart',(0,-.26,.13),(.20,.22,.26),AMBER)
# Each wing is an articulated fan, rather than a rounded fin.
for side,s in [('L',-1),('R',1)]:
    bone='wing.'+side
    feather('Phoenix | wing mantle '+side,(s*.28,0,.24),(s*1.9,-.21,.28),.40,bone)
    for i in range(11):
        u=i/10
        start=(s*(.5+u*.85),-.03+u*.12,.22)
        tip=(s*(1.55+math.sin(u*math.pi*.82)*1.7),.05+u*1.48,.16-u*.22)
        feather('Phoenix | flight feather %s.%02d'%(side,i),start,tip,.19 if i<7 else .15,bone,PALE if i%3==0 else GLASS)
# Long individual tail streamers, fanning well beyond the body.
for i in range(7):
    s=i-3;bone='tail'
    a=(s*.08,.45,-.04);b=(s*.31,2.7+math.cos(s*.38)*.7,-.45-abs(s)*.04)
    feather('Phoenix | long tail %02d'%i,a,b,.15,bone,PALE if i%2 else GLASS)
    orb('Phoenix | tail fire %02d'%i,b,(.045,.15,.04),AMBER,bone)
for side,s in [('L',-1),('R',1)]:
    bone='foot.'+side
    rod('Phoenix | leg '+side,(s*.24,-.08,-.30),(s*.26,-.03,-.88),.045,AMBER,bone)
    for toe in [-1,0,1]:rod('Phoenix | claw '+side,(s*.26,-.03,-.88),(s*.26+toe*.09,-.42,-.9),.025,AMBER,bone)
# Rig: feathers bind rigidly to their wing, so their silhouettes stay crisp while flapping.
bpy.ops.object.armature_add(enter_editmode=True,location=(0,0,0))
rig=bpy.context.object;rig.name='Glass Phoenix | select me and press Space to fly'
arm=rig.data;arm.name='GlassPhoenixRig';arm.edit_bones.remove(arm.edit_bones[0])
def bone(name,head,tail,parent=None):
    b=arm.edit_bones.new(name);b.head=head;b.tail=tail
    if parent:b.parent=arm.edit_bones[parent]
    return b
bone('root',(0,0,-1),(0,0,-.7))
bone('body',(0,0,0),(0,0,.5),'root')
bone('head',(0,-.47,.65),(0,-.6,1.2),'body')
for side,s in [('L',-1),('R',1)]:
    bone('wing.'+side,(s*.3,0,.22),(s*1.4,0,.22),'body')
    bone('foot.'+side,(s*.24,-.08,-.3),(s*.26,-.03,-.88),'body')
bone('tail',(0,.4,-.05),(0,1.4,-.2),'body')
bpy.ops.object.mode_set(mode='OBJECT')
for o,name in parts:
    vg=o.vertex_groups.new(name=name);vg.add(list(range(len(o.data.vertices))),1,'REPLACE')
    mod=o.modifiers.new('Phoenix skeleton','ARMATURE');mod.object=rig;o.parent=rig
# One mesh, four materials, one skeleton; original authoring parts stay available in the .blend.
bpy.ops.object.select_all(action='DESELECT')
for o,_ in parts:o.select_set(True)
bpy.context.view_layer.objects.active=parts[0][0];bpy.ops.object.join()
body=bpy.context.object;body.name='GlassPhoenixBody'
rig.animation_data_create()
for name,seconds in [('PhoenixTakeoff',2.2),('PhoenixFly',1.2),('PhoenixLand',1.4)]:
    action=bpy.data.actions.new(name);action.use_fake_user=True;rig.animation_data.action=action
    for frame in range(1,round(seconds*30)+2):
        t=(frame-1)/30;u=min(1,t/seconds)
        for p in rig.pose.bones:p.rotation_mode='XYZ';p.rotation_euler=(0,0,0);p.location=(0,0,0)
        if name=='PhoenixFly':
            flap=math.sin(t/seconds*math.tau)*.52;fold=0;feet=1
        elif name=='PhoenixTakeoff':
            spread=min(1,u*3);flap=(1-spread)*1.05+math.sin(t*8)*.5*spread;fold=(1-spread)*.6;feet=u
        else:
            flap=math.sin(t*8)*.3*(1-u)+.65*u;fold=max(0,(u-.55)/.45)*.65;feet=1-u
        for side,s in [('L',-1),('R',1)]:
            wing=rig.pose.bones['wing.'+side];rest=wing.bone.matrix_local.to_quaternion()
            turn=Quaternion((0,1,0),s*flap)@Quaternion((0,0,1),s*fold)
            wing.rotation_euler=(rest.inverted()@turn@rest).to_euler()
            rig.pose.bones['foot.'+side].rotation_euler.x=-feet*1.1
        rig.pose.bones['tail'].rotation_euler.x=.08*math.sin(t*5)
        rig.pose.bones['head'].rotation_euler.x=.06*math.sin(t*4)
        for p in rig.pose.bones:
            p.keyframe_insert('rotation_euler',frame=frame,group=p.name);p.keyframe_insert('location',frame=frame,group=p.name)
rig.animation_data.action=None
for p in rig.pose.bones:p.rotation_euler=(0,0,0);p.location=(0,0,0)
bpy.context.view_layer.update()
bpy.ops.object.select_all(action='DESELECT');body.select_set(True);rig.select_set(True);bpy.context.view_layer.objects.active=rig
bpy.ops.export_scene.gltf(filepath=str(ROOT/'assets/glassphoenix.glb'),export_format='GLB',use_selection=True,
    export_animations=True,export_animation_mode='ACTIONS',export_frame_range=False,export_extras=True,
    export_cameras=False,export_lights=False,export_texcoords=False)
# An immediately viewable Blender scene, with flight selected and a lit camera preview.
world=bpy.data.worlds.new('Phoenix | midnight');world.use_nodes=True
world.node_tree.nodes['Background'].inputs[0].default_value=(.018,.035,.065,1)
world.node_tree.nodes['Background'].inputs[1].default_value=.5;scene.world=world
for name,p,energy,color,size in [('Key',(-4,-4,6),1100,(.65,1,1),5),('Amber rim',(3,3,4),1400,(1,.48,.16),4),('Front',(1,-6,2),700,(.75,.85,1),4)]:
    data=bpy.data.lights.new(name,'AREA');data.energy=energy;data.color=color;data.shape='DISK';data.size=size
    light=bpy.data.objects.new(name,data);scene.collection.objects.link(light);light.location=p
    light.rotation_euler=(-light.location).to_track_quat('-Z','Y').to_euler()
camdata=bpy.data.cameras.new('Phoenix portrait');cam=bpy.data.objects.new('Phoenix portrait',camdata);scene.collection.objects.link(cam)
cam.location=(4,-10,4);cam.rotation_euler=(Vector((0,.5,.2))-cam.location).to_track_quat('-Z','Y').to_euler();camdata.type='ORTHO';camdata.ortho_scale=8.5;scene.camera=cam
rig.animation_data.action=bpy.data.actions['PhoenixFly'];scene.frame_start=1;scene.frame_end=37;scene.frame_set(19)
scene.render.engine='CYCLES';scene.cycles.samples=24
scene.render.resolution_x=1000;scene.render.resolution_y=800;scene.render.resolution_percentage=100
scene.view_settings.view_transform='AgX'
for screen in bpy.data.screens:
    for area in screen.areas:
        if area.type=='VIEW_3D':
            area.spaces.active.region_3d.view_perspective='CAMERA';area.spaces.active.shading.type='MATERIAL'
            area.spaces.active.overlay.show_overlays=False
bpy.ops.wm.save_as_mainfile(filepath=str(ROOT/'blender/glassphoenix.blend'))
preview=ROOT/'blender/previews/glassphoenix.png';preview.parent.mkdir(parents=True,exist_ok=True)
scene.render.image_settings.file_format='PNG';scene.render.filepath=str(preview);bpy.ops.render.render(write_still=True)
print('GLASS_PHOENIX_READY',ROOT/'blender/glassphoenix.blend')
