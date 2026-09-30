window.onload = function () { main(); }


// RGBA to vec3?
const Colors = Object.freeze({
    BLACK: [0.0, 0.0, 0.0, 0.0],
    CORNFLOWER: [0.3921, 0.5843, 0.9294, 1.0],
    CYAN: [0.0, 1.0, 1.0, 0.9],
    RED: [1.0, 0.0, 0.0, 0.8],
    MAGENTA: [1.0, 0.0, 1.0, 1.0],
    YELLOW: [1.0, 1.0, 0.0, 0.7],
    GREEN: [0.0, 1.0, 0.0, 0.9],
    WHITE: [1.0, 1.0, 1.0, 1.0],
});

const DrawMode = Object.freeze({
    POINT: "Point",
    TRIANGLE: "Triangle",
})

const max_no_of_points = 5000;
const vertices_per_point = 6;
const vertices_per_triangle = 3;

function add_point(pos_array, point, size, color_array, paintColor,) {
    const offset = size / 2;
    var point_coords = [vec2(point[0] - offset, point[1] - offset), vec2(point[0] + offset, point[1] - offset),
    vec2(point[0] - offset, point[1] + offset), vec2(point[0] - offset, point[1] + offset),
    vec2(point[0] + offset, point[1] - offset), vec2(point[0] + offset, point[1] + offset)];
    // Create 6 vec3s with paintcolor for the 6 vertices of of the point
    var color_coords = Array(6).fill(vec3(paintColor));
    pos_array.push.apply(pos_array, point_coords);
    color_array.push.apply(color_array, color_coords);
}

function add_triangle(pos_array, point_array, color_array, paint_array) {
    var point_coords = [vec2(point_array[0]), vec2(point_array[1]), vec2(point_array[2])];

    var color_coords = [vec3(paint_array[0][0], paint_array[0][1], paint_array[0][2]),
    vec3(paint_array[1][0], paint_array[1][1], paint_array[1][2]),
    vec3(paint_array[2][0], paint_array[2][1], paint_array[2][2])];

    // Delete from where the 3 points vertices start and delete to where they end
    const totalPointVertices = vertices_per_point * 3;
    pos_array.splice(pos_array.length - totalPointVertices, totalPointVertices)
    color_array.splice(color_array.length - totalPointVertices, totalPointVertices)

    pos_array.push.apply(pos_array, point_coords);
    color_array.push.apply(color_array, color_coords);
}

function colorSwitch(colorName) {
    let color;

    switch (colorName) {
        case "cornflower blue":
            color = Colors.CORNFLOWER
            break;
        case "black":
            color = Colors.BLACK
            break;
        case "cyan":
            color = Colors.CYAN
            break;
        case "magenta":
            color = Colors.MAGENTA
            break;
        case "yellow":
            color = Colors.YELLOW
            break;
        case "green":
            color = Colors.GREEN
            break;
        case "red":
            color = Colors.RED
            break;
        case "white":
            color = Colors.WHITE
            break;
        default:
            color = Colors.CORNFLOWER
            console.error("No applicable color selected... How did you select this?")
            break;
    }
    return color
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
    // Get menus and buttons
    const clearButton = document.getElementById("clearButton")
    const clearColor = document.getElementById("clearColor");

    const colorSelect = document.getElementById("colorSelect")

    const pointButton = document.getElementById("pointButton")
    const triangleButton = document.getElementById("triangleButton")



    context.configure({
        device: device,
        format: canvasFormat,
    });




    // Scene setup
    var selectedClearColor = "cornflower blue";
    var bgColor = colorSwitch(selectedClearColor);
    var selectedColor = "black";
    var paintColor = colorSwitch(selectedColor);
    var drawMode = DrawMode.POINT;
    let mousepos = 0;
    let index = 0;
    const point_size = 5 * (2 / canvas.height);
    // putting this here to do a bit of error handling in changing modes
    let triangle_array = new Array();
    let triangle_colors = new Array();



    var positions = [];
    var colors = [];

    const positionBuffer = device.createBuffer({
        size: max_no_of_points * sizeof['vec2'] * vertices_per_point,
        usage: GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST,
    });

    const colorBuffer = device.createBuffer({
        size: max_no_of_points * sizeof['vec3'] * vertices_per_point,
        usage: GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST,
    });
    //device.queue.writeBuffer(positionBuffer, /*bufferOffset=*/0, flatten(positions));



    const positionBufferLayout = {
        arrayStride: sizeof['vec2'],
        attributes: [{
            format: 'float32x2',
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

    const wgslfile = document.getElementById('wgsl').src;
    const wgslcode
        = await fetch(wgslfile, { cache: "reload" }).then(r => r.text());
    const wgsl = device.createShaderModule({
        code: wgslcode
    });

    // Render setup

    const pipeline = device.createRenderPipeline({
        layout: 'auto',
        vertex: {
            module: wgsl,
            entryPoint: 'main_vs',
            buffers: [positionBufferLayout, colorBufferLayout],
        },
        fragment: {
            module: wgsl,
            entryPoint: 'main_fs',
            targets: [{ format: canvasFormat }],
        },
        primitive: { topology: 'triangle-list', },
    });


    canvas.addEventListener("click", function (ev) {


        // Fix offset for mouseclicks
        var bbox = ev.target.getBoundingClientRect();
        mousepos = vec2(2 * (ev.clientX - bbox.left) / canvas.width - 1,
            2 * (canvas.height - ev.clientY + bbox.top - 1) / canvas.height - 1);


        add_point(positions, mousepos, point_size, colors, paintColor);
        console.log("Tri_arr: ", triangle_array)
        console.log("tri_color: ", triangle_colors)

        if (drawMode === DrawMode.TRIANGLE) {
            triangle_array.push(mousepos)
            triangle_colors.push(paintColor)
        }
        // Using .slice(index) because flatten(positions) would just keep spitting the same first 12 coords out
        // Probably a mistake I made somewhere, but this works
        device.queue.writeBuffer(positionBuffer, index * sizeof["vec2"], flatten(positions.slice(index)))

        device.queue.writeBuffer(colorBuffer, index * sizeof["vec3"], flatten(colors.slice(index)))
        index += vertices_per_point;
        console.log(triangle_array.length)
        console.log(drawMode)

        if (drawMode === DrawMode.TRIANGLE && triangle_array.length === 3) {

            add_triangle(positions, triangle_array, colors, triangle_colors);

            index -= (vertices_per_point * 3)


            device.queue.writeBuffer(positionBuffer, index * sizeof["vec2"], flatten(positions.slice(index)))
            device.queue.writeBuffer(colorBuffer, index * sizeof["vec3"], flatten(colors.slice(index)))

            triangle_array = [];
            triangle_colors = [];
            index += vertices_per_triangle;
        }

        render();
    });


    clearColor.addEventListener("change", function () {
        const index = clearColor.selectedIndex;
        selectedClearColor = clearColor[index].value;
    });

    clearButton.addEventListener("click", function () {
        positions = [];
        colors = [];
        triangle_array = [];
        triangle_colors = [];
        // Index has to be set to zero to overwrite old boxes in the buffer, I think
        index = 0;

        bgColor = colorSwitch(selectedClearColor)
        render();
    });

    colorSelect.addEventListener("change", function () {
        const index = colorSelect.selectedIndex;
        selectedColor = colorSelect[index].value;
        paintColor = colorSwitch(selectedColor);
    });

    pointButton.addEventListener("click", function () {
        if (triangle_array.length === 0) {
            drawMode = DrawMode.POINT;
        } else {
            alert("Finish your triangle")
        }
    });

    triangleButton.addEventListener("click", function () {
        drawMode = DrawMode.TRIANGLE;
    });


    function render() {
        const encoder = device.createCommandEncoder();
        const pass = encoder.beginRenderPass({
            colorAttachments: [{
                view: context.getCurrentTexture().createView(),
                loadOp: "clear",
                clearValue: bgColor,
                storeOp: "store",
            }]
        });

        pass.setPipeline(pipeline);
        pass.setVertexBuffer(0, positionBuffer);
        pass.setVertexBuffer(1, colorBuffer);
        pass.draw(positions.length);
        pass.end();
        device.queue.submit([encoder.finish()]);

    }
    // Render once to not have a black canvas before first click
    render()
}
