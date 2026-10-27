"""The rescue-route's real inventory models. Blender -b --python blender/qualmos_items.py
Exports simple glass helmet, original intact glass bird, and a glass voice recording.
No transmission shader: transparent colored glass remains cheap in the game.
"""
from pathlib import Path
import bpy
from mathutils import Vector
ROOT=Path(__file__).resolve().parents[1]
OUT=ROOT/'assets/items'

def clear():
    bpy.ops.object.select_all(action='SELECT');bpy.ops.object.delete(use_global=False)
def material(name,color,alpha=1,emission=0):
    m=bpy.data.materials.new(name);m.use_nodes=True
    p=m.node_tree.nodes.get('Principled BSDF');p.inputs['Base Color'].default_value=(*color,alpha)
    p.inputs['Alpha'].default_value=alpha;p.inputs['Roughness'].default_value=.28;p.inputs['Metallic'].default_value=.12
    p.inputs['Emission Color'].default_value=(*color,1);p.inputs['Emission Strength'].default_value=emission
    if alpha<1:m.surface_render_method='DITHERED'
    return m

def sphere(name,scale,at,mat,ico=False):
    if ico:bpy.ops.mesh.primitive_ico_sphere_add(subdivisions=2,radius=1,location=at)
    else:bpy.ops.mesh.primitive_uv_sphere_add(segments=20,ring_count=12,location=at)
    o=bpy.context.object;o.name=name;o.scale=scale;o.data.materials.append(mat)
    return o

def export(name,extra):
    # Read fresh matrices: the bird's vertices already have its source transform baked in.
    # Stale matrices applied the source scale a second time, making the bird almost invisible.
    bpy.context.view_layer.update()
    objects=[o for o in bpy.context.scene.objects if o.type=='MESH']
    bpy.ops.object.select_all(action='DESELECT')
    for o in objects:o.select_set(True)
    bpy.context.view_layer.objects.active=objects[0]
    bpy.ops.object.transform_apply(location=True,rotation=True,scale=True)
    bpy.context.view_layer.update()
    root=bpy.data.objects.new(name,None);bpy.context.collection.objects.link(root)
    for o in objects:
        world=o.matrix_world.copy();o.parent=root;o.matrix_world=world
    for k,v in dict(cube_crawler_item=True,blocking=False,units='character_rig',game_scale=.55,front='+Z',radius=.42,**extra).items():root[k]=v
    bpy.ops.object.select_all(action='DESELECT');root.select_set(True)
    for o in objects:o.select_set(True)
    bpy.context.view_layer.objects.active=root
    bpy.context.view_layer.update()
    bpy.ops.export_scene.gltf(filepath=str(OUT/(name+'.glb')),export_format='GLB',use_selection=True,
        export_extras=True,export_animations=False,export_texcoords=False)
    print('ITEM_EXPORTED',name)

clear()
glass=material('VoyageGlass',(.55,.9,.84),.18,.03);brass=material('VoyageBrass',(.68,.51,.22))
sphere('HelmetDome',(.30,.30,.31),(0,0,0),glass)
bpy.ops.mesh.primitive_torus_add(major_radius=.21,minor_radius=.025,major_segments=24,minor_segments=8,location=(0,0,-.23))
bpy.context.object.data.materials.append(brass)
sphere('AirValve',(.045,.035,.035),(0,-.22,-.22),brass)
export('wear_glass_helmet',dict(category='wearable',slot='head',socket='head',mount_quat_gltf=[0.,0.,0.,1.],mount_offset_gltf=[0.,.26,0.]))

clear()
bpy.ops.import_scene.gltf(filepath=str(ROOT/'assets/glassbird.glb'))
keep=[]
for name in ['GlassBird','GlassBirdCore']:
    node=bpy.data.objects.get(name)
    if node:keep.extend(o for o in [node,*node.children_recursive] if o.type=='MESH')
for o in list(bpy.context.scene.objects):
    if o.type=='MESH' and o not in keep:bpy.data.objects.remove(o,do_unlink=True)
# Bake source transforms, then normalize into a small bird held in the hand.
bpy.context.view_layer.update()
points=[o.matrix_world@v.co for o in keep for v in o.data.vertices]
lo=Vector(tuple(min(v[i] for v in points) for i in range(3)));hi=Vector(tuple(max(v[i] for v in points) for i in range(3)))
center=(lo+hi)/2;scale=.72/max(hi-lo)
glass=material('Items_Facets',(.20,.78,.67),.85,.35)
core=material('BirdAmber',(.9,.54,.12),1,.5)
for o in keep:
    matrix=o.matrix_world.copy();o.data=o.data.copy()
    for v in o.data.vertices:v.co=(matrix@v.co-center)*scale+Vector((0,0,.16))
    o.parent=None;o.location=(0,0,0);o.rotation_euler=(0,0,0);o.scale=(1,1,1)
    o.data.materials.clear();o.data.materials.append(core if 'Core' in o.name else glass)
for o in list(bpy.context.scene.objects):
    if o not in keep:bpy.data.objects.remove(o,do_unlink=True)
export('held_glass_bird',dict(category='held',slot='left',socket='hand.L',
    mount_quat_gltf=[-.0821,.5792,.7958,.1564],mount_offset_gltf=[0.,0.,0.],hold='feed'))

clear()
glass=material('RecordingGlass',(.12,.65,.57),.7,.12);amber=material('RecordingVoice',(.95,.62,.16),1,.4)
sphere('GlassRecording',(.26,.26,.26),(0,0,.26),glass,True)
sphere('VoiceInside',(.078,.078,.078),(0,0,.26),amber,True)
export('item_glass_recording',dict(category='usable',attach='ground'))
