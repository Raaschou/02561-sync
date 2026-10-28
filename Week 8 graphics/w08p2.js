window.onload = function () { main(); }

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

    let groundPlane = [
        vec3(-2, -1, -1),
        vec3(2, -1, -1),
        vec3(2, -1, -5),
        vec3(-2, -1, -5),
    ];

    let leftQuad = [
        vec3(0.25, -0.5, -1.25),
        vec3(0.75, -0.5, -1.25),
        vec3(0.75, -0.5, -1.75),
        vec3(0.25, -0.5, -1.75),
    ];

    let rightQuad = [
        vec3(-1.0, -1.0, -2.5),
        vec3(-1.0, 0, -2.5),
        vec3(-1.0, 0, -3.0),
        vec3(- 1.0, -1.0, -3.0)
    ];

    let texCoords = [
        vec2(0, 0),
        vec2(1, 0),
        vec2(1, 1),
        vec2(0, 1),
    ]



    let indices = new Uint32Array([
        0, 1, 2,
        0, 2, 3,
    ]);

    let redColor = new Uint8Array([255, 0, 0, 255])

    // Get normal map
    let planeFilepath = "xamp23.png"
    const response = await fetch(planeFilepath);
    const blob = await response.blob();
    const planeImg = await createImageBitmap(blob, { colorSpaceConversion: "none" });

    // Scene setup


    let positions = [...groundPlane, ...leftQuad, ...rightQuad]
    // groundPlane/postions buffer
    const positionsBuffer = device.createBuffer({
        label: "positions buffer",
        size: flatten(positions).byteLength,
        usage: GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST,
    });

    device.queue.writeBuffer(positionsBuffer, 0, flatten(positions))

    const positionsBufferLayout = {
        label: "pos buffer layout",
        arrayStride: sizeof["vec3"],
        attributes: [{
            format: "float32x3",
            offset: 0,
            shaderLocation: 0,
        }]
    }

    // Texture coordinates buffer

    const textureBuffer = device.createBuffer({
        label: "texture buffer",
        size: flatten(texCoords).byteLength,
        usage: GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST,
    })

    device.queue.writeBuffer(textureBuffer, 0, flatten(texCoords))

    const textureBufferLayout = {
        label: "texture buffer layout",
        arrayStride: sizeof["vec2"],
        attributes: [{
            format: "float32x2",
            offset: 0,
            shaderLocation: 1,
        }]
    }

    const redTextureBuffer = device.createBuffer({
        label: "redTexture buffer",
        size: flatten(redColor).byteLength,
        usage: GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST,
    })

    device.queue.writeBuffer(redTextureBuffer, 0, flatten(redColor))

    const redTextureBufferLayout = {
        label: "redTexture buffer layout",
        arrayStride: sizeof["vec3"],
        attributes: [{
            format: "float32x3",
            offset: 0,
            shaderLocation: 2,
        }]
    }

    // index buffer
    const indexBuffer = device.createBuffer({
        label: "index buffer",
        size: flatten(indices).byteLength,
        usage: GPUBufferUsage.INDEX | GPUBufferUsage.COPY_DST,
    })

    device.queue.writeBuffer(indexBuffer, 0, indices)


    const myTexture = device.createTexture({
        label: "plane texture",
        size: [planeImg.width, planeImg.height, 1],
        format: "rgba8unorm",
        usage: GPUTextureUsage.COPY_DST | GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.RENDER_ATTACHMENT
    });

    device.queue.copyExternalImageToTexture(
        { source: planeImg, flipY: false },
        { texture: myTexture },
        { width: planeImg.width, height: planeImg.height },
    );

    const redTexture = device.createTexture({
        label: "Red texture",
        size: [flatten(redColor).byteLength],
        format: "rgba8unorm",
        usage: GPUTextureUsage.COPY_DST | GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.RENDER_ATTACHMENT
    })

    device.queue.writeTexture(
        { texture: redTexture },
        redColor,
        { bytesPerRow: 4 },
        { width: 1, height: 1, depthOrArrayLayers: 1 }
    )


    // Only providing label for sampler, to appease the binding code
    // as mipmapping and so on is not needed here
    myTexture.sampler = device.createSampler({
        label: "Texture sampler",

    });

    redTexture.sampler = device.createSampler({
        label: "Texture sampler",
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
            buffers: [positionsBufferLayout, textureBufferLayout]
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
    let eye = vec3(0.0, 0.0, 0.0)
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

    const planeBindGroup = device.createBindGroup({
        label: "plane bind group",
        layout: pipeline.getBindGroupLayout(0),
        entries: [
            { binding: 0, resource: myTexture.sampler },
            { binding: 1, resource: myTexture.createView() },
            { binding: 2, resource: { buffer: uniformBuffer } },
        ],
    });

    const redBindGroup = device.createBindGroup({
        label: "plane bind group",
        layout: pipeline.getBindGroupLayout(0),
        entries: [
            { binding: 0, resource: redTexture.sampler },
            { binding: 1, resource: redTexture.createView() },
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
        pass.setVertexBuffer(1, textureBuffer);
        pass.setVertexBuffer(2, redTextureBuffer);
        pass.setIndexBuffer(indexBuffer, 'uint32');

        pass.setBindGroup(0, planeBindGroup);
        pass.drawIndexed(6, 1, 0, 0);


        pass.setBindGroup(0, redBindGroup);
        pass.drawIndexed(6, 1, 0, 4);
        pass.drawIndexed(6, 1, 0, 8);

        pass.end()
        device.queue.submit([encoder.finish()]);

    }
}