function subdivide_sphere(positions, indices, colors) {
    let new_indices = new Uint32Array(indices.length * 4);
    let triangles = indices.length / 3;
    let idx = triangles;


    for (let i = 0; i < triangles; ++i) {
        let i0 = indices[i * 3];
        let i1 = indices[i * 3 + 1];
        let i2 = indices[i * 3 + 2];
        let c01 = idx;
        let c12 = idx + 1;
        let c20 = idx + 2;
        idx += 3;
        if (idx > positions.length) {
            positions.push(normalize(add(positions[i0], positions[i1])));
            positions.push(normalize(add(positions[i1], positions[i2])));
            positions.push(normalize(add(positions[i2], positions[i0])));
            colors.push(add(scale(0.5, normalize(add(positions[i0], positions[i1]))), vec3(0.5, 0.5, 0.5)));
            colors.push(add(scale(0.5, normalize(add(positions[i1], positions[i2]))), vec3(0.5, 0.5, 0.5)));
            colors.push(add(scale(0.5, normalize(add(positions[i2], positions[i0]))), vec3(0.5, 0.5, 0.5)));

        }
        new_indices.set([i0, c01, c20,
            c20, c01, c12,
            c12, c01, i1,
            c20, c12, i2], i * 12);
    }
    return new_indices
}