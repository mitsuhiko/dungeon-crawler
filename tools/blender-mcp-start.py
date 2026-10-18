"""Load the project-bundled addon in a new Blender session, without saving preferences."""
import importlib.util
import os
import sys

import bpy

# An enabled user addon may already have registered these properties.
if not hasattr(bpy.types.Scene, 'blendermcp_port'):
    addon_path = sys.argv[sys.argv.index('--') + 1]
    spec = importlib.util.spec_from_file_location('blender_mcp_project', addon_path)
    addon = importlib.util.module_from_spec(spec)
    sys.modules[spec.name] = addon
    spec.loader.exec_module(addon)
    addon.register()

bpy.context.scene.blendermcp_port = int(os.environ.get('BLENDER_PORT', '9876'))
bpy.context.scene.blendermcp_auto_start_server = True
