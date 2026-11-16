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
// mat 3 rotate functions inspired from MV.js, because 
// I was getting a wrong dimension exception
function rotateX(theta) {
    return mat3(
        1, 0, 0,
        0, Math.cos(theta), -Math.sin(theta),
        0, Math.sin(theta), Math.cos(theta)
    );
}

function rotateY(theta) {
    return mat3(
        Math.cos(theta), 0, Math.sin(theta),
        0, 1, 0,
        -Math.sin(theta), 0, Math.cos(theta)
    );
}

function getOrthoProj(posX, posY) {
    let d = Math.sqrt(posX ** 2 + posY ** 2)

    return d <= 1 / Math.sqrt(2) ?
        vec3(posX, posY, Math.sqrt(1 - d ** 2)) : vec3(posX, posY, 1 / (2 * d));
}

async function main() {
    const canvas = document.querySelector("canvas");

    if (!navigator.gpu) {
        throw new Error("WebGPU not supported on this browser.");
    }

    const adapter = await navigator.gpu.requestAdapter();

    if (!adapter) {
        throw new Error("No appropriate GPUAdapter found.");
    }

    const device = await adapter.requestDevice();

    const context = canvas.getContext("webgpu");
    const canvasFormat = navigator.gpu.getPreferredCanvasFormat();

    context.configure({
        device: device,
        format: canvasFormat,
    });

    let emissionSlider = document.getElementById("L_e")
    let ambianceSlider = document.getElementById("L_a")
    let diffusionSlider = document.getElementById("k_d")
    let specularSlider = document.getElementById("k_s")
    let shinySlider = document.getElementById("s")

    // Get the float values from the sliders current position/value
    let L_e = parseFloat(emissionSlider.value)
    let L_a = parseFloat(ambianceSlider.value)
    let k_d = parseFloat(diffusionSlider.value)
    let k_s = parseFloat(specularSlider.value)
    let s = parseFloat(shinySlider.value)

    emissionSlider.addEventListener("input", function () { L_e = parseFloat(emissionSlider.value); if (!orbiting) animate(); })
    ambianceSlider.addEventListener("input", function () { L_a = parseFloat(ambianceSlider.value); if (!orbiting) animate(); })
    diffusionSlider.addEventListener("input", function () { k_d = parseFloat(diffusionSlider.value); if (!orbiting) animate(); })
    specularSlider.addEventListener("input", function () { k_s = parseFloat(specularSlider.value); if (!orbiting) animate(); })
    shinySlider.addEventListener("input", function () { s = parseFloat(shinySlider.value); if (!orbiting) animate(); })


    // Scene setup
    const obj_filename = "../3d_models/guru_tutorial_v3.obj";
    const obj = await readOBJFile(obj_filename, 1.0, true);


    let subdivs = 3
    const M = 10

    let orbiting = false;
    let orbitAngle = 0.0;
    let radius = 1.5

    let thetaX = 0.0;
    let thetaY = 0.0;
    let rolling = false;
    let spinning = false;
    let moved = false;

    const M_SQRT2 = Math.sqrt(2.0);
    const M_SQRT6 = Math.sqrt(6.0);

    // Use helper function to unpack vertices in format, that fits with existsing code
    var positions = unpackVec3(obj.vertices);
    var indices = obj.indices;
    let normals = unpackVec3(obj.normals); // normals are named colors from week 4
    let colors = unpackVec3(obj.colors)


    let indexBuffer = device.createBuffer({
        size: indices.byteLength,
        usage: GPUBufferUsage.INDEX | GPUBufferUsage.COPY_DST,
    });

    // Buffer setup
    const positionBuffer = device.createBuffer({
        size: sizeof['vec3'] * Math.pow(4, M + 1),
        usage: GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST,
    });

    let normalBuffer = device.createBuffer({
        size: flatten(normals).byteLength,
        usage: GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST,
    });

    let colorBuffer = device.createBuffer({
        size: flatten(colors).byteLength,
        usage: GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST,
    });



    device.queue.writeBuffer(indexBuffer, 0, indices);

    device.queue.writeBuffer(positionBuffer, 0, flatten(positions));

    device.queue.writeBuffer(normalBuffer, 0, flatten(normals))

    device.queue.writeBuffer(colorBuffer, 0, flatten(colors))



    const positionsBufferLayout = {
        arrayStride: sizeof['vec3'],
        attributes: [{
            format: 'float32x3',
            offset: 0,
            shaderLocation: 0, // Position, see vertex shader
        }],
    };

    const normalBufferLayout = {
        arrayStride: sizeof['vec3'],
        attributes: [{
            format: 'float32x3',
            offset: 0,
            shaderLocation: 1,
        }]
    }

    const colorBufferLayout = {
        arrayStride: sizeof['vec3'],
        attributes: [{
            format: 'float32x3',
            offset: 0,
            shaderLocation: 2,
        }]
    }

    // Render pipeline
    const wgslfile = document.getElementById('wgsl').src;
    const wgslcode
        = await fetch(wgslfile, { cache: "reload" }).then(r => r.text());
    const wgsl = device.createShaderModule({
        code: wgslcode
    });

    const depthTexture = device.createTexture({
        size: { width: canvas.width, height: canvas.height },
        format: 'depth24plus',
        sampleCount: 1,
        usage: GPUTextureUsage.RENDER_ATTACHMENT,
    });

    const pipeline = device.createRenderPipeline({
        layout: 'auto',
        vertex: {
            module: wgsl,
            entryPoint: 'main_vs',
            buffers: [positionsBufferLayout, normalBufferLayout, colorBufferLayout],
        },
        fragment: {
            module: wgsl,
            entryPoint: 'main_fs',
            targets: [{ format: canvasFormat }],
        },
        depthStencil: {
            depthWriteEnabled: true,
            depthCompare: 'less',
            format: 'depth24plus'
        },
        primitive: {
            topology: 'triangle-list',
            frontFace: "ccw",
            cullMode: "back",
        },
    });
    let lookat = vec3(0.0, 0.0, 0.0)
    let up = vec3(0.0, 1.0, 0.0)

    let A = canvas.width / canvas.height
    let P = perspective(45.0, A, 0.1, 100.0)
    let initEye = vec3(0, 0.5, radius)
    let eye = initEye
    let view = lookAt(eye, lookat, up);
    let q_rot = new Quaternion()
    let q_inc = new Quaternion()
    // save the pan coords:
    let xPan = 0.0
    let yPan = 0.0

    let rollTime = 0.0
    function updateUniforms(mvp, view) {
        const data = new Float32Array(44);

        // First 16 indices filled by mvp matrix
        data.set(flatten(mvp), 0);
        data.set(flatten(view), 16)

        data[32] = L_e;
        data[33] = L_e;
        data[34] = L_e;


        data[36] = L_a;
        data[37] = L_a;
        data[38] = L_a;

        data[39] = k_d;
        data[40] = k_s;
        data[41] = s;

        device.queue.writeBuffer(uniformBuffer, 0, data);
    }

    canvas.addEventListener("mousedown", function (ev) {

        let bbox = ev.target.getBoundingClientRect();
        // Map to [-1,1]
        let x0 = 2 * (ev.clientX - bbox.left) / canvas.width - 1;
        let y0 = 2 * (canvas.height - ev.clientY + bbox.top - 1) / canvas.height - 1;
        let y0Client = ev.clientY
        let x0Client = ev.clientX

        let u = getOrthoProj(x0, y0)
        if (ev.button == 0) {
            rolling = true;
            this.addEventListener("mousemove", roll)
        } else if (ev.button == 2) {
            this.addEventListener("mousemove", dolly)
        } else if (ev.button == 1) {
            ev.preventDefault(); // Prevent scrolling with middle mouse click
            this.addEventListener("mousemove", pan)
        }

        this.addEventListener("mouseup", release)
        const sens = 0.005
        function roll(e) {
            let x = 2 * (e.clientX - bbox.left) / canvas.width - 1
            let y = 2 * (canvas.height - e.clientY + bbox.top - 1) / canvas.height - 1

            let v = getOrthoProj(x, y)

            x0 = x
            y0 = y

            q_inc = q_inc.make_rot_vec2vec(normalize(u), normalize(v))
            q_rot.multiply(q_inc)
            u = v

            rollTime = Date.now();

            moved = true;

            view = lookAt(add(q_rot.apply(eye), lookat), lookat, q_rot.apply(up));

            requestAnimationFrame(animate)

        }
        function dolly(e) {
            // Only change y for dolly
            let y = e.clientY
            // Update z_eye before y0
            eye[2] += sens * (y0Client - y)

            y0Client = y

            view = lookAt(add(q_rot.apply(eye), lookat), lookat, q_rot.apply(up));

            requestAnimationFrame(animate)

        }
        function pan(e) {
            // lookat is 0,0,0
            let a = vec3(0, 0, 0)
            let x = e.clientX
            let y = e.clientY

            xPan += x - x0Client
            yPan += y0Client - y

            x0Client = x
            y0Client = y

            // x where displacement should be specified?
            let xVec = q_rot.apply(vec3(1, 0, 0));

            // This is equal to
            // c = a-(x_pan*q_rot*x*q_rot^-1+ y_pan*q_rot*y*q_rot^-1)
            lookat = subtract(a, add(
                scale(xPan * sens, xVec),
                scale(yPan * sens, up)
            ));
            view = lookAt(add(q_rot.apply(eye), lookat), lookat, q_rot.apply(up));


            requestAnimationFrame(animate)

        }
        function release() {
            if (ev.button == 0) {
                if (Date.now() - rollTime < 20) {
                    spinning = true;
                } else {
                    spinning = false;
                    q_inc.setIdentity();
                }
                this.removeEventListener("mousemove", roll)
            } else if (ev.button == 2) {
                this.removeEventListener("mousemove", dolly)
            } else if (ev.button == 1) {
                this.removeEventListener("mousemove", pan)
            }
            this.removeEventListener("mouseup", release)
        }
    });
    function animate() {
        if (rolling || spinning) {
            if (moved || spinning) {
                q_rot.multiply(q_inc);
                moved = false;

                view = lookAt(add(q_rot.apply(eye), lookat), lookat, q_rot.apply(up));
            }
        }
        const mvp = mult(P, view);

        updateUniforms(mvp, view)
        render()

        // Keep animating the spinning, even when not interacting
        if (rolling || spinning) {
            requestAnimationFrame(animate);
        }
    }

    const uniformBuffer = device.createBuffer({
        size: 176,
        usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
    });

    const bindGroup = device.createBindGroup({
        layout: pipeline.getBindGroupLayout(0),
        entries: [{
            binding: 0,
            resource: { buffer: uniformBuffer }
        }],
    });





    requestAnimationFrame(animate)

    function render() {
        const encoder = device.createCommandEncoder();

        const pass = encoder.beginRenderPass({
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
        });

        pass.setPipeline(pipeline);
        pass.setVertexBuffer(0, positionBuffer);
        pass.setVertexBuffer(1, normalBuffer);
        pass.setVertexBuffer(2, colorBuffer);
        pass.setBindGroup(0, bindGroup);
        pass.setIndexBuffer(indexBuffer, 'uint32');


        pass.drawIndexed(indices.length);
        //pass.draw(positions.length);
        pass.end();
        device.queue.submit([encoder.finish()]);

    }

    requestAnimationFrame(animate)
}


