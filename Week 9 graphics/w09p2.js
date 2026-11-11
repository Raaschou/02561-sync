window.onload = function () { main(); }
// Function for converting obj float array to array of float array
function unpackVec3(data) {
    const result = [];

    for (let i = 0; i < data.length; i += 4) {
        result.push(vec3(
            data[i],
            data[i + 1],
            data[i + 2]
        ));
    }

    return result;
}


// Helper function for creating bindGroups
function createBindGroup(label, device, pipeline, texture, shadowTexture, uniformBuffer) {
    if (label === "shadow map bind group") {
        return device.createBindGroup({
            label: label,
            layout: pipeline.getBindGroupLayout(0),
            entries: [
                { binding: 0, resource: { buffer: uniformBuffer } },
            ],
        })

    }
    return device.createBindGroup({
        label: label,
        layout: pipeline.getBindGroupLayout(0),
        entries: [
            { binding: 0, resource: texture.sampler },
            { binding: 1, resource: texture.createView() },
            { binding: 2, resource: { buffer: uniformBuffer } },
            { binding: 3, resource: shadowTexture.createView() }
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

function createPipeline(label, device, wgsl, vertexEntryPoint,
    fragmentEntrypoint, canvasFormat, layout, compare, passOp, shadowAlpha, pipelineLayout) {
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
        //let stencilFormat = shadowAlpha ? "depth24plus-stencil8" : "depth24plus"
    }
    const blend = canvasFormat === "rgba32float" ? undefined : shadowBlend;
    pipelineLayout = canvasFormat === "rgba32float" ? "auto" : pipelineLayout
    return device.createRenderPipeline({
        label: label,
        layout: pipelineLayout,
        vertex: {
            label: "vertex shader",
            module: wgsl,
            entryPoint: vertexEntryPoint,
            buffers: layout
        },
        fragment: {
            label: "fragment shader",
            module: wgsl,
            entryPoint: fragmentEntrypoint,
            targets: [{
                format: canvasFormat,
                blend: blend
            }],
        },
        depthStencil: {
            label: "ds in pipeline",
            depthWriteEnabled: true,
            depthCompare: "less",
            format: "depth24plus-stencil8",
            stencilFront: { compare: compare, passOp: passOp },
            stencilBack: { compare: compare, passOp: passOp }
        },
        primitive: {
            label: "primitive in pipeline",
            topology: 'triangle-list',
            frontFace: "ccw",
        },
    })
}

// modified unpackVec3 to tranlate by the vector 
function tranlateVertices(vertices, vector) {
    const result = []
    for (let i = 0; i < vertices.length; i += 4) {
        result.push(vec3(

            vertices[i] + vector[0],
            vertices[i + 1] + vector[1],
            vertices[i + 2] + vector[2]
        ));
    }
    return result
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
    const moveTeapotButton = document.getElementById("moveTeapot");

    // Variables
    const obj_filename = "../3d_models/utah_teapot.obj";
    const obj = await readOBJFile(obj_filename, 0.25, true); // scale by 0.25



    const texSize = 64;
    let orbiting = false;
    let orbitAngle = 0.0

    let moving = false;
    let heightAngle = 0.0;

    let animating = false;
    function startAnimation() {
        if (!animating) {
            animating = true;
            requestAnimationFrame(animate);
        }
    }

    const radius = 2.0
    const visibility = 1.0 // default visibility
    const shadowVisibility = 0.6
    const translateVector = vec3(0, -1, -3)

    let pointLight = vec3(0 + radius * Math.cos(orbitAngle), 2.0, -2 + radius * Math.sin(orbitAngle))
    let redColor = new Uint8Array([255, 255, 255, 255])
    // Get plane texture
    let planeFilepath = "../textures/xamp23.png"
    const response = await fetch(planeFilepath);
    const blob = await response.blob();
    const planeImg = await createImageBitmap(blob, { colorSpaceConversion: "none" });

    const groundPlane = [
        vec3(-2, -1, -1),
        vec3(2, -1, -1),
        vec3(2, -1, -5),
        vec3(-2, -1, -5),
    ];
    let texCoords = [
        vec2(0, 0),
        vec2(1, 0),
        vec2(1, 1),
        vec2(0, 1),
    ]
    // Unpack teapot variables
    const teapotPointsScaled = obj.vertices // scale by a quarter
    const teapotPoints = tranlateVertices(teapotPointsScaled, translateVector) // unpack and translate
    const teapotIndices = obj.indices
    const teapotNormals = unpackVec3(obj.normals)


    let planeIndicies = new Uint32Array([
        0, 1, 2,
        0, 2, 3,
    ]);

    const indices = new Uint32Array([...planeIndicies, ...teapotIndices])


    const planeNormals = [vec3(0, 1, 0), vec3(0, 1, 0), vec3(0, 1, 0), vec3(0, 1, 0)];
    // Scene setup




    // groundPlane/postions buffer
    const planePosBuffer = device.createBuffer({
        label: "positions buffer",
        size: flatten(groundPlane).byteLength,
        usage: GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST,
    });

    device.queue.writeBuffer(planePosBuffer, 0, flatten(groundPlane))

    const planePosBufferLayout = {
        label: "pos buffer layout",
        arrayStride: sizeof["vec3"],
        attributes: [{
            format: "float32x3",
            offset: 0,
            shaderLocation: 0,
        }]
    }
    const teapotPointsBuffer = device.createBuffer({
        label: "teapotPoints buffer",
        size: flatten(teapotPoints).byteLength,
        usage: GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST,
    });

    device.queue.writeBuffer(teapotPointsBuffer, 0, flatten(teapotPoints))

    const teapotPointsBufferLayout = {
        label: "teapot buffer layout",
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
            shaderLocation: 1,
        }]
    }

    // Normals buffer
    const planeNormalBuffer = device.createBuffer({
        label: "planeNormal buffer",
        size: flatten(planeNormals).byteLength,
        usage: GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST,
    })
    device.queue.writeBuffer(planeNormalBuffer, 0, flatten(planeNormals))

    const planeNormalBufferLayout = {
        arrayStride: sizeof["vec3"],
        attributes: [{ format: "float32x3", offset: 0, shaderLocation: 2 }]
    }

    const teapotNormalBuffer = device.createBuffer({
        label: "teapotNormal buffer",
        size: flatten(teapotNormals).byteLength,
        usage: GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST,
    })
    device.queue.writeBuffer(teapotNormalBuffer, 0, flatten(teapotNormals))

    const teapotNormalBufferLayout = {
        arrayStride: sizeof["vec3"],
        attributes: [{ format: "float32x3", offset: 0, shaderLocation: 2 }]
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

    const wgslShadowFile = document.getElementById("shadowWGSL").src;
    const wgslShadwCode = await fetch(wgslShadowFile, { cache: "reload" }).then(r => r.text());
    const shadowWGSL = device.createShaderModule({ code: wgslShadwCode });


    // Create depth texture
    const depthTexture = device.createTexture({
        size: { width: canvas.width, height: canvas.height },
        format: 'depth24plus-stencil8',
        sampleCount: 1,
        usage: GPUTextureUsage.RENDER_ATTACHMENT,
    });


    const bindGroupLayout = device.createBindGroupLayout({
        entries: [
            { binding: 0, visibility: GPUShaderStage.FRAGMENT, sampler: {} },
            { binding: 1, visibility: GPUShaderStage.FRAGMENT, texture: {} },
            { binding: 2, visibility: GPUShaderStage.VERTEX | GPUShaderStage.FRAGMENT, buffer: {} },
            { binding: 3, visibility: GPUShaderStage.FRAGMENT, texture: { sampleType: "unfilterable-float" } },
        ],
    });


    // Render pipeline

    const pipelineLayout = device.createPipelineLayout({ bindGroupLayouts: [bindGroupLayout] });

    const pipeline = createPipeline("plane pipeline", device, wgsl, "main_vs", "main_fs", canvasFormat,
        [planePosBufferLayout, textureBufferLayout, planeNormalBufferLayout],
        "always", "replace", false, pipelineLayout);

    const teapotPipeline = createPipeline("teapot pipeline", device, wgsl, "main_vs", "main_fs", canvasFormat,
        [teapotPointsBufferLayout, redTextureBufferLayout, teapotNormalBufferLayout],
        "always", "keep", false, pipelineLayout);


    const shadowPipeline = createPipeline("shadow pipeline", device, wgsl, "main_vs", "main_fs", canvasFormat, [teapotPointsBufferLayout,
        redTextureBufferLayout, teapotNormalBufferLayout], "equal", "zero", shadowBlend = true, pipelineLayout)



    // Shadow mapping 
    const shadowMapPipeline = createPipeline("shadow map pipeline", device, shadowWGSL, "main_vs_depth", "main_fs_depth",
        "rgba32float", [teapotPointsBufferLayout,], "equal", "zero", shadowBlend = true, pipelineLayout)
    const shadowTextureSize = 1024; // 32 * 32

    const shadowTexture = device.createTexture({
        size: [shadowTextureSize, shadowTextureSize, 1],
        usage: GPUTextureUsage.RENDER_ATTACHMENT | GPUTextureUsage.TEXTURE_BINDING,
        format: 'rgba32float',
    });

    //const shadowTextureView = shadowTexture.createView();
    shadowTexture.sampler = device.createSampler({
        label: "Texture sampler",
    });

    // shadow map depth map
    const shadowDepthTexture = device.createTexture({
        size: [shadowTextureSize, shadowTextureSize],
        format: 'depth24plus-stencil8',
        usage: GPUTextureUsage.RENDER_ATTACHMENT,
    });

    // View setup
    const eye = vec3(0.0, 0.0, 0.0)
    const lookat = vec3(0.0, 0.0, 0.0)
    const up = vec3(0.0, 1.0, 0.0)

    const A = canvas.width / canvas.height
    let mvp_perspective = perspective(90.0, A, 0.1, 100.0)

    // Subtract epsilon to avoid z-clipping
    const epsilon = 0.01
    // plane normal, n, defined by assignment
    const n = vec3(0, 1, 0)

    // p is a point in ground plane

    const p = vec3(-2, -1 + epsilon, -1)

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
    let modelMatrix = mat4();
    let flatModelMatrix = flatten(modelMatrix)
    let flatPointLight = flatten(pointLight)

    let lightView = lookAt(pointLight, lookat, up)
    let lightProjection = perspective(90.0, 1, 0.1, 10.0)

    let lightViewProj = mult(lightProjection, lightView)
    let flatLVP = flatten(lightViewProj)

    let shadowMvp = mult(mvp_perspective, mult(view, M_s))
    let flatShadowMvp = flatten(shadowMvp)

    let uniformArraySize = (flatMvp.length + flatModelMatrix.length + pointLight.length + flatLVP.length + 1)

    let data = new Float32Array(uniformArraySize);
    data.set((flatMvp))
    data.set(flatModelMatrix, flatMvp.length)
    data.set(flatLVP, flatModelMatrix.length + flatMvp.length)
    data.set(flatPointLight, flatLVP.length + flatModelMatrix.length + flatMvp.length)
    data[flatMvp.length + flatModelMatrix.length + flatLVP.length + flatPointLight.length] = visibility

    let teapotData = new Float32Array(uniformArraySize);
    teapotData.set((flatMvp))
    teapotData.set(flatModelMatrix, flatMvp.length)
    teapotData.set(flatLVP, flatMvp.length + flatModelMatrix.length)
    teapotData.set(flatPointLight, flatLVP.length + flatModelMatrix.length + flatMvp.length)

    teapotData[flatMvp.length + flatModelMatrix.length + flatLVP.length + flatPointLight.length] = visibility - 0.1

    let shadowData = new Float32Array(uniformArraySize);
    shadowData.set((flatShadowMvp))
    shadowData.set(flatModelMatrix, flatMvp.length)
    shadowData.set(flatLVP, flatMvp.length + flatModelMatrix.length)
    shadowData.set(flatPointLight, flatLVP.length + flatModelMatrix.length + flatMvp.length)

    shadowData[flatMvp.length + flatModelMatrix.length + flatLVP.length + flatPointLight.length] = shadowVisibility


    // Mat 4(4 rows *4 cols*4 bytes per f32) * 2 + vec3f(3*4 bytes per f32) + f32
    const uniformBufferSize = (64 * 2 + 16 + 4 + 34 + 64)
    // Uniform buffer and bind group
    const uniformBuffer = createUniformBuffer(device, uniformBufferSize)
    const teapotUniformBuffer = createUniformBuffer(device, uniformBufferSize)
    const shadowUniformBuffer = createUniformBuffer(device, uniformBufferSize)




    const planeBindGroup = createBindGroup("plane bind group", device, pipeline, myTexture, shadowTexture, uniformBuffer)
    device.queue.writeBuffer(uniformBuffer, 0, data)

    const teapotBindGroup = createBindGroup("teapot bind group", device, teapotPipeline, redTexture, shadowTexture, teapotUniformBuffer)
    device.queue.writeBuffer(teapotUniformBuffer, 0, teapotData)

    const shadowBindGroup = createBindGroup("shadow bind group", device, shadowPipeline, redTexture, shadowTexture, shadowUniformBuffer)
    device.queue.writeBuffer(shadowUniformBuffer, 0, shadowData,)




    // Shadow map data and uniform buffer
    const shadowMapUniArraySize = (flatModelMatrix.length + flatten(lightViewProj).length); // 32
    const shadowMapUniBufSize = 128 // 32 * 4

    let shadowMapData = new Float32Array(shadowMapUniArraySize);
    shadowMapData.set(flatModelMatrix)
    shadowMapData.set(flatten(lightViewProj), flatModelMatrix.length)

    const shadowMapUniBuf = createUniformBuffer(device, shadowMapUniBufSize)
    const shadowMapBindGroup = createBindGroup("shadow map bind group", device, shadowMapPipeline, shadowTexture, shadowTexture, shadowMapUniBuf)

    device.queue.writeBuffer(shadowMapUniBuf, 0, shadowMapData)





    orbitButton.addEventListener("click", function () {
        orbiting = !orbiting;
        // Multiple animation frame request speeds up animation
        startAnimation()
    });

    moveTeapotButton.addEventListener("click", function () {
        moving = !moving;
        startAnimation()
    });

    let movingModelMatrix = mat4()

    function animate() {
        // If light is orbiting, update the position
        if (moving) {
            heightAngle += 0.005;
            // Modified sine wave which is in the interval [0,0.5]
            let height = 0.25 * Math.sin(heightAngle) + 0.25;
            movingModelMatrix[1][3] = height

            teapotData.set(flatten(movingModelMatrix), flatMvp.length);

            shadowData.set(flatten(movingModelMatrix), flatMvp.length)
            shadowMapData.set(flatten(movingModelMatrix))


            device.queue.writeBuffer(teapotUniformBuffer, 0, teapotData);
            device.queue.writeBuffer(shadowUniformBuffer, 0, shadowData);
            device.queue.writeBuffer(shadowMapUniBuf, 0, shadowMapData)

        }

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
            // mult with model to update shadow size
            shadowMvp = mult(mvp_perspective, mult(view, mult(M_s, movingModelMatrix)))
            lightView = lookAt(pointLight, lookat, up)

            lightViewProj = mult(lightProjection, lightView)

            flatShadowMvp = flatten(shadowMvp)
            flatPointLight = flatten(pointLight)
            shadowData.set((flatShadowMvp))
            teapotData.set(flatPointLight, flatLVP.length + flatModelMatrix.length + flatMvp.length)

            shadowMapData.set(flatten(lightViewProj), flatModelMatrix.length)
            //shadowData.set(flatPointLight, 32);

            device.queue.writeBuffer(shadowUniformBuffer, 0, shadowData)
            device.queue.writeBuffer(teapotUniformBuffer, 0, teapotData);
            device.queue.writeBuffer(shadowMapUniBuf, 0, shadowMapData)


        }
        // Check to stop multiple calls of requestAnimationFrame(animate) speeding up animation
        if (moving || orbiting) {
            requestAnimationFrame(animate);
        } else {
            animating = false;
        }
        render();
    }
    render();

    function render() {
        const encoder = device.createCommandEncoder();
        // Do shadow pass
        const shadowPass = encoder.beginRenderPass({
            colorAttachments: [{
                view: shadowTexture.createView(),
                clearValue: [1.0, 1.0, 1.0, 1.0],
                loadOp: "clear",
                storeOp: 'store',
            }],
            depthStencilAttachment: {
                view: shadowDepthTexture.createView(),
                depthClearValue: 1.0,
                depthLoadOp: "clear",
                depthStoreOp: "store",
                stencilClearValue: 0,
                stencilLoadOp: "clear",
                stencilStoreOp: "store",
            }
        })
        shadowPass.setPipeline(shadowMapPipeline);
        shadowPass.setBindGroup(0, shadowMapBindGroup);
        shadowPass.setVertexBuffer(0, teapotPointsBuffer);
        shadowPass.setIndexBuffer(indexBuffer, 'uint32');
        shadowPass.drawIndexed(teapotIndices.length, 1, planeIndicies.length, 0);
        shadowPass.end();


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
                stencilClearValue: 0,
                stencilLoadOp: "clear",
                stencilStoreOp: "store",
                stencilReadOnly: false,
            }
        })
        pass.setStencilReference(1)

        pass.setPipeline(pipeline);
        pass.setVertexBuffer(0, planePosBuffer);
        pass.setVertexBuffer(1, textureBuffer);
        pass.setVertexBuffer(2, planeNormalBuffer);

        pass.setIndexBuffer(indexBuffer, 'uint32');

        // Draw ground
        pass.setBindGroup(0, planeBindGroup);


        pass.drawIndexed(planeIndicies.length, 1, 0, 0);

        pass.setVertexBuffer(0, teapotPointsBuffer);
        pass.setVertexBuffer(1, redTextureBuffer);

        pass.setVertexBuffer(2, teapotNormalBuffer);

        // Then draw shadows on plane

        // Lastly draw teapot
        pass.setPipeline(teapotPipeline);
        pass.setBindGroup(0, teapotBindGroup);
        pass.drawIndexed(teapotIndices.length, 1, planeIndicies.length, 0)




        pass.end()
        device.queue.submit([encoder.finish()]);

    }
}