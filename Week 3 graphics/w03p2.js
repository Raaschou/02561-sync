window.onload = function () { main(); }

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


    // Scene setup
    const numOfCubes = 3;
    const cubeVertexCubes = 36;


    let positions = [
        vec3(0.0, 0.0, 1.0),
        vec3(0.0, 1.0, 1.0),
        vec3(1.0, 1.0, 1.0),
        vec3(1.0, 0.0, 1.0),
        vec3(0.0, 0.0, 0.0),
        vec3(0.0, 1.0, 0.0),
        vec3(1.0, 1.0, 0.0),
        vec3(1.0, 0.0, 0.0),
    ];

    let colors = [
        vec3(0.0, 0.0, 1.0),
        vec3(0.0, 1.0, 1.0),
        vec3(1.0, 1.0, 1.0),
        vec3(1.0, 0.0, 1.0),
        vec3(0.0, 0.0, 0.0),
        vec3(0.0, 1.0, 0.0),
        vec3(1.0, 1.0, 0.0),
        vec3(1.0, 0.0, 0.0),

    ];

    //Wire frame indices
    let wire_indices = new Uint32Array([
        0, 1, 1, 2, 2, 3, 3, 0, // front
        2, 3, 3, 7, 7, 6, 6, 2, // right
        0, 3, 3, 7, 7, 4, 4, 0, // down
        1, 2, 2, 6, 6, 5, 5, 1, // up
        4, 5, 5, 6, 6, 7, 7, 4, // back
        0, 1, 1, 5, 5, 4, 4, 0 // left
    ]);


    // Buffer setup
    const positionsBuffer = device.createBuffer({
        size: flatten(positions).byteLength,
        usage: GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST,
    });


    const colorBuffer = device.createBuffer({
        size: flatten(colors).byteLength,
        usage: GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST,
    });

    const indexBuffer = device.createBuffer({
        size: wire_indices.byteLength,
        usage: GPUBufferUsage.INDEX | GPUBufferUsage.COPY_DST,
    });


    device.queue.writeBuffer(positionsBuffer, 0, flatten(positions));
    device.queue.writeBuffer(colorBuffer, 0, flatten(colors))
    device.queue.writeBuffer(indexBuffer, 0, wire_indices);


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

    // Render pipeline
    const wgslfile = document.getElementById('wgsl').src;
    const wgslcode
        = await fetch(wgslfile, { cache: "reload" }).then(r => r.text());
    const wgsl = device.createShaderModule({
        code: wgslcode
    });

    const pipeline = device.createRenderPipeline({
        layout: 'auto',
        vertex: {
            module: wgsl,
            entryPoint: 'main_vs',
            buffers: [positionsBufferLayout, colorBufferLayout],
        },
        fragment: {
            module: wgsl,
            entryPoint: 'main_fs',
            targets: [{ format: canvasFormat }],
        },
        primitive: { topology: 'line-list', },
    });



    let A = canvas.width / canvas.height
    let P = perspective(45.0, A, 0.0, 100.0)

    let eye = vec3(0.5, 0.5, -5.0)
    let lookat = vec3(0.5, 0.5, 0.5)
    let up = vec3(0.0, 1.0, 0.0)

    // Transformation matrix for part 1
    const M_st = mat4(
        1.0, 0.0, 0.0, 0.0,
        0.0, 1.0, 0.0, 0.0,
        0.0, 0.0, 0.25, 0.25,
        0.0, 0.0, 0.0, 1.0
    );

    // T1 and R1 was used with non-zero values, when I hadn't quite figured out the view vectors
    // They do nothing :)
    let T1 = translate(0.0, 0.0, 0.0);
    let R1 = rotateX(0)

    // T2 moves the cube out of the way of the first cube, -1.0 in x and y direction, so right and down in the field
    let T2 = translate(-1.0, -1.0, 0.0);
    // Resulting matrix from T1
    // 1.0 0.0 0.0 -1.0 
    // 0.0 1.0 0.0 -1.0 
    // 0.0 0.0 1.0  0.0
    // 0.0 0.0 0.0  1.0

    // R2 rotates the cube 45 degrees only in the y plane, 
    // thereby creating 2 sets of parallel lines, i.e. 2 point perspective
    let R2 = rotateY(45)
    // Resulting matrix from T2
    // cos(radians(45)) 0.0 -sin(radians(45)) 0.0 
    // 0.0 1.0 0.0 0.0 
    // sin(radians(45)) 0.0 cos(radians(45))  0.0
    // 0.0 0.0 0.0  1.0

    // Same concept as T2, but I also move the cube closer to the eye view by using -2.0 in the z direction
    let T3 = translate(1.5, 1.0, -2.0);
    // Resulting matrix from T3
    // 1.0 0.0 0.0  1.5 
    // 0.0 1.0 0.0  1.0 
    // 0.0 0.0 1.0 -2.0
    // 0.0 0.0 0.0  1.0
    // R3 rotates the cube in the y and x plane creating 3 sets of parallel line, creating 3 point perspective
    let R3 = mult(rotateY(45), rotateX(-30))
    // Resulting matrix from T2
    // cos(radians(45)) 0.0 -sin(radians(45)) 0.0 
    // 0.0 cos(radians(30)) sin(radians(30)) 0.0 
    // sin(radians(45) -sin(radians(30)) cos(radians(30))*cos(radians(45))  0.0
    // 0.0 0.0 0.0  1.0

    const view = lookAt(eye, lookat, up);

    const mvp = mult(P, mult(view, mult(T1, R1)))
    const mvp2 = mult(P, mult(view, mult(T2, R2)))
    const mvp3 = mult(P, mult(view, mult(T3, R3)))
    /* const mvp = mult(T1, mult(Rx, mult(mat4(), mult(P, view))));
    const mvp2 = mult(T2, mult(Rz, mult(P, view)));
    const mvp3 = mult(T3, mult(Ry, mult(RminusX, mult(S, mult(P, view)))));
 */

    const mvpMatrices = new Float32Array(16 * numOfCubes)
    mvpMatrices.set(flatten(mvp), 0)
    mvpMatrices.set(flatten(mvp2), 16)
    mvpMatrices.set(flatten(mvp3), 32)


    const uniformBuffer = device.createBuffer({
        size: sizeof['mat4'] * numOfCubes,
        usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
    });

    const bindGroup = device.createBindGroup({
        layout: pipeline.getBindGroupLayout(0),
        entries: [{
            binding: 0,
            resource: { buffer: uniformBuffer }
        }],
    });

    device.queue.writeBuffer(uniformBuffer, 0, mvpMatrices);


    render();



    function render() {
        const encoder = device.createCommandEncoder();

        const pass = encoder.beginRenderPass({
            colorAttachments: [{
                view: context.getCurrentTexture().createView(),
                loadOp: "clear",
                clearValue: [0.3921, 0.5843, 0.9294, 1.0],
                storeOp: "store",
            }]
        });

        pass.setPipeline(pipeline);
        pass.setVertexBuffer(0, positionsBuffer);
        pass.setVertexBuffer(1, colorBuffer);
        pass.setBindGroup(0, bindGroup);
        pass.setIndexBuffer(indexBuffer, 'uint32');


        pass.drawIndexed(wire_indices.length, numOfCubes);
        //pass.draw(positions.length);
        pass.end();
        device.queue.submit([encoder.finish()]);

    }

    //requestAnimationFrame(animate)
}


