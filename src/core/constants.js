// Shared dimensions, fluid ids, grid directions and physics tuning.

// learn: code.html#names, space.html#address, start.html#cubes (see learn/README.md)
export const N = 16;            // cube footprint in cells
// learn: physics.html#adding (see learn/README.md)
export const LH = 0.5;          // height of one terrain level
export const CUBE_H = 16;       // visual height of the cube
export const BASE = 0.6;        // thickness of the bedrock slab under the map
export const MAX_L = 24;        // highest level a floor may reach
export const HEAD = 3;          // min free levels between two stacked floors
export const SHEAD = 3;         // clearance (levels) kept around stairs and bridges

export const WATER = 1, LAVA = 2, ACID = 3;
// learn: code.html#lists (see learn/README.md)
export const FLUIDS = [WATER, LAVA, ACID];
export const FLUID_NAME = { 1: 'water', 2: 'lava', 3: 'acid' };
// a look a standing fluid may have, not a fluid of its own (no cube is made of it): Sollmeldon's
// black mud (game/mud.js), waded through as water, drawn as mud (render/materials.js FLUID_LOOK,
// its palette themes/fluids.js MUD_ROW), lived in by his Mud squirtles (physics/dwell.js)
export const MUD = 4;

// grid directions: +x, -x, +z, -z
// learn: code.html#lists (see learn/README.md)
export const DIRS = [[1, 0], [-1, 0], [0, 1], [0, -1]];
export const OPP = [1, 0, 3, 2];
export const DIRV = DIRS.map(([x, z]) => [x, 0, z]);

// corners of a cell are indexed oz*2+ox: 0=(0,0) 1=(1,0) 2=(0,1) 3=(1,1)
// EDGE_CORNERS[d] lists the two corners on side d, ordered like edgePts()
export const EDGE_CORNERS = [[1, 3], [0, 2], [2, 3], [0, 1]];
export const edgePts = (x, z, d) => [
  [[x + 1, z], [x + 1, z + 1]], [[x, z], [x, z + 1]],
  [[x, z + 1], [x + 1, z + 1]], [[x, z], [x + 1, z]]][d];

// physics tuning
export const STEP = 0.3;        // max ledge the character walks up without jumping
export const SWIM_STEP = 1.1;   // climbing out of water is more generous: onto a bank a level over its surface
// learn: physics.html#adding (see learn/README.md)
export const GRAV = 22;
export const SNAP = 0.25;       // stick to the ground when walking downhill
export const STEEP = 3;         // a slope steeper than this (rise per unit) slides the body down

// character controller
export const CHAR_SCALE = 0.55; // the rig is ~2 m tall -> ~1.1 units
export const CHAR_R = 0.22;     // collision radius
// learn: physics.html#adding (see learn/README.md)
export const CHAR_H = 0.85;     // collision height
// where the head starts over the feet: the rig's head bone (1.44 rig units up, blender/character.py)
// at CHAR_SCALE. Water up to here is waded through (slowed by up to WADE_SLOW); the hero swims
// before it gets that deep (SWIM_DEPTH), what cannot swim is lost in deeper water.
export const HEAD_Y = 0.79, WADE_SLOW = 0.45;
// Swimming (physics/move.js): clear water deeper than SWIM_DEPTH lifts the body off its feet, and it
// swims with its feet SWIM_FEET under the surface (the Swim clips' water line, blender/character.py
// WATER_Z, at CHAR_SCALE), until the ground comes up to them again. Wading at least WADE_CLIMB
// deep, the body climbs out as a swimmer does (SWIM_STEP).
// learn: physics.html#walls (see learn/README.md)
export const SWIM_DEPTH = 0.6, SWIM_FEET = 0.5, WADE_CLIMB = 0.3;
// learn: animation.html#mixing, code.html#names, physics.html#adding (see learn/README.md)
export const WALK_SPEED = 1.9, RUN_SPEED = 2.8, SWIM_SPEED = 1.2;
export const CLIMB_SPEED = 1.7;   // up and down ladders (physics/climb.js)
// on the ground speed builds up linearly: standing to a full run in RUN_RAMP s (walking pace
// after about 70% of it, so short taps stay precise); stopping brakes at BRAKE units/s²
// learn: physics.html#feel (see learn/README.md)
export const RUN_RAMP = 0.25, BRAKE = 30;
// the walk / run cycles play at the pace of these ground speeds; the remaining
// distance is covered with longer strides (see render/stride.js)
// learn: animation.html#feet (see learn/README.md)
export const WALK_ANIM = 1.4, RUN_ANIM = 2.8;   // the run: its authored stride, no stretch
// learn: physics.html#adding (see learn/README.md)
export const JUMP_V = 6.27;     // -> jumps ~0.9 units high
// learn: animation.html#modes, physics.html#landing (see learn/README.md)
export const SIT_IMPACT = 10;   // landing faster than this knocks you onto your bottom
// learn: physics.html#landing (see learn/README.md)
export const RAGDOLL_IMPACT = 14;   // ... and this turns you into a ragdoll (and hurts)
// learn: animation.html#getup (see learn/README.md)
export const GET_UP_SPEED = 1.35;   // the GetUpBack / GetUpFront clips play this much faster
export const FALL_DAMAGE = 60;   // the most a hard landing costs; a fall through cubes always costs this
