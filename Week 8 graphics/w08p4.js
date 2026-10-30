window.onload = function () { main(); }

// Helper function for creating bindGroups
function createBindGroup(device, pipeline, texture, uniformBuffer) {
    return device.createBindGroup({
        label: "plane bind group",
        layout: pipeline.getBindGroupLayout(0),
        entries: [
            { binding: 0, resource: texture.sampler },
            { binding: 1, resource: texture.createView() },
            { binding: 2, resource: { buffer: uniformBuffer } },
        ],
    })
}

function createUniformBuffer(device, size) {
    return device.createBuffer({
        label: "uniformBuffer",
        size: size,
        usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
    });
}

function createPipeline(device, wgsl, canvasFormat, posLayout, texLayout, depthCompare, shadowAlpha) {
    let shadowBlend = {
        color: { dstFactor: "zero" },
        alpha: { dstFactor: "zero" }
    }
    // Blend if shadow pipeline
    if (shadowAlpha) {
        shadowBlend = {
            color: { operation: "add", srcFactor: "src-alpha", dstFactor: "one-minus-src-alpha" },
            alpha: { operation: "add", srcFactor: "one", dstFactor: "one-minus-src-alpha" }
        }
    }
    return device.createRenderPipeline({
        label: "render pipeline",
        layout: "auto",
        vertex: {
            label: "vertex shader",
            module: wgsl,
            entryPoint: "main_vs",
            buffers: [posLayout, texLayout]
        },
        fragment: {
            label: "fragment shader",
            module: wgsl,
            entryPoint: "main_fs",
            targets: [{
                format: canvasFormat,
                blend: shadowBlend
            }],
        },
        depthStencil: {
            label: "ds in pipeline",
            depthWriteEnabled: true,
            depthCompare: depthCompare,
            format: 'depth24plus'
        },
        primitive: {
            label: "primitive in pipeline",
            topology: 'triangle-list',
            frontFace: "ccw",
        },
    })
}


async function main() {

    // Get the context and devices
    const canvas = document.querySelector("canvas");

    const adapter = await navigator.gpu.requestAdapter();

    const device = await adapter.requestDevice();

    const context = canvas.getContext("webgpu");

    const canvasFormat = navigator.gpu.getPreferredCanvasFormat();

    context.configure({ device: device, format: canvasFormat });

    const orbitButton = document.getElementById("orbit");


    // Variables
    const texSize = 64;
    let orbiting = false;
    let orbitAngle = 0.0
    const radius = 2.0
    const visibility = 1.0 // default visibility
    const shadowVisibility = 0.4

    let groundPlane = [
        vec3(-2, -1, -1),
        vec3(2, -1, -1),
        vec3(2, -1, -5),
        vec3(-2, -1, -5),
    ];

    let rightQuad = [
        vec3(0.25, -0.5, -1.25),
        vec3(0.75, -0.5, -1.25),
        vec3(0.75, -0.5, -1.75),
        vec3(0.25, -0.5, -1.75),
    ];

    let leftQuad = [
        vec3(-1.0, -1.0, -2.5),
        vec3(- 1.0, -1.0, -3.0),
        vec3(-1.0, 0, -3.0),
        vec3(-1.0, 0, -2.5),
    ];

    let texCoords = [
        vec2(0, 0),
        vec2(1, 0),
        vec2(1, 1),
        vec2(0, 1),
    ]

    let pointLight = vec3(0 + radius * Math.cos(orbitAngle), 2.0, -2 + radius * Math.sin(orbitAngle))



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

    // Create
    const depthTexture = device.createTexture({
        size: { width: canvas.width, height: canvas.height },
        format: 'depth24plus',
        sampleCount: 1,
        usage: GPUTextureUsage.RENDER_ATTACHMENT,
    });

    // Render pipeline
    const pipeline = createPipeline(device, wgsl, canvasFormat, positionsBufferLayout, textureBufferLayout, "less", false)
    const shadowPipeline = createPipeline(device, wgsl, canvasFormat, positionsBufferLayout, textureBufferLayout, "greater", shadowBlend = true)


    // View setup
    const eye = vec3(0.0, 0.0, 0.0)
    const lookat = vec3(0.0, 0.0, 0.0)
    const up = vec3(0.0, 1.0, 0.0)

    const A = canvas.width / canvas.height
    let mvp_perspective = perspective(90.0, A, 0.1, 100.0)

    // Subtract epsilon to avoid z-clipping
    const epsilon = 0.0001
    // plane normal, n, defined by assignment
    const n = vec3(0, 1, 0)

    // p is a point in ground plane

    const p = vec3(-2, -1 - epsilon, -1)

    const d = -dot(p, n) // this is equal to 1

    let a = d + dot(n, pointLight) - epsilon;

    // Shadow projection matrix
    let M_s = mat4(
        a - pointLight[0] * n[0], -pointLight[0] * n[1], -pointLight[0] * n[2], -pointLight[0] * d,
        -pointLight[1] * n[0], a - pointLight[1] * n[1], -pointLight[1] * n[2], -pointLight[1] * d,
        -pointLight[2] * n[0], -pointLight[2] * n[1], a - pointLight[2] * n[2], -pointLight[2] * d,
        -n[0], -n[1], -n[2], a - d

    )

    const view = lookAt(eye, lookat, up)
    const mvp = mult(mvp_perspective, view)
    const flatMvp = flatten(mvp);
    let flatPointLight = flatten(pointLight)

    let shadowMvp = mult(mvp_perspective, mult(view, M_s))
    let flatShadowMvp = flatten(shadowMvp)

    let uniformArraySize = (flatMvp.length + pointLight.length + 1)

    let data = new Float32Array(uniformArraySize);
    data.set((flatMvp))
    data.set(flatPointLight, flatMvp.length)

    data[flatMvp.length + flatPointLight.length] = visibility


    let shadowData = new Float32Array(uniformArraySize);
    shadowData.set((flatShadowMvp))
    shadowData.set(flatPointLight, flatShadowMvp.length)
    shadowData[flatMvp.length + flatPointLight.length] = shadowVisibility


    // Mat 4(4 rows *4 cols*4 bytes per f32) + vec3f(3*4 bytes per f32) + f32
    const uniformBufferSize = (64 + 16 + 16)
    // Uniform buffer and bind group
    const uniformBuffer = createUniformBuffer(device, uniformBufferSize)
    const shadowUniformBuffer = createUniformBuffer(device, uniformBufferSize)




    const planeBindGroup = createBindGroup(device, pipeline, myTexture, uniformBuffer)

    const redBindGroup = createBindGroup(device, pipeline, redTexture, uniformBuffer)
    device.queue.writeBuffer(uniformBuffer, 0, data)

    const shadowBindGroup = createBindGroup(device, shadowPipeline, redTexture, shadowUniformBuffer)
    device.queue.writeBuffer(shadowUniformBuffer, 0, shadowData)




    orbitButton.addEventListener("click", function () {
        orbiting = !orbiting;
        requestAnimationFrame(animate)
    });

    render();

    function animate() {
        // If light is orbiting, update the position
        if (orbiting) {
            orbitAngle += 0.01
            // Recalculate the point light position
            pointLight = vec3(0 + radius * Math.cos(orbitAngle), 2.0, -2 + radius * Math.sin(orbitAngle))
            a = d + dot(n, pointLight) - epsilon;
            M_s = mat4(
                a - pointLight[0] * n[0], -pointLight[0] * n[1], -pointLight[0] * n[2], -pointLight[0] * d,
                -pointLight[1] * n[0], a - pointLight[1] * n[1], -pointLight[1] * n[2], -pointLight[1] * d,
                -pointLight[2] * n[0], -pointLight[2] * n[1], a - pointLight[2] * n[2], -pointLight[2] * d,
                -n[0], -n[1], -n[2], a - d
            )
            shadowMvp = mult(mvp_perspective, mult(view, M_s))
            flatShadowMvp = flatten(shadowMvp)
            shadowData.set((flatShadowMvp))
            device.queue.writeBuffer(shadowUniformBuffer, 0, shadowData)

            render()
            requestAnimationFrame(animate)
        }

        render();
    }


    function render() {
        const encoder = device.createCommandEncoder();
        const pass = encoder.beginRenderPass({
            label: "pass encoder",
            colorAttachments: [{
                view: context.getCurrentTexture().createView(),
                loadOp: "clear",
                clearValue: [0.3921, 0.5843, 0.9294, 1.0],
                storeOp: "store",
            }],
            depthStencilAttachment: {
                view: depthTexture.createView(),
                depthLoadOp: "clear",
                depthClearValue: 1.0,
                depthStoreOp: "store",
            }
        })

        pass.setPipeline(pipeline);
        pass.setVertexBuffer(0, positionsBuffer);
        pass.setVertexBuffer(1, textureBuffer);
        pass.setVertexBuffer(2, redTextureBuffer);
        pass.setIndexBuffer(indexBuffer, 'uint32');

        // Draw ground
        pass.setBindGroup(0, planeBindGroup);
        pass.drawIndexed(6, 1, 0, 0);
        // Then draw shadows on plane
        pass.setPipeline(shadowPipeline)
        pass.setBindGroup(0, shadowBindGroup);
        pass.drawIndexed(6, 1, 0, 4);
        pass.drawIndexed(6, 1, 0, 8);
        // Lastly draw red quads
        pass.setPipeline(pipeline);
        pass.setBindGroup(0, redBindGroup);
        pass.drawIndexed(6, 1, 0, 4);
        pass.drawIndexed(6, 1, 0, 8);



        pass.end()
        device.queue.submit([encoder.finish()]);

    }
}