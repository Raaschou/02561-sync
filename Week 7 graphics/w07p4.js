window.onload = function () { main(); }

async function main() {
    // Get the context and devices
    const canvas = document.querySelector("canvas");

    const adapter = await navigator.gpu.requestAdapter();

    const device = await adapter.requestDevice();

    const context = canvas.getContext("webgpu");

    const canvasFormat = navigator.gpu.getPreferredCanvasFormat();

    context.configure({ device: device, format: canvasFormat });


    // Get cube map

    let cubemap = ['textures/cm_left.png', // POSITIVE_X
        'textures/cm_right.png', // NEGATIVE_X
        'textures/cm_top.png', // POSITIVE_Y
        'textures/cm_bottom.png', // NEGATIVE_Y
        'textures/cm_back.png', // POSITIVE_Z
        'textures/cm_front.png']; // NEGATIVE_Z
    let imgs = [];

    for (let i = 0; i < cubemap.length; ++i) {
        const response = await fetch(cubemap[i]);
        const blob = await response.blob();
        imgs.push(await createImageBitmap(blob, { colorSpaceConversion: 'none' }));
    }

    // Get normal map
    let normalFilepath = "textures/normalmap.png"
    const response = await fetch(normalFilepath);
    const blob = await response.blob();
    const normalMapImage = await createImageBitmap(blob, { colorSpaceConversion: "none" });


    // Get buttons from html
    let subdivideButton = document.getElementById("subdivide")
    let coarsenButton = document.getElementById("coarsen")
    let orbitButton = document.getElementById("orbit")
    // Scene setup

    let subdivs = 5
    const M = 10

    let orbiting = false;
    let orbitAngle = 0.0;
    let radius = 3.0
    const M_SQRT2 = Math.sqrt(2.0);
    const M_SQRT6 = Math.sqrt(6.0);

    var positions = [
        vec3(-1.0, -1.0, 0.999),
        vec3(1.0, -1.0, 0.999),
        vec3(-1.0, 1.0, 0.999),
        vec3(1.0, 1.0, 0.999), // Quad

        vec3(0.0, 0.0, 1.0),
        vec3(0.0, 2.0 * M_SQRT2 / 3.0, -1.0 / 3.0),
        vec3(-M_SQRT6 / 3.0, -M_SQRT2 / 3.0, -1.0 / 3.0),
        vec3(M_SQRT6 / 3.0, -M_SQRT2 / 3.0, -1.0 / 3.0),
    ];
    var indices = new Uint32Array([
        0, 1, 2,
        0, 3, 1,
        1, 3, 2,
        0, 2, 3
    ]);
    let colors = [
        vec3(1.0, 1.0, 0.0),
        vec3(1.0, 0.0, 1.0),
        vec3(0.0, 1.0, 1.0),
        vec3(1.0, 1.0, 1.0),
    ];

    let quadVertices = [
        vec3(-1.0, -1.0, 0.999),
        vec3(1.0, -1.0, 0.999),
        vec3(-1.0, 1.0, 0.999),
        vec3(1.0, 1.0, 0.999), // Quad
    ]
    const quadIndices = [
        0, 1, 2,
        1, 3, 2
    ];
    function calc_indices() {
        positions = [
            vec3(0.0, 0.0, 1.0),
            vec3(0.0, 2.0 * M_SQRT2 / 3.0, -1.0 / 3.0),
            vec3(-M_SQRT6 / 3.0, -M_SQRT2 / 3.0, -1.0 / 3.0),
            vec3(M_SQRT6 / 3.0, -M_SQRT2 / 3.0, -1.0 / 3.0),
        ];
        indices = new Uint32Array([
            0, 1, 2,
            0, 3, 1,
            1, 3, 2,
            0, 2, 3
        ]);
        colors = [

            vec3(1.0, 1.0, 0.0),
            vec3(1.0, 0.0, 1.0),
            vec3(0.0, 1.0, 1.0),
            vec3(1.0, 1.0, 1.0),
        ];

        for (let i = 0; i < subdivs; ++i) {
            indices = subdivide_sphere(positions, indices, colors);
        }


        positions = [...quadVertices, ...positions]
        indices = new Uint32Array([
            ...quadIndices,
            ...indices
        ]);

        if (indexBuffer) {
            indexBuffer.destroy();
        }

        indexBuffer = device.createBuffer({
            size: indices.byteLength,
            usage: GPUBufferUsage.INDEX | GPUBufferUsage.COPY_DST,
        });
        colorBuffer = device.createBuffer({
            size: flatten(colors).byteLength,
            usage: GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST,
        });

        device.queue.writeBuffer(indexBuffer, 0, indices);
        device.queue.writeBuffer(colorBuffer, 0, flatten(colors))
        device.queue.writeBuffer(positionBuffer, 0, flatten(positions));
    }


    // Create texture from image
    let myTexture = device.createTexture({
        dimension: "2d",
        size: [imgs[0].width, imgs[0].height, imgs.length],
        format: "rgba8unorm",
        mipLevelCount: numMipLevels(imgs[0].width, imgs[0].height),
        usage: GPUTextureUsage.COPY_DST | GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.RENDER_ATTACHMENT
    });

    for (let i = 0; i < cubemap.length; ++i) {
        device.queue.copyExternalImageToTexture(
            { source: imgs[i], flipY: true },
            { texture: myTexture, origin: [0, 0, i] },
            { width: imgs[i].width, height: imgs[i].height }
        );
    }

    generateMipmap(device, myTexture);


    // Generate normalmap texture from image
    let normalMapTexture = device.createTexture({
        size: [normalMapImage.width, normalMapImage.height, 1],
        format: "rgba8unorm",
        mipLevelCount: numMipLevels(normalMapImage.width, normalMapImage.height),
        usage: GPUTextureUsage.COPY_DST | GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.RENDER_ATTACHMENT
    });

    device.queue.copyExternalImageToTexture(
        { source: normalMapImage, flipY: false },
        { texture: normalMapTexture },
        { width: normalMapImage.width, height: normalMapImage.height },
    );

    generateMipmap(device, normalMapTexture);

    // Buffer setup

    let indexBuffer = device.createBuffer({
        size: indices.byteLength,
        usage: GPUBufferUsage.INDEX | GPUBufferUsage.COPY_DST,
    });

    const positionBuffer = device.createBuffer({
        size: sizeof['vec3'] * Math.pow(4, M + 1),
        usage: GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST,
    });



    let colorBuffer = device.createBuffer({
        size: flatten(colors).byteLength,
        usage: GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST,
    });


    calc_indices()


    device.queue.writeBuffer(indexBuffer, 0, indices);

    device.queue.writeBuffer(positionBuffer, 0, flatten(positions));


    device.queue.writeBuffer(colorBuffer, 0, flatten(colors))



    const positionsBufferLayout = {
        arrayStride: sizeof['vec3'],
        attributes: [{
            format: 'float32x3',
            offset: 0,
            shaderLocation: 0, // Position, see vertex shader
        }],
    };


    const colorBufferLayout = {
        arrayStride: sizeof['vec3'],
        attributes: [{
            format: 'float32x3',
            offset: 0,
            shaderLocation: 1,
        }]
    }

    // Wgsl import
    const wgslfile = document.getElementById('wgsl').src;
    const wgslcode
        = await fetch(wgslfile, { cache: "reload" }).then(r => r.text());
    const wgsl = device.createShaderModule({
        code: wgslcode
    });

    // Render pipeline
    const depthTexture = device.createTexture({
        size: { width: canvas.width, height: canvas.height },
        format: 'depth24plus',
        sampleCount: 1,
        usage: GPUTextureUsage.RENDER_ATTACHMENT,
    });

    const pipeline = device.createRenderPipeline({
        label: "render pipeline",
        layout: 'auto',
        vertex: {
            label: "vs in pipeline",
            module: wgsl,
            entryPoint: 'main_vs',
            buffers: [positionsBufferLayout, colorBufferLayout],
        },
        fragment: {
            label: "fs in pipeline",
            module: wgsl,
            entryPoint: 'main_fs',
            targets: [{ format: canvasFormat }],
        },
        depthStencil: {
            label: "ds in pipeline",
            depthWriteEnabled: true,
            depthCompare: 'less',
            format: 'depth24plus'
        },
        primitive: {
            label: "primitive in pipeline",
            topology: 'triangle-list',
            frontFace: "ccw",
            cullMode: "back",
        },
    });
    let lookat = vec3(0.0, 0.0, 0.0)
    let up = vec3(0.0, 1.0, 0.0)

    let A = canvas.width / canvas.height
    let P = perspective(120.0, A, 0.1, 100.0)

    const reflective = [1.0]; // work around to use set, just for consistency sphereData[35] also possible
    const nonReflective = [0.0];
    function animate() {
        let eye = vec3(radius * Math.sin(orbitAngle), 0.0, radius * Math.cos(orbitAngle))
        const view = lookAt(eye, lookat, up);
        const mvp = mult(P, view);
        const flat_mvp = flatten(mvp)
        const identityMatrix = mat4()
        const flatIMatrix = flatten(identityMatrix)
        const inverseView = inverse4(view)
        const rotationView = mat4(
            inverseView[0][0], inverseView[0][1], inverseView[0][2], 0.0,
            inverseView[1][0], inverseView[1][1], inverseView[1][2], 0.0,
            inverseView[2][0], inverseView[2][1], inverseView[2][2], 0.0,
            0.0, 0.0, 0.0, 0.0
        )
        const quadMTex = mult(rotationView, inverse4(P))
        const flatQuadMTex = flatten(quadMTex)
        const flatEye = flatten(eye)
        const uniformArraySize = flat_mvp.length + flatIMatrix.length + flatEye.length + 32 / 8
        const sphereData = new Float32Array(uniformArraySize)
        sphereData.set(flat_mvp, 0)
        sphereData.set(flatIMatrix, flat_mvp.length)
        sphereData.set(flatEye, flatIMatrix.length + flat_mvp.length)
        sphereData.set(reflective, flatIMatrix.length + flat_mvp.length + flatEye.length)




        const quadData = new Float32Array(uniformArraySize)
        quadData.set(flatIMatrix, 0)
        quadData.set(flatQuadMTex, flatIMatrix.length)
        quadData.set(flatEye, flatIMatrix.length + flatQuadMTex.length)
        quadData.set(nonReflective, flatIMatrix.length + flatQuadMTex.length + flatEye.length)


        if (orbiting) {
            orbitAngle += 0.01
            // Rotate the eye space around sphere
            // radius = 5.0 

            device.queue.writeBuffer(sphereUniformBuffer, 0, sphereData);
            device.queue.writeBuffer(quadUniformBuffer, 0, quadData);
            requestAnimationFrame(animate)
        } else {
            device.queue.writeBuffer(sphereUniformBuffer, 0, sphereData);
            device.queue.writeBuffer(quadUniformBuffer, 0, quadData);

        }
        render()
    }

    let sampler = device.createSampler({
        label: "Texture sampler",
        addressModeU: "repeat",
        addressModeV: "repeat",
        minFilter: "linear",
        magFilter: "linear",
        mipmapFilter: "linear",
    });

    const size = sizeof['mat4'] * 2 + sizeof["vec3"] + 16 // size of mvp, MTex, eye, u32 for reflective  
    const sphereUniformBuffer = device.createBuffer({
        label: "uniform buffer",
        size: size,
        usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
    });
    const quadUniformBuffer = device.createBuffer({
        label: "uniform buffer",
        size: size,
        usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
    });

    const quadBindGroup = device.createBindGroup({
        label: "bind group",
        layout: pipeline.getBindGroupLayout(0),
        entries: [
            { binding: 0, resource: sampler },
            { binding: 1, resource: myTexture.createView({ dimension: "cube" }) },
            { binding: 2, resource: { buffer: quadUniformBuffer } },
            { binding: 3, resource: normalMapTexture.createView() },
        ]
    });

    const sphereBindGroup = device.createBindGroup({
        label: "bind group",
        layout: pipeline.getBindGroupLayout(0),
        entries: [
            { binding: 0, resource: sampler },
            { binding: 1, resource: myTexture.createView({ dimension: "cube" }) },
            { binding: 2, resource: { buffer: sphereUniformBuffer } },
            { binding: 3, resource: normalMapTexture.createView() },
        ]
    });


    // Button eventlisteners
    subdivideButton.addEventListener("click", function () {
        if (subdivs < 10) subdivs++;
        calc_indices()
        render()
    })
    coarsenButton.addEventListener("click", function () {
        if (subdivs > 0) subdivs--;
        calc_indices()
        render()
    })
    orbitButton.addEventListener("click", function () {
        orbiting = !orbiting
        requestAnimationFrame(animate)
    })



    function render() {
        const encoder = device.createCommandEncoder();

        const pass = encoder.beginRenderPass({
            colorAttachments: [{
                view: context.getCurrentTexture().createView(),
                loadOp: "clear",
                clearValue: [0.0, 0.0, 0.0, 1.0],
                storeOp: "store",
            }],
            depthStencilAttachment: {
                view: depthTexture.createView(),
                depthLoadOp: "clear",
                depthClearValue: 1.0,
                depthStoreOp: "store",
            }
        });

        pass.setPipeline(pipeline);
        pass.setVertexBuffer(0, positionBuffer);
        pass.setVertexBuffer(1, colorBuffer);
        pass.setIndexBuffer(indexBuffer, 'uint32');

        pass.setBindGroup(0, quadBindGroup);
        pass.drawIndexed(6);


        pass.setBindGroup(0, sphereBindGroup);


        pass.drawIndexed(indices.length - 6, 1, 6, 4);

        //pass.draw(positions.length);
        pass.end();
        device.queue.submit([encoder.finish()]);

    }

    requestAnimationFrame(animate)
}


