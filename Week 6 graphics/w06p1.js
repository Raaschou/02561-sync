window.onload = function () { main(); }

function checkerBoard(texSize, myTexels) {
    const numRows = 8
    const numCols = 8
    for (var i = 0; i < texSize; ++i)
        for (var j = 0; j < texSize; ++j) {
            var patchx = Math.floor(i / (texSize / numRows));
            var patchy = Math.floor(j / (texSize / numCols));
            var c = (patchx % 2 !== patchy % 2 ? 255 : 0);
            var idx = 4 * (i * texSize + j);
            myTexels[idx] = myTexels[idx + 1] = myTexels[idx + 2] = c;
            myTexels[idx + 3] = 255;
        }
    return myTexels;
}

async function main() {

    // Get the context and devices
    const canvas = document.querySelector("canvas");

    const adapter = await navigator.gpu.requestAdapter();

    const device = await adapter.requestDevice();

    const context = canvas.getContext("webgpu");

    const canvasFormat = navigator.gpu.getPreferredCanvasFormat();

    context.configure({ device: device, format: canvasFormat });

    // Variables
    const texSize = 64;

    let rectangle = [
        vec3(-4, -1, -1),
        vec3(4, -1, -1),
        vec3(4, -1, -21),
        vec3(-4, -1, -21),
    ];

    let texCoords = [
        vec2(-1.5, 0.0),
        vec2(2.5, 0.0),
        vec2(2.5, 10.0),
        vec2(-1.5, 10.0),
    ]

    let textureBuffer = [
        vec2(-1.5, 0.0),
        vec2(2.5, 0.0),
        vec2(2.5, 10.0),
        vec2(-1.5, 10.0)
    ];

    let myTexels = new Uint8Array(4 * texSize * texSize); // 4 for RGBA image, texSize is the resolution

    // Use checkerboard function to create texture
    let checkerBoardTexture = checkerBoard(texSize, myTexels)

    // Scene setup

    const positionsBuffer = device.createBuffer({
        label: "positions buffer",
        size: flatten(rectangle).byteLength,
        usage: GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST,
    });

    device.queue.writeBuffer(positionsBuffer, 0, flatten(rectangle))

    const positionsBufferLayout = {
        label: "pos buffer layout",
        arrayStride: sizeof["vec3"],
        attributes: [{
            format: "float32x3",
            offset: 0,
            shaderLocation: 0,
        }]
    }

    const myTexture = device.createTexture({
        label: "checkerboard texture",
        size: [texSize, texSize, 1],
        format: "rgba8unorm",
        usage: GPUTextureUsage.COPY_DST | GPUTextureUsage.TEXTURE_BINDING
    });

    device.queue.writeTexture(
        { texture: myTexture },
        myTexels,
        { offset: 0, bytesPerRow: texSize * 4, rowsPerImage: texSize },
        [texSize, texSize, 1]
    );

    let sampler = myTexture.sampler = device.createSampler({
        label: "Texture sampler",
        addressModeU: "clamp-to-edge",
        addressModeV: "repeat",
        minFilter: "nearest",
        magFilter: "linear",
        mipmapFilter: "nearest"
    });


    // Import wgsl file
    const wgslfile = document.getElementById("wgsl").src;
    const wgslcode = await fetch(wgslfile, { cache: "reload" }).then(r => r.text());
    const wgsl = device.createShaderModule({ code: wgslcode });

    // Render pipeline
    const pipeline = device.createRenderPipeline({
        label: "render pipeline",
        layout: "auto",
        vertex: {
            label: "vertex shader",
            module: wgsl,
            entryPoint: "main_vs",
            buffers: [positionsBufferLayout]
        },
        fragment: {
            label: "fragment shader",
            module: wgsl,
            entryPoint: "main_fs",
            targets: [{ format: canvasFormat }],
        },
        primitive: { label: "primitive triangle list", topology: "triangle-list" },
    })


    // View setup
    let eye = vec3(0.0, 0.0, 5.0)
    let lookat = vec3(0.0, 0.0, 0.0)
    let up = vec3(0.0, 1.0, 0.0)

    let A = canvas.width / canvas.height
    let mvp_perspective = perspective(90.0, A, 0.1, 100.0)

    const view = lookAt(eye, lookat, up)
    const mvp = mult(mvp_perspective, view)

    // Uniform buffer and bind group
    const uniformBuffer = device.createBuffer({
        label: "uniformBuffer",
        size: sizeof['mat4'],
        usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
    });

    const bindGroup = device.createBindGroup({
        label: "bind group",
        layout: pipeline.getBindGroupLayout(0),
        entries: [
            { binding: 0, resource: sampler },
            { binding: 1, resource: myTexture },
            { binding: 2, resource: { buffer: uniformBuffer } },
        ],
    });

    device.queue.writeBuffer(uniformBuffer, 0, flatten(mvp))

    render();

    function render() {
        const encoder = device.createCommandEncoder();
        const pass = encoder.beginRenderPass({
            label: "pass encoder",
            colorAttachments: [{
                view: context.getCurrentTexture().createView(),
                loadOp: "clear",
                clearValue: [0.3921, 0.5843, 0.9294, 1.0],
                storeOp: "store",
            }]
        })

        pass.setPipeline(pipeline);
        pass.setVertexBuffer(0, positionsBuffer);
        pass.setBindGroup(0, bindGroup);
        pass.draw(texSize)

    }
}