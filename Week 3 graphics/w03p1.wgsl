struct VSOut {
    @builtin(position) position: vec4f,
    @location(0) color: vec3f,
}

struct Uniforms {
    mvp:mat4x4f,
}

@group(0) @binding(0)
var<uniform> uniforms: Uniforms;

@vertex
fn main_vs(@location(0) inPos: vec4f, @location(1) inColor: vec3f) -> VSOut {
    var vsOut: VSOut;

    let p = uniforms.mvp * inPos;

    vsOut.position = p;
    vsOut.color = inColor;
    return vsOut;
}


@fragment
fn main_fs(@location(0) inColor: vec3f) -> @location(0) vec4f {
    return vec4f(inColor, 1.0);
}
