// собирается prototypes/comfort-figs/build.mjs
const AZIMUTH = 45;
const ELEVATION = 30;
const SHADES = 4;
const RADIANS = Math.PI / 180;
const UNIT = Math.sqrt(1.6);
function cameraOf({ scale, azimuth = AZIMUTH, elevation = ELEVATION }) {
    const a = azimuth * RADIANS;
    const e = elevation * RADIANS;
    return { sinA: Math.sin(a), cosA: Math.cos(a), sinE: Math.sin(e), cosE: Math.cos(e), k: scale * UNIT };
}
function iso([x, y, z], projection) {
    const { origin } = projection;
    const { sinA, cosA, sinE, cosE, k } = cameraOf(projection);
    return [origin[0] + (x * sinA - y * cosA) * k, origin[1] + ((x * cosA + y * sinA) * sinE - z * cosE) * k];
}
function towardViewer(projection) {
    const { sinA, cosA } = cameraOf(projection);
    return [cosA, sinA];
}
function depthOf([x, y, z], projection) {
    const { sinA, cosA, sinE, cosE } = cameraOf(projection);
    return (x * cosA + y * sinA) * cosE + z * sinE;
}
const tenth = (value) => {
    const text = (Math.round(value * 10) / 10).toFixed(1).replace(/\.0$/, "");
    return text === "-0" ? "0" : text;
};
function pathOf(points, closed = false) {
    if (!points.length)
        return "";
    return points.map(([x, y], at) => `${at ? "L" : "M"}${tenth(x)} ${tenth(y)}`).join("") + (closed ? "Z" : "");
}
const joinPaths = (paths) => paths.filter(Boolean).join("");
function roundedPlan({ x, y, w, d, r }, steps = 8) {
    const radius = Math.max(0, Math.min(r, w / 2, d / 2));
    const corners = [
        [x + w - radius, y + radius, -90],
        [x + w - radius, y + d - radius, 0],
        [x + radius, y + d - radius, 90],
        [x + radius, y + radius, 180],
    ];
    const out = [];
    for (const [cx, cy, start] of corners) {
        const count = radius > 0 ? steps : 0;
        for (let step = 0; step <= count; step++) {
            const angle = (start + (count ? (90 * step) / count : 45)) * RADIANS;
            out.push([cx + radius * Math.cos(angle), cy + radius * Math.sin(angle)]);
        }
    }
    return out;
}
function signedArea(points) {
    let area = 0;
    for (let index = 0; index < points.length; index++) {
        const [ax, ay] = points[index];
        const [bx, by] = points[(index + 1) % points.length];
        area += ax * by - bx * ay;
    }
    return area / 2;
}
const oriented = (points) => (signedArea(points) < 0 ? [...points].reverse() : points);
function convexHull(points) {
    const sorted = [...points].sort((a, b) => a[0] - b[0] || a[1] - b[1]);
    if (sorted.length < 3)
        return sorted;
    const cross = (o, a, b) => (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);
    const lower = [];
    for (const point of sorted) {
        while (lower.length >= 2 && cross(lower[lower.length - 2], lower[lower.length - 1], point) <= 0)
            lower.pop();
        lower.push(point);
    }
    const upper = [];
    for (let index = sorted.length - 1; index >= 0; index--) {
        const point = sorted[index];
        while (upper.length >= 2 && cross(upper[upper.length - 2], upper[upper.length - 1], point) <= 0)
            upper.pop();
        upper.push(point);
    }
    return [...lower.slice(0, -1), ...upper.slice(0, -1)];
}
function runsOf(flags, want) {
    const count = flags.length;
    const runs = [];
    const start = flags.findIndex((flag, index) => flag !== flags[(index + count - 1) % count]);
    if (start < 0)
        return flags[0] === want ? [Array.from({ length: count + 1 }, (_, index) => index % count)] : [];
    let run = null;
    for (let step = 0; step < count; step++) {
        const index = (start + step) % count;
        if (flags[index] === want) {
            if (!run)
                run = [index];
            run.push((index + 1) % count);
        }
        else if (run) {
            runs.push(run);
            run = null;
        }
    }
    if (run)
        runs.push(run);
    return runs;
}
function extrude(ring, z, height, projection, options = {}) {
    const convex = options.convex ?? true;
    const count = ring.length;
    const counter = signedArea(ring) > 0;
    const [vx, vy] = towardViewer(projection);
    const { sinA, cosA } = cameraOf(projection);
    const normals = ring.map(([ax, ay], index) => {
        const [bx, by] = ring[(index + 1) % count];
        const dx = bx - ax;
        const dy = by - ay;
        const length = Math.hypot(dx, dy) || 1;
        return (counter ? [dy / length, -dx / length] : [-dy / length, dx / length]);
    });
    const facing = normals.map(([nx, ny]) => nx * vx + ny * vy > 1e-9);
    const top = ring.map(([x, y]) => iso([x, y, z + height], projection));
    const bottom = ring.map(([x, y]) => iso([x, y, z], projection));
    const outline = [];
    const crease = [];
    for (const run of runsOf(facing, false))
        outline.push(pathOf(run.map((index) => top[index])));
    for (const run of runsOf(facing, true)) {
        crease.push(pathOf(run.map((index) => top[index])));
        if (height > 0)
            outline.push(pathOf(run.map((index) => bottom[index])));
    }
    if (height > 0) {
        for (let index = 0; index < count; index++) {
            if (facing[(index + count - 1) % count] !== facing[index])
                outline.push(pathOf([top[index], bottom[index]]));
        }
    }
    let fill;
    if (convex) {
        fill = pathOf(convexHull([...top, ...bottom]), true);
    }
    else {
        const parts = [pathOf(oriented(top), true), pathOf(oriented(bottom), true)];
        for (let index = 0; index < count; index++) {
            if (!facing[index])
                continue;
            const next = (index + 1) % count;
            parts.push(pathOf(oriented([top[index], top[next], bottom[next], bottom[index]]), true));
        }
        fill = parts.join("");
    }
    const buckets = Array.from({ length: SHADES }, () => []);
    if (height > 0) {
        const [lx, ly] = [-sinA, cosA];
        for (let index = 0; index < count; index++) {
            if (!facing[index])
                continue;
            const [nx, ny] = normals[index];
            const lit = (nx * lx + ny * ly + 1) / 2;
            const shade = Math.min(SHADES - 1, Math.max(0, Math.floor(lit * SHADES)));
            const next = (index + 1) % count;
            buckets[shade].push(pathOf(oriented([top[index], top[next], bottom[next], bottom[index]]), true));
        }
    }
    let bevel;
    if (options.bevel && options.bevel > 0) {
        const by = options.bevel;
        const inset = ring.map(([x, y], index) => {
            const [ax, ay] = normals[(index + count - 1) % count];
            const [bx, by2] = normals[index];
            const mx = ax + bx;
            const my = ay + by2;
            const length = Math.hypot(mx, my) || 1;
            return [x - (mx / length) * by, y - (my / length) * by];
        });
        const insetTop = inset.map(([x, y]) => iso([x, y, z + height], projection));
        bevel = runsOf(facing, true)
            .map((run) => pathOf([top[run[0]], ...run.slice(1, -1).map((index) => insetTop[index]), top[run[run.length - 1]]]))
            .join("");
    }
    return {
        fill,
        outline: outline.join(""),
        crease: crease.join(""),
        top: pathOf(oriented(top), true),
        shades: buckets.map((paths) => paths.join("")),
        bevel,
    };
}
const ringOf = (plan, steps = 8) => roundedPlan(plan, steps);
function slabOf(plan, z, height, projection, steps = 8, bevel = 0) {
    return extrude(ringOf(plan, steps), z, height, projection, { convex: true, bevel });
}
function circleRing(cx, cy, radius, steps = 40) {
    return Array.from({ length: steps }, (_, step) => {
        const angle = (step / steps) * Math.PI * 2;
        return [cx + radius * Math.cos(angle), cy + radius * Math.sin(angle)];
    });
}
function cylinder(cx, cy, radius, z, height, projection, steps = 32, bevel = 0) {
    return extrude(circleRing(cx, cy, radius, steps), z, height, projection, { convex: true, bevel });
}
const insetPlan = ({ x, y, w, d, r }, by) => ({ x: x + by, y: y + by, w: w - by * 2, d: d - by * 2, r: Math.max(0, r - by) });
function onTop(points, z, projection, closed = false) {
    return pathOf(points.map(([x, y]) => iso([x, y, z], projection)), closed);
}
const planOutline = (plan, z, projection, steps = 8) => onTop(ringOf(plan, steps), z, projection, true);
const lineOnTop = (from, to, z, projection) => onTop([from, to], z, projection);
const segment = (from, to, projection) => pathOf([iso(from, projection), iso(to, projection)]);
const rise = (at, from, to, projection) => segment([at[0], at[1], from], [at[0], at[1], to], projection);
const ring = (cx, cy, radius, z, projection, steps = 40) => onTop(circleRing(cx, cy, radius, steps), z, projection, true);
const pointsAt = (points, projection) => points.map((point) => iso(point, projection));
function dotGrid(x, y, columns, rows, gap, z, projection) {
    const dots = [];
    for (let row = 0; row < rows; row++) {
        for (let column = 0; column < columns; column++)
            dots.push(iso([x + column * gap, y + row * gap, z], projection));
    }
    return dots;
}
function corners({ x, y, w, d }, inset = 0) {
    return [
        [x + inset, y + inset],
        [x + w - inset, y + inset],
        [x + inset, y + d - inset],
        [x + w - inset, y + d - inset],
    ];
}
function boxCorners({ x, y, w, d }, z0, z1) {
    const out = [];
    for (const px of [x, x + w])
        for (const py of [y, y + d])
            for (const z of [z0, z1])
                out.push([px, py, z]);
    return out;
}
function knurl(cx, cy, radius, z0, z1, count, projection, inset = 0.4) {
    const [vx, vy] = towardViewer(projection);
    const lines = [];
    for (let index = 0; index < count; index++) {
        const angle = (index / count) * Math.PI * 2;
        const nx = Math.cos(angle);
        const ny = Math.sin(angle);
        if (nx * vx + ny * vy < 0.15)
            continue;
        lines.push(segment([cx + radius * nx, cy + radius * ny, z0 + inset], [cx + radius * nx, cy + radius * ny, z1 - inset], projection));
    }
    return lines.join("");
}
function sideArc(cx, cy, radius, z, projection, steps = 24) {
    const [vx, vy] = towardViewer(projection);
    const facing = Math.atan2(vy, vx);
    const points = [];
    for (let step = 0; step <= steps; step++) {
        const angle = facing - Math.PI / 2 + (step / steps) * Math.PI;
        points.push(iso([cx + radius * Math.cos(angle), cy + radius * Math.sin(angle), z], projection));
    }
    return pathOf(points);
}
function ringSeam(ring, z, projection) {
    const count = ring.length;
    const counter = signedArea(ring) > 0;
    const [vx, vy] = towardViewer(projection);
    const facing = ring.map(([ax, ay], index) => {
        const [bx, by] = ring[(index + 1) % count];
        const dx = bx - ax;
        const dy = by - ay;
        const [nx, ny] = counter ? [dy, -dx] : [-dy, dx];
        return nx * vx + ny * vy > 1e-9;
    });
    return runsOf(facing, true).map((run) => pathOf(run.map((index) => iso([ring[index][0], ring[index][1], z], projection)))).join("");
}
const sideSeam = (plan, z, projection, steps = 8) => ringSeam(ringOf(plan, steps), z, projection);
function sideRing(center, radius, axis, projection, steps = 20) {
    const [px, py, pz] = center;
    const points = [];
    for (let step = 0; step < steps; step++) {
        const angle = (step / steps) * Math.PI * 2;
        const u = radius * Math.cos(angle);
        const v = radius * Math.sin(angle);
        points.push(iso(axis === "x" ? [px, py + u, pz + v] : [px + u, py, pz + v], projection));
    }
    return pathOf(points, true);
}
function coil(from, to, center, radius, turns, axis, projection, perTurn = 16) {
    const count = Math.max(1, Math.round(turns * perTurn));
    const back = [];
    const front = [];
    let run = [];
    let near = null;
    for (let index = 0; index <= count; index++) {
        const share = index / count;
        const angle = share * turns * Math.PI * 2;
        const u = radius * Math.cos(angle);
        const v = radius * Math.sin(angle);
        const along = from + (to - from) * share;
        const point = axis === "x" ? [along, center[0] + u, center[1] + v] : [center[0] + u, along, center[1] + v];
        const normal = axis === "x" ? [0, Math.cos(angle), Math.sin(angle)] : [Math.cos(angle), 0, Math.sin(angle)];
        const facing = depthOf(normal, projection) > 0;
        const flat = iso(point, projection);
        if (near === null)
            near = facing;
        if (facing !== near) {
            run.push(flat);
            (near ? front : back).push(pathOf(run));
            run = [flat];
            near = facing;
            continue;
        }
        run.push(flat);
    }
    if (run.length > 1)
        (near ? front : back).push(pathOf(run));
    return { back: back.join(""), front: front.join("") };
}
function topTicks(from, to, step, every, edge, z, lengths, projection, axis = "x") {
    const minor = [];
    const major = [];
    const first = Math.ceil(from / step) * step;
    for (let at = first, index = Math.round(first / step); at <= to + 1e-9; at += step, index++) {
        const big = index % every === 0;
        const length = big ? lengths[1] : lengths[0];
        const a = axis === "x" ? [at, edge] : [edge, at];
        const b = axis === "x" ? [at, edge + length] : [edge + length, at];
        (big ? major : minor).push(lineOnTop(a, b, z, projection));
    }
    return { minor: minor.join(""), major: major.join("") };
}
function sideTicks(from, to, step, every, face, top, lengths, projection, axis = "x") {
    const minor = [];
    const major = [];
    const first = Math.ceil(from / step) * step;
    for (let at = first, index = Math.round(first / step); at <= to + 1e-9; at += step, index++) {
        const big = index % every === 0;
        const length = big ? lengths[1] : lengths[0];
        const a = axis === "x" ? [at, face, top] : [face, at, top];
        const b = axis === "x" ? [at, face, top - length] : [face, at, top - length];
        (big ? major : minor).push(segment(a, b, projection));
    }
    return { minor: minor.join(""), major: major.join("") };
}
function radialTicks(cx, cy, radius, count, every, z, lengths, projection, from = 0, span = Math.PI * 2) {
    const minor = [];
    const major = [];
    const closed = Math.abs(span - Math.PI * 2) < 1e-9;
    const steps = closed ? count : count + 1;
    for (let index = 0; index < steps; index++) {
        const angle = from + (index / count) * span;
        const big = index % every === 0;
        const inner = radius - (big ? lengths[1] : lengths[0]);
        const sx = Math.sin(angle);
        const sy = -Math.cos(angle);
        (big ? major : minor).push(lineOnTop([cx + sx * inner, cy + sy * inner], [cx + sx * radius, cy + sy * radius], z, projection));
    }
    return { minor: minor.join(""), major: major.join("") };
}
const haloOf = (plan, z, height, projection) => slabOf(plan, z, height, projection).fill;
function axisVector(projection, [dx, dy, dz]) {
    const origin = iso([0, 0, 0], projection);
    const moved = iso([dx, dy, dz], projection);
    return [moved[0] - origin[0], moved[1] - origin[1]];
}
const fine = (value) => Math.round(value * 100) / 100;
function translateAlong(projection, by) {
    const [x, y] = axisVector(projection, by);
    return `translate(${fine(x)} ${fine(y)})`;
}
const thousandth = (value) => Math.round(value * 1000) / 1000;
function axesAt(at, z, projection) {
    const origin = iso([at[0], at[1], z], projection);
    const along = (point) => {
        const [px, py] = iso(point, projection);
        return [px - origin[0], py - origin[1]];
    };
    return { origin, x: along([at[0] + 1, at[1], z]), y: along([at[0], at[1] + 1, z]), z: along([at[0], at[1], z + 1]) };
}
const matrixOf = (u, v, origin) => `matrix(${thousandth(u[0])} ${thousandth(u[1])} ${thousandth(v[0])} ${thousandth(v[1])} ${thousandth(origin[0])} ${thousandth(origin[1])})`;
function holdStill(element, [dx, dy]) {
    const text = dx || dy ? `translate(${-dx} ${-dy})` : "";
    element.querySelectorAll("[data-hold]").forEach((node) => (text ? node.setAttribute("transform", text) : node.removeAttribute("transform")));
}
function topMatrix(at, z, projection, along = "x") {
    const { origin, x, y } = axesAt(at, z, projection);
    return along === "x" ? matrixOf(x, y, origin) : matrixOf([-y[0], -y[1]], x, origin);
}
function sideMatrix(at, z, projection, face) {
    const { origin, x, y, z: up } = axesAt(at, z, projection);
    const down = [-up[0], -up[1]];
    return face === "left" ? matrixOf(x, down, origin) : matrixOf([-y[0], -y[1]], down, origin);
}
function screenRise(height, projection) {
    const { cosE, k } = cameraOf(projection);
    return height * cosE * k;
}
function fitProjection(points, width, height, { pad = 24, headroom = 0, azimuth = AZIMUTH, elevation = ELEVATION } = {}) {
    const unit = { origin: [0, 0], scale: 1, azimuth, elevation };
    const flat = points.map((point) => iso(point, unit));
    const xs = flat.map(([x]) => x);
    const ys = flat.map(([, y]) => y);
    const left = Math.min(...xs);
    const right = Math.max(...xs);
    const up = Math.min(...ys);
    const down = Math.max(...ys);
    const scale = Math.min((width - pad * 2) / (right - left), (height - pad * 2 - headroom) / (down - up));
    return {
        origin: [width / 2 - ((left + right) / 2) * scale, headroom + (height - headroom) / 2 - ((up + down) / 2) * scale],
        scale,
        azimuth,
        elevation,
    };
}
const escape = (text) => text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
const attrs = (pairs) => Object.entries(pairs)
    .filter(([, value]) => value !== undefined && value !== false)
    .map(([key, value]) => ` ${key}="${escape(String(value))}"`)
    .join("");
function solidSvg(paths, { tone = "hi", crease = "faint", halo = false, lit = false, flat = false, className, inner = "" } = {}) {
    const parts = [];
    if (halo)
        parts.push(`<path class="iso-halo" d="${paths.fill}"/>`);
    parts.push(`<path class="iso-fill" d="${paths.fill}"/>`);
    if (!flat) {
        paths.shades.forEach((d, shade) => {
            if (d)
                parts.push(`<path class="iso-shade" data-shade="${shade}" d="${d}"/>`);
        });
        parts.push(`<path class="iso-top" d="${paths.top}"/>`);
    }
    if (crease !== "none" && paths.crease)
        parts.push(`<path class="iso-line iso-crease" data-tone="${crease}" d="${paths.crease}"/>`);
    if (crease !== "none" && paths.bevel)
        parts.push(`<path class="iso-line iso-bevel" data-tone="${crease}" d="${paths.bevel}"/>`);
    if (inner)
        parts.push(inner);
    parts.push(`<path class="iso-line iso-edge" data-tone="${tone}" d="${paths.outline}"/>`);
    return `<g${attrs({ class: className ? `iso-solid ${className}` : "iso-solid", "data-lit": lit ? "" : undefined, "data-seamless": paths.seamless ? "" : undefined })}>${parts.join("")}</g>`;
}
function lineSvg(d, { tone = "lo", dotted = false, dashed = false, flow = false, className, free } = {}) {
    if (!d)
        return "";
    return `<path${attrs({
        class: className ? `iso-line ${className}` : "iso-line",
        "data-tone": tone,
        "data-free": free === true ? "" : free || undefined,
        "data-dotted": dotted ? "" : undefined,
        "data-dashed": dashed ? "" : undefined,
        "data-flow": flow ? "" : undefined,
        d,
    })}/>`;
}
function dotsSvg(points, { size = 0.5, tone = "mid", pulse = false } = {}) {
    const dots = points
        .map(([x, y, alpha], index) => `<circle cx="${tenth(x)}" cy="${tenth(y)}" r="${size}"${alpha !== undefined && alpha < 1 ? ` fill-opacity="${Math.max(0, alpha).toFixed(2)}"` : ""}${pulse ? ` data-pulse="" style="--pulse-at:${(index * 137) % 1600}ms"` : ""}/>`)
        .join("");
    return `<g class="iso-dots" data-tone="${tone}">${dots}</g>`;
}
function fadedSvg(list, style = {}) {
    const groups = new Map();
    for (const entry of list) {
        const [d, alpha] = Array.isArray(entry) ? entry : [entry.d, entry.alpha];
        if (!d || !(alpha > 0.02))
            continue;
        const level = Math.min(1, Math.round(alpha * 20) / 20);
        groups.set(level, (groups.get(level) ?? "") + d);
    }
    return [...groups].map(([alpha, d]) => (alpha >= 1 ? lineSvg(d, style) : `<g opacity="${alpha.toFixed(2)}">${lineSvg(d, style)}</g>`)).join("");
}
function fadeLineSvg(points, { fade = [0, 0], tone = "lo", className, stops = 6 } = {}) {
    if (points.length < 2)
        return "";
    const ease = (t) => t * t * (3 - 2 * t);
    const hashOf = (text) => {
        let hash = 2166136261;
        for (let index = 0; index < text.length; index++)
            hash = Math.imul(hash ^ text.charCodeAt(index), 16777619);
        return (hash >>> 0).toString(36);
    };
    const lengths = [0];
    for (let index = 1; index < points.length; index++)
        lengths.push(lengths[index - 1] + Math.hypot(points[index][0] - points[index - 1][0], points[index][1] - points[index - 1][1]));
    const at = (length) => {
        let index = 1;
        while (index < points.length - 1 && lengths[index] < length)
            index++;
        const span = lengths[index] - lengths[index - 1] || 1;
        const t = Math.max(0, Math.min(1, (length - lengths[index - 1]) / span));
        return [points[index - 1][0] + (points[index][0] - points[index - 1][0]) * t, points[index - 1][1] + (points[index][1] - points[index - 1][1]) * t];
    };
    const pieceOf = (from, to) => [at(from), ...points.filter((_, index) => lengths[index] > from + 1e-6 && lengths[index] < to - 1e-6), at(to)];
    const total = lengths[lengths.length - 1];
    if (total < 1e-6)
        return "";
    let [start, end] = Array.isArray(fade) ? fade : [fade, fade];
    if (start + end > total) {
        const share = total / (start + end);
        start *= share;
        end *= share;
    }
    const paint = `var(--anatomy-${tone})`;
    const ramp = (piece, rising) => {
        const d = pathOf(piece);
        const [x1, y1] = piece[0];
        const [x2, y2] = piece[piece.length - 1];
        const id = `iso-fade-${hashOf(`${d}|${tone}|${rising}`)}`;
        const marks = Array.from({ length: stops + 1 }, (_, index) => {
            const t = index / stops;
            const alpha = ease(rising ? t : 1 - t);
            return `<stop offset="${t.toFixed(3)}" stop-opacity="${alpha.toFixed(3)}" style="stop-color:${paint}"/>`;
        }).join("");
        const gradient = `<linearGradient id="${id}" gradientUnits="userSpaceOnUse" x1="${tenth(x1)}" y1="${tenth(y1)}" x2="${tenth(x2)}" y2="${tenth(y2)}">${marks}</linearGradient>`;
        return `<defs>${gradient}</defs><path${attrs({ class: className ? `iso-line ${className}` : "iso-line", "data-tone": tone, "data-free": rising ? "start" : "end", d, style: `stroke:url(#${id})` })}/>`;
    };
    const parts = [];
    if (start > 0.05)
        parts.push(ramp(pieceOf(0, start), true));
    if (total - end - start > 0.05)
        parts.push(lineSvg(pathOf(pieceOf(start, total - end)), { tone, className }));
    if (end > 0.05)
        parts.push(ramp(pieceOf(total - end, total), false));
    return `<g class="iso-fade">${parts.join("")}</g>`;
}
function wireSvg(from, to, { via = [], tone = "lo", dotted = false, dashed = false, flow = false, ends = "both", size = 1.2 } = {}) {
    const d = pathOf([from, ...via, to]);
    const end = ([x, y]) => `<circle class="iso-wire-end" cx="${tenth(x)}" cy="${tenth(y)}" r="${size}"/>`;
    return `<g class="iso-wire" data-tone="${tone}">${lineSvg(d, { tone, dotted, dashed, flow })}${ends === "both" || ends === "from" ? end(from) : ""}${ends === "both" || ends === "to" ? end(to) : ""}</g>`;
}
function faceTextSvg(transform, text, { size = 3, tone = "mid", anchor = "start" } = {}) {
    return `<text class="iso-face-text" data-tone="${tone}" transform="${transform}" font-size="${size}" text-anchor="${anchor}">${escape(text)}</text>`;
}
function groupSvg(children, extra = {}) {
    return `<g${attrs(extra)}>${Array.isArray(children) ? children.join("") : children}</g>`;
}
function figureSvg({ width, height, label, body, standalone = false, className }) {
    const style = standalone ? `<style>${ISO_CSS}</style>` : "";
    return `<svg${attrs({
        xmlns: "http://www.w3.org/2000/svg",
        class: `iso-svg${standalone ? " iso" : ""}${className ? ` ${className}` : ""}`,
        "data-theme": standalone || undefined,
        viewBox: `0 0 ${width} ${height}`,
        role: "img",
        "aria-label": label,
    })}>${style}${Array.isArray(body) ? body.join("") : body}</svg>`;
}
function swatchSvg(mark) {
    if (mark === "raised" || mark === "flat" || mark === "lit") {
        const body = mark === "flat" ? "M2 6.5 8 3.5 14 6.5 8 9.5Z" : "M2 4.5 8 1.5 14 4.5 14 6 8 9 2 6Z";
        const crease = mark === "flat" ? "" : `<path class="iso-swatch-crease" d="M2 4.5 8 7.5 14 4.5"/>`;
        return `<svg class="iso-swatch" data-mark="${mark}" viewBox="0 0 16 10" aria-hidden="true"><path d="${body}"/>${crease}</svg>`;
    }
    return `<svg class="iso-swatch" data-mark="${mark}" viewBox="0 0 16 10" aria-hidden="true"><path d="M1.5 5h13"/></svg>`;
}
function plateHtml({ fig, title, hint, readout = "", keys = [], caption, body }) {
    const corner = (name, text, extra = "") => `<span class="iso-plate-corner" data-corner="${name}"${extra}>${escape(text)}</span>`;
    const legend = keys.length || caption
        ? `<figcaption class="iso-legend">${keys.length ? `<span class="iso-keys">${keys.map((key) => `<span class="iso-key">${swatchSvg(key.mark)}${escape(key.label)}</span>`).join("")}</span>` : ""}${caption ? `<span class="iso-caption">${escape(caption)}</span>` : ""}</figcaption>`
        : "";
    return `<figure class="iso-figure"><div class="iso-plate"><div class="iso-plate-corners" aria-hidden="true">${corner("fig", fig)}${title ? corner("title", title) : ""}${hint ? corner("hint", hint) : ""}${corner("readout", readout, " data-readout")}</div>${body}</div>${legend}</figure>`;
}
function pageHtml({ title, theme = "dark", body, script = "", width = 650 }) {
    return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>${escape(title)}</title><style>${ISO_CSS}${PAGE_CSS.replace("__WIDTH__", String(width))}</style></head><body class="iso" data-theme="${theme}"><main class="iso-page">${body}</main>${script ? `<script type="module">${script.replace(/<\/(script)/gi, "<\\/$1")}</script>` : ""}</body></html>`;
}
const PAGE_CSS = `
*{box-sizing:border-box}
html{color-scheme:dark}
body[data-theme="light"]{color-scheme:light}
body{margin:0;background:var(--anatomy-page);color:var(--anatomy-text);font:14px/1.6 ui-sans-serif,system-ui,-apple-system,"Segoe UI",sans-serif;-webkit-font-smoothing:antialiased}
.iso-page{width:min(__WIDTH__px,100% - 32px);margin:64px auto 96px}
`;
const ISO_CSS = `
.iso{
  --anatomy-page:#0b0b0b;--anatomy-card:#131313;--anatomy-text:#a3a3a3;--anatomy-strong:#e6e6e6;--anatomy-muted:#6e6e6e;
  --anatomy-paper:#131313;--anatomy-face:#1b1b1b;--anatomy-top:#1c1c1c;
  --anatomy-shade-0:#0f0f0f;--anatomy-shade-1:#121212;--anatomy-shade-2:#151515;--anatomy-shade-3:#181818;
  --anatomy-lit-top:#262626;--anatomy-lit-shade:#1d1d1d;
  --anatomy-hi:#d4d4d4;--anatomy-mid:#6a6a6a;--anatomy-lo:#3e3e3e;--anatomy-faint:#2a2a2a;--anatomy-lit:#ffffff;
  --anatomy-halo:#050505;--anatomy-halo-opacity:.9;--anatomy-dot:#e6e6e6;
  --anatomy-red:#ff6b6b;--anatomy-green:#6be0a0;--anatomy-blue:#6b9bff;
  --anatomy-weight:.6px;--anatomy-ease:cubic-bezier(.32,.72,0,1);
  --anatomy-mono:ui-monospace,"SF Mono",Menlo,Consolas,monospace;
  --anatomy-lift:inset 0 1px 0 0 #ffffff0a,inset 0 0 0 1px #ffffff06,0 0 0 1px #00000026,0 1px 1px -.5px #00000014,0 3px 3px -1.5px #00000014,0 6px 6px -3px #00000014,0 12px 12px -6px #00000014;
}
.iso[data-theme="light"]{
  --anatomy-page:#f2f2ef;--anatomy-card:#fbfbfa;--anatomy-text:#57575a;--anatomy-strong:#18181a;--anatomy-muted:#8c8c90;
  --anatomy-paper:#fbfbfa;--anatomy-face:#ffffff;--anatomy-top:#ffffff;
  --anatomy-shade-0:#dcdcd9;--anatomy-shade-1:#e5e5e2;--anatomy-shade-2:#ededea;--anatomy-shade-3:#f4f4f1;
  --anatomy-lit-top:#ffffff;--anatomy-lit-shade:#eeeeeb;
  --anatomy-hi:#26262a;--anatomy-mid:#8a8a8f;--anatomy-lo:#b4b4b8;--anatomy-faint:#d4d4d6;--anatomy-lit:#000000;
  --anatomy-halo:#8a8a80;--anatomy-halo-opacity:.32;--anatomy-dot:#3a3a3e;
  --anatomy-red:#e5484d;--anatomy-green:#30a46c;--anatomy-blue:#3e63dd;
  --anatomy-lift:inset 0 1px 0 0 #ffffff,0 0 0 1px #0000000f,0 1px 1px -.5px #0000000a,0 3px 3px -1.5px #0000000a,0 6px 6px -3px #0000000a,0 12px 12px -6px #0000000a;
}
.iso-svg{display:block;width:100%;height:auto;overflow:visible}
.iso-svg path,.iso-svg circle{vector-effect:non-scaling-stroke}
.iso-fill{fill:var(--anatomy-paper);stroke:none}
.iso-solid[data-lit]>.iso-fill{fill:var(--anatomy-face)}
.iso-shade,.iso-top{stroke:none}
.iso-shade[data-shade="0"]{fill:var(--anatomy-shade-0)}
.iso-shade[data-shade="1"]{fill:var(--anatomy-shade-1)}
.iso-shade[data-shade="2"]{fill:var(--anatomy-shade-2)}
.iso-shade[data-shade="3"]{fill:var(--anatomy-shade-3)}
.iso-top{fill:var(--anatomy-top)}
.iso-solid[data-lit]>.iso-top{fill:var(--anatomy-lit-top)}
.iso-solid[data-lit]>.iso-shade{fill:var(--anatomy-lit-shade)}
.iso-solid[data-seamless]>.iso-shade,.iso-solid[data-seamless]>.iso-top{stroke-width:.4;stroke-linejoin:round}
.iso-solid[data-seamless]>.iso-shade[data-shade="0"]{stroke:var(--anatomy-shade-0)}
.iso-solid[data-seamless]>.iso-shade[data-shade="1"]{stroke:var(--anatomy-shade-1)}
.iso-solid[data-seamless]>.iso-shade[data-shade="2"]{stroke:var(--anatomy-shade-2)}
.iso-solid[data-seamless]>.iso-shade[data-shade="3"]{stroke:var(--anatomy-shade-3)}
.iso-solid[data-seamless]>.iso-top{stroke:var(--anatomy-top)}
.iso-solid[data-seamless][data-lit]>.iso-top{stroke:var(--anatomy-lit-top)}
.iso-solid[data-seamless][data-lit]>.iso-shade{stroke:var(--anatomy-lit-shade)}
.iso-solid[data-lit]>.iso-edge{stroke:var(--anatomy-lit)}
.iso-halo{fill:var(--anatomy-halo);stroke:none;filter:blur(9px);opacity:var(--anatomy-halo-opacity);transform:translateY(3px)}
.iso-line{fill:none;stroke:var(--anatomy-lo);stroke-width:var(--anatomy-weight);stroke-linecap:round;stroke-linejoin:round}
.iso-line[data-tone="hi"]{stroke:var(--anatomy-hi)}
.iso-line[data-tone="mid"]{stroke:var(--anatomy-mid)}
.iso-line[data-tone="lo"]{stroke:var(--anatomy-lo)}
.iso-line[data-tone="faint"]{stroke:var(--anatomy-faint)}
.iso-line[data-tone="lit"]{stroke:var(--anatomy-lit)}
.iso-line[data-tone="red"]{stroke:var(--anatomy-red)}
.iso-line[data-tone="green"]{stroke:var(--anatomy-green)}
.iso-line[data-tone="blue"]{stroke:var(--anatomy-blue)}
.iso-line[data-dotted]{stroke-dasharray:.01 3.5;stroke-width:1}
.iso-line[data-dashed]{stroke-dasharray:3 3}
.iso-line[data-flow]{stroke-dasharray:2 6}
.iso-wire-end{fill:var(--anatomy-paper);stroke:var(--anatomy-lo);stroke-width:var(--anatomy-weight)}
.iso-wire[data-tone="hi"] .iso-wire-end{stroke:var(--anatomy-hi)}
.iso-wire[data-tone="mid"] .iso-wire-end{stroke:var(--anatomy-mid)}
.iso-wire[data-tone="faint"] .iso-wire-end{stroke:var(--anatomy-faint)}
.iso-wire[data-tone="lit"] .iso-wire-end{stroke:var(--anatomy-lit)}
.iso-dots circle{fill:var(--anatomy-dot);stroke:none;opacity:.32}
.iso-dots[data-tone="hi"] circle{opacity:.85}
.iso-dots[data-tone="mid"] circle{opacity:.45}
.iso-dots[data-tone="lo"] circle{opacity:.22}
.iso-dots[data-tone="faint"] circle{opacity:.12}
.iso-face-text{fill:var(--anatomy-mid);font-family:var(--anatomy-mono);letter-spacing:.04em}
.iso-face-text[data-tone="hi"]{fill:var(--anatomy-hi)}
.iso-face-text[data-tone="lo"]{fill:var(--anatomy-lo)}
.iso-face-text[data-tone="faint"]{fill:var(--anatomy-faint)}
.tb-body{fill:var(--anatomy-shade-2);stroke:none}
.tb-shine{fill:var(--anatomy-top);stroke:none}
.tb-shade{fill:var(--anatomy-shade-0);stroke:none}
.tb-ring{fill:none;stroke:var(--anatomy-lo);stroke-width:.45;stroke-linecap:butt;stroke-linejoin:round}
.tb-ring[data-tone="mid"]{stroke:var(--anatomy-mid)}
.tb-ring[data-tone="faint"]{stroke:var(--anatomy-faint)}
.tb-ring[data-tone="hi"]{stroke:var(--anatomy-hi)}
@keyframes iso-flow{to{stroke-dashoffset:-32}}
@keyframes iso-pulse{0%,100%{opacity:.18}12%{opacity:1}40%{opacity:.18}}
.iso-line[data-flow]{animation:iso-flow 1600ms linear infinite}
.iso-dots circle[data-pulse]{animation:iso-pulse 1600ms steps(1,end) infinite;animation-delay:var(--pulse-at,0ms)}
.iso-figure{margin:32px 0 36px}
.iso-plate{position:relative;padding:52px 24px;border-radius:0;background:var(--anatomy-card);box-shadow:0 0 0 1px var(--anatomy-mid);--anatomy-paper:var(--anatomy-card)}
.iso-plate-corners{position:absolute;inset:18px 20px;pointer-events:none}
.iso-plate-corner{position:absolute;color:var(--anatomy-muted);font-family:var(--anatomy-mono);font-size:10.5px;line-height:1;letter-spacing:.04em;white-space:nowrap}
.iso-plate-corner[data-corner="fig"]{top:0;left:0;color:var(--anatomy-text)}
.iso-plate-corner[data-corner="title"]{top:0;right:0;text-transform:uppercase;letter-spacing:.1em}
.iso-plate-corner[data-corner="hint"]{bottom:0;left:0;text-transform:uppercase;letter-spacing:.1em}
.iso-plate-corner[data-corner="readout"]{right:0;bottom:0;color:var(--anatomy-text);font-variant-numeric:tabular-nums}
.iso-plate .iso-svg{margin:0 auto}
.iso-legend{display:grid;gap:8px;margin-top:12px;color:var(--anatomy-muted);font-size:13px;line-height:1.55}
.iso-keys{display:flex;flex-wrap:wrap;gap:6px 18px}
.iso-key{display:inline-flex;align-items:center;gap:7px}
.iso-swatch{width:16px;height:10px;flex:none;overflow:visible}
.iso-swatch path{fill:none;stroke:var(--anatomy-hi);stroke-width:1;vector-effect:non-scaling-stroke;stroke-linejoin:round;stroke-linecap:round}
.iso-swatch[data-mark="raised"] path,.iso-swatch[data-mark="flat"] path{stroke:var(--anatomy-mid)}
.iso-swatch[data-mark="lit"] path{stroke:var(--anatomy-lit)}
.iso-swatch[data-mark="dim"] path{stroke:var(--anatomy-lo)}
.iso-swatch[data-mark="dotted"] path{stroke-dasharray:.01 3;stroke-width:1.4}
.iso-swatch[data-mark="dashed"] path{stroke-dasharray:3 2.5}
.iso-swatch[data-mark="red"] path{stroke:var(--anatomy-red)}
.iso-swatch[data-mark="green"] path{stroke:var(--anatomy-green)}
.iso-swatch[data-mark="blue"] path{stroke:var(--anatomy-blue)}
.iso-swatch-crease{stroke:var(--anatomy-lo)!important}
@media (max-width:560px){.iso-plate{padding:48px 12px 70px}.iso-plate-corner[data-corner="hint"]{bottom:18px}}
@media (prefers-reduced-motion:reduce){.iso-line[data-flow],.iso-dots circle[data-pulse]{animation:none}}
`;


const k = { axisVector, boxCorners, cameraOf, circleRing, coil, corners, cylinder, depthOf, dotGrid, dotsSvg, extrude, faceTextSvg, fadeLineSvg, fadedSvg, figureSvg, fitProjection, groupSvg, haloOf, holdStill, insetPlan, iso, joinPaths, knurl, lineOnTop, lineSvg, onTop, pageHtml, pathOf, planOutline, plateHtml, pointsAt, radialTicks, ring, ringOf, ringSeam, rise, roundedPlan, screenRise, segment, sideArc, sideMatrix, sideRing, sideSeam, sideTicks, slabOf, solidSvg, topMatrix, topTicks, towardViewer, translateAlong, wireSvg };
// Геометрия четырёх фигур кейса Sminex Comfort.
// Один и тот же код работает в Node (сборка статики) и в браузере (перестройка движущихся частей):
// build.mjs вставляет этот файл в страницу без слов export, а k — объект с функциями кита.

const DATA = {
  topics: [
    { name: "Пропуска", share: 38, quotes: ["«Звоню на ресепшен каждый раз, когда жду курьера»", "«Гость стоит у шлагбаума, а охрана не в курсе»", "«Пропуск на машину — через письмо управляющему»"] },
    { name: "Статус заявки", share: 24, quotes: ["«Не знаю, когда придёт мастер»", "«Написал утром — тишина до вечера»"] },
    { name: "Счета и оплата", share: 21, quotes: ["«Квитанция на почте, плачу в банке — неудобно»", "«Не понимаю, из чего сумма»"] },
    { name: "Счётчики", share: 17, quotes: ["«Забываю передать показания до 25-го»"] },
  ],
  tabs: [
    { name: "Главная", items: ["Быстрые действия", "Лента событий", "Новости дома"] },
    { name: "Счета", items: ["К оплате", "История", "Показания"] },
    { name: "Пропуска", items: ["Разовые", "Постоянные", "Транспорт"] },
    { name: "Обращения", items: ["Новая заявка", "Статусы", "Чат"] },
    { name: "Ещё", items: ["Объекты", "Семья и доступы", "Настройки"] },
  ],
  before: ["Звонок", "Ожидание", "Имя и время", "Ресепшен пишет охране", "Перезвон"],
  after: ["«Для курьера» на главной", "Готово"],
  states: [
    { name: "Данные", note: "заявки со статусами" },
    { name: "Загрузка", note: "скелетон, пока данные едут" },
    { name: "Пусто", note: "«Заявок пока нет» и кнопка" },
    { name: "Ошибка", note: "«Нет связи» и повтор" },
  ],
};

function tools(k, P) {
  const f1 = (v) => (Math.round(v * 10) / 10).toString();
  const at = (p) => k.iso(p, P);
  const S = (paths, style) => k.solidSvg(paths, style);
  const Ln = (d, style) => k.lineSvg(d, style);
  const D = (pts, style) => k.dotsSvg(pts.map((p) => at(p)), style);
  const depth = (x, y, z = 0) => k.depthOf([x, y, z], P);
  const poly = (pts) => "M" + pts.map((p) => at(p).map(f1).join(" ")).join("L") + "Z";
  const path = (pts) => "M" + pts.map((p) => at(p).map(f1).join(" ")).join("L");
  const faceY = (y, x0, x1, z0, z1) => poly([[x0, y, z0], [x1, y, z0], [x1, y, z1], [x0, y, z1]]);
  const faceX = (x, y0, y1, z0, z1) => poly([[x, y0, z0], [x, y1, z0], [x, y1, z1], [x, y0, z1]]);
  const fill = (d, cls) => `<path class="${cls}" d="${d}"/>`;
  const txt = (m, s, size, tone = "hi", anchor = "start", cls = "") =>
    k.faceTextSvg(m, s, { size, tone, anchor }).replace('class="iso-face-text"', `class="iso-face-text${cls ? " " + cls : ""}"`);
  const rule = (x0, x1, y, z, tone = "lo") => Ln(k.lineOnTop([x0, y], [x1, y], z, P), { tone, free: true });
  const byDepth = (pts) => [...pts].sort((a, b) => depth(a[0], a[1]) - depth(b[0], b[1]));
  const screws = (plan, inset, z, size = 0.45) => D(k.corners(plan, inset).map(([x, y]) => [x, y, z]), { size });

  // основание на ножках: ореол, ножки, плита со швом, канавка, винты по углам
  function base(plan, h, { feet = 20, foot = 4 } = {}) {
    const out = [`<path class="iso-halo" d="${k.haloOf(plan, -h - foot, h, P)}"/>`];
    for (const [x, y] of byDepth(k.corners(plan, feet))) {
      out.push(S(k.cylinder(x, y, 7, -h - foot, 1.4, P, 28), { tone: "lo" }));
      out.push(S(k.cylinder(x, y, 5.2, -h - foot + 1.4, foot - 1.4, P, 28), { tone: "mid" }));
    }
    out.push(S(k.slabOf(plan, -h, h, P, 8, 1.4), { tone: "mid", inner: Ln(k.sideSeam(plan, -h + 3, P, 8), { tone: "faint" }) }));
    out.push(Ln(k.planOutline(k.insetPlan(plan, 5), 0, P), { tone: "faint" }));
    const sc = k.corners(plan, 10);
    out.push(Ln(sc.map(([x, y]) => k.ring(x, y, 2.2, 0, P, 16)).join(""), { tone: "lo" }));
    out.push(D(sc.map(([x, y]) => [x, y, 0]), { size: 0.5 }));
    return out.join("");
  }
  // линейка: полоса с рисками от её заднего края
  function ruler(strip, z = 0, step = 4, every = 5) {
    const t = k.topTicks(strip.x + 3, strip.x + strip.w - 3, step, every, strip.y + 0.2, z + 0.6, [1.8, 3.4], P);
    return S(k.slabOf(strip, z, 0.6, P, 3), { tone: "lo", crease: "none" }) + Ln(t.minor, { tone: "lo" }) + Ln(t.major, { tone: "mid" });
  }
  // шильдик: пластина, рамка, три строки «текста», два винта
  function label(lp, z = 0) {
    return [
      S(k.slabOf(lp, z, 0.8, P, 3, 0.3), { tone: "mid" }),
      Ln(k.planOutline(k.insetPlan(lp, 1.4), z + 0.8, P, 3), { tone: "faint" }),
      rule(lp.x + 6, lp.x + lp.w * 0.72, lp.y + lp.d * 0.32, z + 0.8, "mid"),
      rule(lp.x + 6, lp.x + lp.w * 0.58, lp.y + lp.d * 0.52, z + 0.8),
      rule(lp.x + 6, lp.x + lp.w * 0.45, lp.y + lp.d * 0.72, z + 0.8),
      D([[lp.x + 2.8, lp.y + lp.d / 2, z + 0.8], [lp.x + lp.w - 2.8, lp.y + lp.d / 2, z + 0.8]], { size: 0.42 }),
    ].join("");
  }
  return { at, S, Ln, D, depth, poly, path, faceY, faceX, fill, txt, rule, byDepth, screws, base, ruler, label };
}

/* ======================= Рис. 1 · Лотки с карточками обращений ======================= */
// Каждая карточка — 20 обращений из ~2000, поэтому высота стопки в карточках = доля темы в процентах.
const F1 = {
  AZ: 50,
  CARD: 1, // толщина карточки
  FLOOR: 2, // дно лотка
  TX: (i) => -140 + i * 64,
  BASE: { x: -186, y: -58, w: 344, d: 112, r: 8 },
  topOf: (i) => 2 + DATA.topics[i].share, // верх стопки
  LIFT: 9, // на сколько приподнимается верхняя карточка выбранной темы
};
const F1card = (i) => ({ x: F1.TX(i) + 6, y: -34, w: 44, d: 54, r: 1.2 });

function fig1(k, P, sel = 0) {
  const t = tools(k, P);
  const { S, Ln, D } = t;
  const out = [t.base(F1.BASE, 10)];
  const L = F1.topOf(sel);

  const mv = (part, svg) => `<g data-part="${part}" transform="${k.translateAlong(P, [0, 0, L])}">${svg}</g>`;
  // левая стойка: задняя щека каретки — до стойки, правая щека с планкой — после
  out.push(S(k.slabOf({ x: -180, y: -52, w: 24, d: 22, r: 2 }, 0, 5, P, 4, 0.5), { tone: "mid" }));
  out.push(t.screws({ x: -180, y: -52, w: 24, d: 22 }, 3.2, 5));
  out.push(mv("arm", f1cheeks(k, P, t, -175, false)));
  out.push(S(k.slabOf({ x: -173, y: -46, w: 10, d: 10, r: 1.2 }, 5, 59, P, 3, 0.4), { tone: "mid" }));
  out.push(mv("arm", f1cheeks(k, P, t, -175, true) + S(k.slabOf({ x: -161, y: -45, w: 282, d: 4, r: 1 }, -1, 2, P, 2, 0.3), { tone: "mid" })));
  out.push(S(k.slabOf({ x: -175, y: -48, w: 14, d: 14, r: 2 }, 64, 4, P, 4, 0.5), { tone: "mid" }));
  out.push(t.D([[-168, -41, 68]], { size: 0.5 }));

  // лотки в порядке глубины (слева направо)
  DATA.topics.forEach((tp, i) => out.push(f1tray(k, P, t, i, i === sel)));

  // правая стойка со шкалой: шкала на передней грани, каретка охватывает стойку сзади
  const C = { x: 121, y: -46, w: 10, d: 10, r: 1.2 };
  out.push(S(k.slabOf({ x: 114, y: -52, w: 24, d: 22, r: 2 }, 0, 5, P, 4, 0.5), { tone: "mid" }));
  out.push(t.screws({ x: 114, y: -52, w: 24, d: 22 }, 3.2, 5));
  out.push(mv("arm", f1cheeks(k, P, t, 119, false, true)));
  const minor = [], major = [], zero = [];
  const fy = C.y + C.d;
  for (let n = 0; n <= 44; n += 2) {
    const z = F1.FLOOR + n;
    const len = n % 10 === 0 ? 4.4 : 2.2;
    (n === 0 ? zero : n % 10 === 0 ? major : minor).push(k.segment([C.x, fy, z], [C.x + len, fy, z], P));
  }
  out.push(S(k.slabOf(C, 5, 59, P, 3, 0.4), { tone: "mid", inner: Ln(minor.join(""), { tone: "lo" }) + Ln(major.join(""), { tone: "mid" }) + Ln(zero.join(""), { tone: "hi" }) }));
  out.push(mv("arm", f1cheeks(k, P, t, 119, true, true)));
  out.push(S(k.slabOf({ x: 119, y: -48, w: 14, d: 14, r: 2 }, 64, 4, P, 4, 0.5), { tone: "mid" }));
  out.push(S(k.cylinder(126, -41, 3.6, 68, 4.4, P, 28), { tone: "mid" }));
  out.push(Ln(k.knurl(126, -41, 3.6, 68, 72.4, 22, P), { tone: "lo" }));
  out.push(t.D([[126, -41, 72.4]], { size: 0.55 }));

  // линейка и шильдик спереди
  out.push(t.ruler({ x: -170, y: 40, w: 200, d: 6, r: 1 }));
  out.push(t.label({ x: 70, y: 34, w: 44, d: 14, r: 1.5 }));
  return out.join("");
}
// каретка из трёх частей вокруг стойки 10×10 (x0 — её левый край минус 2):
// задняя планка и левая щека рисуются до стойки, правая щека — после
function f1cheeks(k, P, t, x0, front, scale = false) {
  const { S, Ln } = t;
  const y0 = -48, d = 11;
  if (!front) {
    const back = { x: x0, y: y0, w: 14, d: 2, r: 0.6 };
    const left = { x: x0, y: y0, w: 2, d, r: 0.5 };
    let s = S(k.slabOf(back, -3, 6, P, 2, 0.3), { tone: "mid" }) + S(k.slabOf(left, -3, 6, P, 2, 0.3), { tone: "mid" });
    s += t.D([[x0 + 1, y0 + 3, 3], [x0 + 1, y0 + 8, 3]], { size: 0.38 });
    // у правой стойки — указатель: язычок до передней грани, его кончик стоит у корня рисок
    if (scale) s += S(k.slabOf({ x: x0, y: y0 + d, w: 2, d: 3, r: 0.3 }, -0.5, 1, P, 2), { tone: "hi", className: "acc" });
    return s;
  }
  const right = { x: x0 + 12, y: y0, w: 2, d, r: 0.5 };
  let s = S(k.slabOf(right, -3, 6, P, 2, 0.3), { tone: "mid" });
  s += t.D([[x0 + 13, y0 + 3, 3], [x0 + 13, y0 + 8, 3]], { size: 0.38 });
  if (scale) {
    // стопорный винт на правой щеке
    s += S(k.slabOf({ x: x0 + 14, y: -44.5, w: 2.4, d: 4, r: 0.6 }, -1, 2, P, 2), { tone: "mid" });
    s += S(k.slabOf({ x: x0 + 16.4, y: -45.5, w: 3.2, d: 6, r: 1.4 }, -2.4, 4.8, P, 3, 0.3), { tone: "mid" });
  }
  return s;
}
function f1tray(k, P, t, i, on) {
  const { S, Ln, D } = t;
  const X = F1.TX(i);
  const N = DATA.topics[i].share;
  const card = F1card(i);
  const out = [];
  const tray = { x: X, y: -40, w: 56, d: 66, r: 2 };
  out.push(S(k.slabOf(tray, 0, F1.FLOOR, P, 3), { tone: "lo" }));
  out.push(S(k.slabOf({ x: X, y: -40, w: 56, d: 3, r: 1 }, F1.FLOOR, 28, P, 3, 0.4), { tone: "mid" }));
  // разделитель с язычком: язычки идут лесенкой, как в настоящей картотеке
  const div = { x: X + 6, y: -36.4, w: 44, d: 1, r: 0.3 };
  out.push(S(k.slabOf(div, F1.FLOOR, 46, P, 2), { tone: "hi" }));
  const tab = { x: X + 8 + i * 9, y: -36.4, w: 14, d: 1, r: 0.3 };
  out.push(S(k.slabOf(tab, F1.FLOOR + 46, 5, P, 2), { tone: "hi", className: "cfsel" }));
  out.push(S(k.slabOf({ x: X, y: -37, w: 3, d: 60, r: 0.6 }, F1.FLOOR, 16, P, 2, 0.3), { tone: "mid" }));
  // стопка карточек: швы каждой карточки, каждая пятая — темнее
  const fine = [], five = [];
  for (let n = 1; n < N - 1; n++) (n % 5 === 0 ? five : fine).push(k.sideSeam(card, F1.FLOOR + n, P, 3));
  out.push(S(k.slabOf(card, F1.FLOOR, N - 1, P, 3), { tone: "hi", inner: Ln(fine.join(""), { tone: "faint" }) + Ln(five.join(""), { tone: "lo" }) }));
  // верхняя карточка: поднимается у выбранной темы
  const zt = F1.FLOOR + N - 1;
  const top = [
    S(k.slabOf(card, zt, F1.CARD, P, 3), { tone: "hi", className: "cfsel" }),
    t.rule(card.x + 5, card.x + 30, card.y + 9, zt + 1, "mid"),
    t.rule(card.x + 5, card.x + 38, card.y + 15, zt + 1),
    t.rule(card.x + 5, card.x + 34, card.y + 20, zt + 1),
    t.rule(card.x + 5, card.x + 22, card.y + 25, zt + 1),
    D([[card.x + card.w - 5, card.y + 5, zt + 1]], { size: 0.9, tone: "hi" }),
  ].join("");
  out.push(`<g data-part="top" data-i="${i}" transform="${on ? k.translateAlong(P, [0, 0, F1.LIFT]) : ""}">${top}</g>`);
  out.push(S(k.slabOf({ x: X + 53, y: -37, w: 3, d: 60, r: 0.6 }, F1.FLOOR, 16, P, 2, 0.3), { tone: "mid" }));
  // передний бортик с рамкой для номера
  const fr = { x: X, y: 23, w: 56, d: 3, r: 1 };
  out.push(S(k.slabOf(fr, F1.FLOOR, 9, P, 3, 0.4), { tone: "mid" }));
  out.push(Ln(t.faceY(26, X + 18, X + 38, 3.6, 9.4), { tone: "lo" }));
  out.push(t.txt(k.sideMatrix([X + 28, 26], 4.9, P, "left"), "0" + (i + 1), 4, "hi", "middle", "cfsel"));
  out.push(D([[X + 15, 26, 6.5], [X + 41, 26, 6.5]], { size: 0.42 }));
  // зона наведения: весь лоток
  out.push(`<path class="hit" data-i="${i}" d="${k.slabOf(tray, 0, F1.FLOOR + 50, P, 2).fill}"/>`);
  return `<g class="tray" data-i="${i}"${on ? " data-on" : ""}>${out.join("")}</g>`;
}

/* ======================= Рис. 2 · Картотека разделов ======================= */
const F2 = {
  AZ: 48,
  DX: (i) => -131 + i * 53,
  FRONT: 30, // передняя плоскость корпуса
  OPEN: 46, // ход открытого ящика
};
// содержимое ящика: всё, что глубже передней плоскости, отрезается (оно внутри корпуса)
function f2drawer(k, P, i, dy, on = false) {
  const t = tools(k, P);
  const { S, Ln, D } = t;
  const X = F2.DX(i);
  const cut = F2.FRONT - dy; // в координатах ящика всё, что y < cut, — внутри корпуса
  const clip = (p) => {
    const y0 = Math.max(p.y, cut);
    const y1 = p.y + p.d;
    if (y1 - y0 < 0.3) return null;
    return { ...p, y: y0 + dy, d: y1 - y0, r: y0 > p.y ? Math.min(p.r, 0.2) : p.r };
  };
  const slab = (p, z, h, style, steps = 2, bev = 0) => {
    const c = clip(p);
    return c ? S(k.slabOf(c, z, h, P, steps, bev), style) : "";
  };
  const out = [];
  if (dy > 0.3) {
    out.push(slab({ x: X + 3, y: -32, w: 45, d: 62, r: 0.5 }, 5, 1.5, { tone: "lo" }));
    out.push(slab({ x: X + 3, y: -32, w: 45, d: 1.6, r: 0.3 }, 6.5, 18, { tone: "mid" }));
    out.push(slab({ x: X + 3, y: -32, w: 1.6, d: 62, r: 0.3 }, 6.5, 18, { tone: "mid" }));
    // три карточки-подраздела с язычками лесенкой
    [-12, 0, 12].forEach((y, j) => {
      const c = clip({ x: X + 6.5, y, w: 38, d: 0.8, r: 0.2 });
      if (!c) return;
      const tab = { x: X + 7.5 + j * 12.4, y: c.y - dy, w: 12, d: 0.8, r: 0.3 };
      const fy = c.y + c.d;
      out.push(S(k.slabOf(c, 6.5, 19.5, P, 2), { tone: "hi", inner: "" }));
      out.push(S(k.slabOf({ ...tab, y: c.y }, 26, 4.5, P, 2), { tone: "hi", className: "cfsel" }));
      out.push(Ln(k.segment([X + 10, fy, 22], [X + 30 - j * 3, fy, 22], P), { tone: "mid", free: true }));
      out.push(Ln(k.segment([X + 10, fy, 18.5], [X + 36, fy, 18.5], P), { tone: "lo", free: true }));
      out.push(Ln(k.segment([X + 10, fy, 15], [X + 26 + j * 2, fy, 15], P), { tone: "lo", free: true }));
    });
    out.push(slab({ x: X + 46.4, y: -32, w: 1.6, d: 62, r: 0.3 }, 6.5, 18, { tone: "mid" }));
  }
  // лицевая панель: держатель с номером, ручка
  const y = F2.FRONT + dy;
  const front = { x: X, y, w: 51, d: 2.4, r: 1 };
  const fy = y + 2.4;
  out.push(S(k.slabOf(front, 3, 30, P, 3, 0.5), { tone: "mid" }));
  out.push(Ln(t.faceY(fy, X + 15, X + 36, 22, 29.4), { tone: "lo" }));
  out.push(D([[X + 13, fy, 25.7], [X + 38, fy, 25.7]], { size: 0.42 }));
  out.push(t.txt(k.sideMatrix([X + 25.5, fy], 27.3, P, "left"), "0" + (i + 1), 4.2, "hi", "middle", "cfsel"));
  out.push(S(k.slabOf({ x: X + 17, y: fy, w: 2.4, d: 3, r: 0.4 }, 12, 4.5, P, 2), { tone: "mid" }));
  out.push(S(k.slabOf({ x: X + 31.6, y: fy, w: 2.4, d: 3, r: 0.4 }, 12, 4.5, P, 2), { tone: "mid" }));
  out.push(S(k.slabOf({ x: X + 16, y: fy + 3, w: 19, d: 2.6, r: 1.2 }, 11.6, 5.2, P, 3, 0.3), { tone: "hi", className: "cfsel" }));
  return out.join("");
}
function fig2(k, P, sel = 2) {
  const t = tools(k, P);
  const { S, Ln, D } = t;
  const out = [];
  const PLINTH = { x: -131, y: -36, w: 262, d: 62, r: 1 };
  out.push(`<path class="iso-halo" d="${k.haloOf(PLINTH, -12, 40, P)}"/>`);
  for (const [x, y] of t.byDepth(k.corners(PLINTH, 12))) {
    out.push(S(k.cylinder(x, y, 5.6, -14, 1.4, P, 28), { tone: "lo" }));
    out.push(S(k.cylinder(x, y, 4, -12.6, 6.6, P, 24), { tone: "mid", inner: Ln(k.sideArc(x, y, 4, -9, P, 16), { tone: "faint" }) }));
  }
  out.push(S(k.slabOf(PLINTH, -6, 6, P, 3, 0.5), { tone: "lo" }));
  // корпус
  const CAB = { x: -135, y: -40, w: 270, d: 70, r: 2 };
  const fy = F2.FRONT;
  const seams = [];
  for (let i = 1; i < 5; i++) {
    const x = F2.DX(i) - 1;
    seams.push(k.segment([x, fy, 0], [x, fy, 36], P));
  }
  out.push(S(k.slabOf(CAB, 0, 36, P, 3, 0.5), { tone: "mid", inner: Ln(seams.join(""), { tone: "faint" }) }));
  // проёмы под ящиками (видны, когда ящик выдвинут)
  for (let i = 0; i < 5; i++) out.push(t.fill(t.faceY(fy, F2.DX(i) + 1.5, F2.DX(i) + 49.5, 4.5, 31.5), "f2-void"));
  // крышка с выносом, медная табличка — единственная надпись
  const TOP = { x: -138, y: -43, w: 276, d: 76, r: 3 };
  out.push(S(k.slabOf(TOP, 36, 3, P, 4, 0.8), { tone: "mid", inner: Ln(k.sideSeam(TOP, 37.5, P, 4), { tone: "faint" }) }));
  out.push(Ln(k.planOutline(k.insetPlan(TOP, 4), 39, P, 4), { tone: "faint" }));
  out.push(t.screws(TOP, 8, 39));
  const plate = { x: -40, y: -6, w: 80, d: 14, r: 1.5 };
  out.push(S(k.slabOf(plate, 39, 0.8, P, 3, 0.3), { tone: "hi" }));
  out.push(Ln(k.planOutline(k.insetPlan(plate, 1.4), 39.8, P, 3), { tone: "faint" }));
  out.push(t.txt(k.topMatrix([0, 3.4], 39.8, P, "x"), "SMINEX COMFORT", 5.2, "hi", "middle"));
  out.push(D([[-37, 1, 39.8], [37, 1, 39.8]], { size: 0.42 }));
  // карточки-разделители на крышке: стопка запасных карточек и держатель
  const spare = { x: 70, y: -30, w: 40, d: 26, r: 1 };
  const sz = [];
  for (let n = 1; n < 6; n++) sz.push(k.sideSeam(spare, 39 + n, P, 2));
  out.push(S(k.slabOf(spare, 39, 6.4, P, 2), { tone: "hi", inner: Ln(sz.join(""), { tone: "faint" }) }));
  out.push(t.rule(75, 98, -24, 45.4, "mid") + t.rule(75, 104, -19, 45.4) + t.rule(75, 92, -14, 45.4));
  out.push(t.label({ x: -122, y: -32, w: 48, d: 14, r: 1.5 }, 39));
  // ящики: сначала закрытые, открытый — последним (он впереди плоскости корпуса)
  const order = [0, 1, 2, 3, 4].sort((a, b) => (a === sel) - (b === sel) || a - b);
  for (const i of order) out.push(`<g class="drawer" data-i="${i}"${i === sel ? " data-on" : ""}>${f2drawer(k, P, i, i === sel ? F2.OPEN : 0, i === sel)}</g>`);
  // зоны наведения — лицевые панели (и место выдвинутого ящика)
  for (let i = 0; i < 5; i++) {
    const X = F2.DX(i);
    out.push(`<path class="hit" data-i="${i}" d="${k.slabOf({ x: X, y: F2.FRONT, w: 51, d: F2.OPEN + 6, r: 0 }, 3, 30, P, 1).fill}"/>`);
  }
  return out.join("");
}

/* ======================= Рис. 3 · Две линии: было и стало ======================= */
const F3 = {
  AZ: 56,
  Y: [-24, 24],
  STATIONS: [[-110, -70, -30, 10, 50], [-110, 50]],
  START: -134,
  PIN: { z0: 6, h: 20, lift: 14 },
  SPEED: 110, // ед/с
  DWELL: 0.75, // c у каждой станции
  OPEN: 0.3, // c на подъём штифта
};
// модель одной линии: где каретка, какие штифты подняты, сколько станций пройдено
function f3line(stations, t) {
  const stop = (s) => s - 13.2; // каретка упирается в штифт передним краем
  let x = F3.START, time = 0;
  const lift = stations.map(() => 0);
  let reached = 0;
  for (let i = 0; i < stations.length; i++) {
    const run = (stop(stations[i]) - x) / F3.SPEED;
    if (t < time + run) return { x: x + (t - time) * F3.SPEED, lift, reached, moving: true };
    time += run; x = stop(stations[i]); reached = i + 1;
    if (i === stations.length - 1) return { x, lift, reached, moving: false, done: true };
    if (t < time + F3.DWELL) {
      const u = (t - time - (F3.DWELL - F3.OPEN)) / F3.OPEN;
      lift[i] = Math.max(0, Math.min(1, u));
      return { x, lift, reached, moving: true };
    }
    lift[i] = 1; time += F3.DWELL;
  }
  return { x, lift, reached, moving: false, done: true };
}
const f3total = (stations) => {
  let lo = 0, hi = 60;
  for (let n = 0; n < 40; n++) { const m = (lo + hi) / 2; f3line(stations, m).done ? (hi = m) : (lo = m); }
  return hi;
};
function f3needle(k, P, line, value) {
  const cx = 128, cy = F3.Y[line], z = 8.6, r = 10;
  const a = (-150 + (value / 5) * 300) * Math.PI / 180;
  const s = Math.sin(a), c = -Math.cos(a);
  return k.lineOnTop([cx - s * 2.6, cy - c * 2.6], [cx + s * r, cy + c * r], z, P);
}
function fig3(k, P, state = [f3line(F3.STATIONS[0], 99), f3line(F3.STATIONS[1], 99)]) {
  const t = tools(k, P);
  const { S, Ln, D } = t;
  const out = [t.base({ x: -164, y: -56, w: 322, d: 112, r: 8 }, 10)];
  F3.Y.forEach((y0, line) => {
    const st = state[line];
    const ST = F3.STATIONS[line];
    const g = [];
    const bed = { x: -152, y: y0 - 13, w: 250, d: 26, r: 2 };
    g.push(S(k.slabOf(bed, 0, 2, P, 3, 0.4), { tone: "lo" }));
    for (const ry of [y0 - 8, y0 + 5]) {
      const rail = { x: -148, y: ry, w: 242, d: 3, r: 0.8 };
      g.push(S(k.slabOf(rail, 2, 3, P, 2, 0.3), { tone: "mid" }));
      const pts = [];
      for (let x = -140; x <= 86; x += 18) pts.push([x, ry + 1.5, 5]);
      g.push(D(pts, { size: 0.36 }));
    }
    // задние стойки ворот
    ST.forEach((s) => g.push(S(k.slabOf({ x: s - 3, y: y0 - 12, w: 6, d: 3, r: 0.6 }, 2, 24, P, 2, 0.3), { tone: "mid" })));
    g.push(S(k.slabOf({ x: -152, y: y0 - 11, w: 5, d: 22, r: 1 }, 2, 9, P, 3, 0.5), { tone: "mid" }));
    g.push(t.D([[-149.5, y0 - 7, 11], [-149.5, y0 + 7, 11]], { size: 0.42 }));
    // каретка с капсулой
    const car = { x: -12, y: y0 - 9.5, w: 24, d: 19, r: 2 };
    const sh = [
      S(k.slabOf(car, 5, 3, P, 3, 0.5), { tone: "mid", inner: Ln(k.sideSeam(car, 6.5, P, 3), { tone: "faint" }) }),
      t.screws(car, 2.6, 8, 0.4),
      S(k.cylinder(0, y0, 6, 8, 7, P, 36, 0.5), { tone: "hi", className: "acc", inner: Ln(k.sideArc(0, y0, 6, 10.5, P, 24), { tone: "faint" }) }),
      Ln(k.ring(0, y0, 3.6, 15, P, 24), { tone: "lo" }),
      t.D([[0, y0, 15]], { size: 0.6, tone: "hi" }),
    ].join("");
    g.push(`<g data-part="shuttle" data-line="${line}" transform="${k.translateAlong(P, [st.x, 0, 0])}">${sh}</g>`);
    // штифты-стопоры (ход вверх), затем передние стойки, балки с корпусами соленоидов
    ST.forEach((s, i) => {
      const pin = S(k.slabOf({ x: s - 1.2, y: y0 - 1.2, w: 2.4, d: 2.4, r: 0.5 }, F3.PIN.z0, F3.PIN.h, P, 2), { tone: "hi" });
      g.push(`<g data-part="pin" data-line="${line}" data-i="${i}" transform="${st.lift[i] ? k.translateAlong(P, [0, 0, F3.PIN.lift * st.lift[i]]) : ""}">${pin}</g>`);
    });
    g.push(S(k.slabOf({ x: 93, y: y0 - 11, w: 5, d: 22, r: 1 }, 2, 9, P, 3, 0.5), { tone: "mid" }));
    g.push(t.D([[95.5, y0 - 7, 11], [95.5, y0 + 7, 11]], { size: 0.42 }));
    ST.forEach((s, i) => {
      g.push(S(k.slabOf({ x: s - 3, y: y0 + 9, w: 6, d: 3, r: 0.6 }, 2, 24, P, 2, 0.3), { tone: "mid" }));
      const beam = { x: s - 4, y: y0 - 13, w: 8, d: 26, r: 1 };
      g.push(S(k.slabOf(beam, 26, 4, P, 2, 0.4), { tone: "mid" }));
      g.push(t.D([[s, y0 - 10.5, 30], [s, y0 + 10.5, 30]], { size: 0.4 }));
      const box = { x: s - 4, y: y0 - 4, w: 8, d: 8, r: 1.4 };
      g.push(S(k.slabOf(box, 30, 14, P, 3, 0.4), { tone: "mid", inner: Ln(k.sideSeam(box, 40, P, 3), { tone: "faint" }) }));
      g.push(`<g class="lamp" data-line="${line}" data-i="${i}"${i < st.reached ? " data-on" : ""}>${S(k.cylinder(s, y0, 2, 44, 1, P, 18), { tone: "hi" })}</g>`);
    });
    // счётчик шагов: циферблат на 5 делений
    const cx = 128;
    g.push(S(k.slabOf({ x: cx - 15, y: y0 - 15, w: 30, d: 30, r: 3 }, 0, 2.5, P, 4, 0.4), { tone: "lo" }));
    g.push(S(k.cylinder(cx, y0, 13, 2.5, 6.1, P, 56, 0.6), { tone: "hi", crease: "lo", inner: Ln(k.sideArc(cx, y0, 13, 5, P, 40), { tone: "faint" }) }));
    g.push(Ln(k.knurl(cx, y0, 13, 5.5, 8.6, 60, P, 0.3), { tone: "lo" }));
    g.push(Ln(k.ring(cx, y0, 11.4, 8.6, P, 56), { tone: "lo" }));
    const tk = k.radialTicks(cx, y0, 11.2, 10, 2, 8.6, [1.3, 2.8], P, -150 * Math.PI / 180, 300 * Math.PI / 180);
    g.push(Ln(tk.minor, { tone: "lo" }) + Ln(tk.major, { tone: "mid" }));
    g.push(Ln(f3needle(k, P, line, st.reached), { tone: "lit", className: "needle acc-line" }).replace("<path", `<path data-part="needle" data-line="${line}"`));
    g.push(Ln(k.ring(cx, y0, 1.6, 8.6, P, 16), { tone: "hi" }));
    out.push(`<g class="line" data-line="${line}">${g.join("")}</g>`);
  });
  out.push(t.ruler({ x: -150, y: 44, w: 190, d: 6, r: 1 }));
  out.push(t.label({ x: 66, y: 41, w: 44, d: 12, r: 1.5 }));
  return out.join("");
}

/* ======================= Рис. 4 · Кассета состояний экрана ======================= */
const F4 = {
  AZ: 50,
  SLOT: (j) => -75 + j * 50, // центры окон в кассете
  TRAY_Z: 6,
};
function f4screen(k, P, t, j, cx, on) {
  const { S, Ln, D } = t;
  const z = 11;
  const scr = { x: cx - 18, y: -29, w: 36, d: 58, r: 4 };
  const out = [S(k.slabOf(scr, 10.5, 0.5, P, 4), { tone: "lo", crease: "none", className: on ? "scr acc-screen" : "scr" })];
  const L = cx - 14, R = cx + 14;
  // шапка экрана
  out.push(Ln(k.lineOnTop([L, -23], [L + 15, -23], z, P), { tone: j === 1 ? "faint" : "hi", free: true, className: "fat" }));
  if (j === 0 || j === 1) {
    for (let r = 0; r < 3; r++) {
      const c = { x: L, y: -17 + r * 13.5, w: 28, d: 11, r: 2 };
      if (j === 0) {
        out.push(S(k.slabOf(c, z, 0.8, P, 3), { tone: "mid", crease: "none" }));
        out.push(t.rule(L + 3, L + 16 - r * 2, c.y + 3.6, z + 0.8, "hi"));
        out.push(t.rule(L + 3, L + 11, c.y + 7.4, z + 0.8, "lo"));
        out.push(`<g class="status s${r}">${S(k.slabOf({ x: R - 9, y: c.y + 2.4, w: 7, d: 3, r: 1.5 }, z + 0.8, 0.4, P, 3), { tone: "hi", crease: "none" })}</g>`);
      } else {
        out.push(`<g class="skel">${S(k.slabOf(c, z, 0.3, P, 3), { tone: "faint", crease: "none" })}</g>`);
      }
    }
  } else {
    // пусто / ошибка: значок, строка, кнопка
    out.push(S(k.cylinder(cx, -2, 5, z, 0.6, P, 28), { tone: "mid", crease: "none", className: j === 3 ? "err" : "" }));
    if (j === 2) out.push(Ln(k.planOutline({ x: cx - 2.4, y: -4, w: 4.8, d: 4, r: 0.6 }, z + 0.6, P, 2), { tone: "hi" }));
    else out.push(Ln(k.lineOnTop([cx, -5.2], [cx, -1], z + 0.6, P), { tone: "hi", free: true }) + D([[cx, 1, z + 0.6]], { size: 0.55, tone: "hi" }));
    out.push(t.rule(cx - 9, cx + 9, 7, z, "hi"));
    out.push(t.rule(cx - 6, cx + 6, 10.5, z, "lo"));
    const btn = { x: cx - 10, y: 16, w: 20, d: 6, r: 3 };
    out.push(S(k.slabOf(btn, z, j === 2 ? 1 : 0.6, P, 4), { tone: j === 2 ? "hi" : "mid", className: j === 2 ? "acc btn" : "btn" }));
  }
  // таб-бар внизу экрана
  out.push(Ln(k.lineOnTop([scr.x, 23.5], [scr.x + scr.w, 23.5], z, P), { tone: "faint" }));
  out.push(D([0, 1, 2, 3].map((n) => [L + 2 + n * 8, 26, z]), { size: 0.55, tone: "lo" }));
  return out.join("");
}
function f4tray(k, P) {
  const t = tools(k, P);
  const { S, Ln, D } = t;
  const out = [];
  const tray = { x: -104, y: -46, w: 208, d: 92, r: 3 };
  const z = F4.TRAY_Z;
  const seams = [];
  out.push(S(k.slabOf(tray, z, 3, P, 4, 0.5), { tone: "mid" }));
  // четыре гнезда, слайды-рамки с экранами
  for (let j = 0; j < 4; j++) {
    const cx = F4.SLOT(j);
    const mount = { x: cx - 22, y: -34, w: 44, d: 68, r: 2 };
    out.push(Ln(k.planOutline(k.insetPlan(mount, -1.4), z + 3, P, 3), { tone: "faint" }));
    out.push(`<g class="slide" data-i="${j}">${S(k.slabOf(mount, z + 3, 1.5, P, 3, 0.4), { tone: "hi" })}${t.screws(mount, 2.2, z + 4.5, 0.4)}${f4screen(k, P, t, j, cx, false)}</g>`);
  }
  // засечки фиксатора на переднем крае кассеты: по одной на гнездо
  const fy = tray.y + tray.d;
  for (let j = 0; j < 4; j++) seams.push(k.segment([F4.SLOT(j), fy, z], [F4.SLOT(j), fy, z + 3], P));
  out.push(Ln(seams.join(""), { tone: "lo" }));
  // ручка на торце кассеты
  out.push(S(k.slabOf({ x: 104, y: -8, w: 4, d: 16, r: 1 }, z + 0.5, 2, P, 2), { tone: "mid" }));
  out.push(S(k.slabOf({ x: 108, y: -12, w: 6, d: 24, r: 2.5 }, z - 0.5, 4, P, 4, 0.4), { tone: "mid" }));
  const kn = [];
  for (let y = -10; y <= 10; y += 2) kn.push(k.segment([114, y, z - 0.5], [114, y, z + 3.5], P));
  out.push(Ln(kn.join(""), { tone: "lo" }));
  // указатель на переднем крае: стрелка к линейке
  out.push(S(k.slabOf({ x: -2, y: fy, w: 4, d: 6, r: 0.5 }, z + 1.5, 1.2, P, 2), { tone: "hi", className: "acc" }));
  return out.join("");
}
function fig4(k, P, sel = 2) {
  const t = tools(k, P);
  const { S, Ln, D } = t;
  const BASE = { x: -206, y: -66, w: 412, d: 140, r: 8 };
  const out = [t.base(BASE, 10)];
  // световой стол: рамка и стекло, под ним лампа
  const box = { x: -30, y: -40, w: 60, d: 80, r: 3 };
  out.push(S(k.slabOf(k.insetPlan(box, -3), 0, 1, P, 4, 0.3), { tone: "mid" }));
  out.push(`<g class="glass">${S(k.slabOf(box, 0.6, 0.6, P, 4), { tone: "hi", crease: "none" })}</g>`);
  out.push(t.screws(k.insetPlan(box, -3), 1.4, 1));
  // рельсы
  for (const ry of [-48, 42]) {
    const rail = { x: -192, y: ry, w: 384, d: 6, r: 1 };
    out.push(S(k.slabOf(rail, 0, F4.TRAY_Z, P, 3, 0.4), { tone: "mid", inner: Ln(k.sideSeam(rail, 3, P, 3), { tone: "faint" }) }));
    const pts = [];
    for (let x = -176; x <= 176; x += 32) pts.push([x, ry + 3, F4.TRAY_Z]);
    out.push(D(pts, { size: 0.4 }));
  }
  // концевые упоры
  for (const x of [-198, 192]) out.push(S(k.slabOf({ x, y: -50, w: 6, d: 100, r: 1.2 }, 0, 12, P, 3, 0.5), { tone: "mid" }));
  out.push(`<g data-part="tray" transform="${k.translateAlong(P, [-F4.SLOT(sel), 0, 0])}">${f4tray(k, P)}</g>`);
  // фиксатор за задним рельсом
  out.push(S(k.slabOf({ x: -6, y: -62, w: 12, d: 10, r: 1.5 }, 0, 10, P, 3, 0.4), { tone: "mid" }));
  out.push(t.D([[-3.5, -57, 10], [3.5, -57, 10]], { size: 0.42 }));
  // линейка позиций спереди: крупные риски — гнёзда
  const strip = { x: -100, y: 50, w: 200, d: 6, r: 1 };
  const tk = k.topTicks(strip.x + 3, strip.x + strip.w - 3, 5, 5, strip.y + 0.2, 0.6, [1.8, 3.6], P);
  out.push(S(k.slabOf(strip, 0, 0.6, P, 3), { tone: "lo", crease: "none" }) + Ln(tk.minor, { tone: "lo" }) + Ln(tk.major, { tone: "mid" }));
  out.push(t.label({ x: 130, y: 54, w: 44, d: 12, r: 1.5 }));
  return out.join("");
}

const CAM = {"1":{"origin":[336.77,288.08],"scale":1.4043613120772573,"azimuth":50,"elevation":30},"2":{"origin":[348.8,231.41],"scale":1.6205280513523381,"azimuth":48,"elevation":30},"3":{"origin":[324.5,219.07],"scale":1.4296370992746459,"azimuth":56,"elevation":30},"4":{"origin":[323.78,174.25],"scale":1.1616831911419803,"azimuth":50,"elevation":30}};
const still = matchMedia("(prefers-reduced-motion: reduce)");
const READ1 = (i) => `${T[i].name} · ${T[i].share}% · ≈${T[i].share * 20} обращений`, READ2 = (i) => `${DATA.tabs[i].name}: ${DATA.tabs[i].items.join(" · ")}`, READ4 = (i) => `${DATA.states[i].name} · ${DATA.states[i].note}`, READ3 = "Было: 5 шагов и два звонка · Стало: 2 шага";
const T = DATA.topics;
function stepSpring(s, dt, stiff = 190, damp = 24) {
  if (still.matches) { s.at = s.to; s.v = 0; return false; }
  for (let i = 0; i < 4; i++) { s.v += ((s.to - s.at) * stiff - s.v * damp) * dt / 4; s.at += s.v * dt / 4; }
  if (Math.abs(s.to - s.at) < 0.01 && Math.abs(s.v) < 0.01) { s.at = s.to; s.v = 0; return false; }
  return true;
}
function loop(tick) {
  let frame = 0, last = 0;
  const f = (now) => { const dt = last ? Math.min((now - last) / 1000, 1 / 30) : 1 / 60; last = now; frame = tick(dt) ? requestAnimationFrame(f) : 0; if (!frame) last = 0; };
  return () => { if (!frame) frame = requestAnimationFrame(f); };
}
const say = (root, text) => { const r = root.querySelector("[data-readout]"); if (r.textContent !== text) r.textContent = text; };
function bindKeys(root, count, select, get) {
  const stage = root.querySelector(".cf-stage");
  root.querySelectorAll("[data-key]").forEach((b) => {
    const i = +b.dataset.key;
    b.addEventListener("pointerenter", (e) => { if (e.pointerType === "mouse") select(i); });
    b.addEventListener("focus", () => select(i));
    b.addEventListener("click", () => select(i));
  });
  stage.addEventListener("keydown", (e) => {
    const map = { ArrowRight: 1, ArrowDown: 1, ArrowLeft: -1, ArrowUp: -1 };
    if (e.key in map) { e.preventDefault(); select((get() + map[e.key] + count) % count); }
    if (e.key === "Home") { e.preventDefault(); select(0); }
    if (e.key === "End") { e.preventDefault(); select(count - 1); }
  });
  stage.querySelectorAll(".hit").forEach((h) => {
    const i = +h.dataset.i;
    h.addEventListener("pointerenter", (e) => { if (e.pointerType === "mouse") select(i); });
    h.addEventListener("click", () => select(i));
  });
}
const markKeys = (root, i) => root.querySelectorAll("[data-key]").forEach((b) => b.toggleAttribute("data-on", +b.dataset.key === i));

/* Рис. 1 — лотки и высотомер */
{
  const root = document.querySelector('[data-cf="1"]');
  if (root) {
    const P = CAM[1];
    let sel = 0;
    const arm = { at: F1.topOf(0), to: F1.topOf(0), v: 0 };
    const lift = T.map((_, i) => ({ at: i === 0 ? 1 : 0, to: i === 0 ? 1 : 0, v: 0 }));
    const arms = root.querySelectorAll('[data-part="arm"]');
    const tops = root.querySelectorAll('[data-part="top"]');
    const trays = root.querySelectorAll(".tray");
    const quotes = root.querySelector("[data-quotes]");
    const draw = () => {
      const tr = translateAlong(P, [0, 0, arm.at]);
      arms.forEach((a) => a.setAttribute("transform", tr));
      tops.forEach((g, i) => {
        const v = Math.max(0, lift[i].at);
        g.setAttribute("transform", v > 0.001 ? translateAlong(P, [0, 0, F1.LIFT * v]) : "");
      });
    };
    const run = loop((dt) => { let busy = stepSpring(arm, dt, 120, 20); lift.forEach((l) => (busy = stepSpring(l, dt, 210, 22) || busy)); draw(); return busy; });
    const select = (i) => {
      if (i === sel) return;
      sel = i;
      arm.to = F1.topOf(i);
      lift.forEach((l, n) => (l.to = n === i ? 1 : 0));
      trays.forEach((t, n) => t.toggleAttribute("data-on", n === i));
      markKeys(root, i);
      say(root, READ1(i));
      quotes.innerHTML = T[i].quotes.map((q) => "<li>" + q + "</li>").join("");
      run();
    };
    bindKeys(root, T.length, select, () => sel);
  }
}

/* Рис. 2 — картотека */
{
  const root = document.querySelector('[data-cf="2"]');
  if (root) {
    const P = CAM[2];
    let sel = 2;
    const dr = [0, 1, 2, 3, 4].map((i) => ({ at: i === 2 ? F2.OPEN : 0, to: i === 2 ? F2.OPEN : 0, v: 0, drawn: i === 2 ? F2.OPEN : 0 }));
    const groups = [...root.querySelectorAll(".drawer")].sort((a, b) => a.dataset.i - b.dataset.i);
    const parent = groups[0].parentNode;
    const hitFirst = root.querySelector(".hit");
    let order = "";
    const draw = () => {
      dr.forEach((d, i) => {
        if (Math.abs(d.drawn - d.at) < 0.02) return;
        d.drawn = d.at;
        groups[i].innerHTML = f2drawer(k, P, i, Math.max(0, d.at));
      });
      const next = [0, 1, 2, 3, 4].sort((a, b) => (dr[a].at > 0.3) - (dr[b].at > 0.3) || a - b);
      const key = next.join("");
      if (key !== order) { order = key; next.forEach((i) => parent.insertBefore(groups[i], hitFirst)); }
    };
    const run = loop((dt) => { let busy = false; dr.forEach((d) => (busy = stepSpring(d, dt, 150, 22) || busy)); draw(); return busy; });
    const select = (i) => {
      if (i === sel) return;
      sel = i;
      dr.forEach((d, n) => (d.to = n === i ? F2.OPEN : 0));
      groups.forEach((g, n) => g.toggleAttribute("data-on", n === i));
      markKeys(root, i);
      say(root, READ2(i));
      run();
    };
    bindKeys(root, 5, select, () => sel);
  }
}

/* Рис. 3 — две линии */
{
  const root = document.querySelector('[data-cf="3"]');
  if (root) {
    const P = CAM[3];
    const total = Math.max(f3total(F3.STATIONS[0]), f3total(F3.STATIONS[1]));
    let t = 99, running = false;
    const needles = F3.Y.map(() => ({ at: 0, to: 0, v: 0 }));
    const shuttles = root.querySelectorAll('[data-part="shuttle"]');
    const pins = root.querySelectorAll('[data-part="pin"]');
    const lamps = root.querySelectorAll(".lamp");
    const ndl = root.querySelectorAll('[data-part="needle"]');
    const name = (list, n) => (n ? list[n - 1] : "старт");
    const draw = () => {
      const st = F3.STATIONS.map((s) => f3line(s, t));
      st.forEach((s, line) => {
        shuttles[line].setAttribute("transform", translateAlong(P, [s.x, 0, 0]));
        needles[line].to = s.reached;
      });
      pins.forEach((p) => { const v = st[+p.dataset.line].lift[+p.dataset.i]; p.setAttribute("transform", v ? translateAlong(P, [0, 0, F3.PIN.lift * v]) : ""); });
      lamps.forEach((l) => l.toggleAttribute("data-on", +l.dataset.i < st[+l.dataset.line].reached));
      ndl.forEach((n) => n.setAttribute("d", f3needle(k, P, +n.dataset.line, needles[+n.dataset.line].at)));
      say(root, t >= total ? READ3 : "Было " + st[0].reached + "/5 · " + name(DATA.before, st[0].reached) + " — Стало " + st[1].reached + "/2 · " + name(DATA.after, st[1].reached));
    };
    const run = loop((dt) => {
      if (running) { t = still.matches ? 99 : t + dt; if (t >= total) { t = 99; running = false; } }
      let busy = running;
      needles.forEach((n) => (busy = stepSpring(n, dt, 260, 20) || busy));
      draw();
      return busy;
    });
    const go = () => { t = 0; running = true; needles.forEach((n) => { n.to = 0; }); run(); };
    const stage = root.querySelector(".cf-stage");
    stage.addEventListener("click", go);
    stage.addEventListener("keydown", (e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); go(); } });
    root.querySelector(".cf-run").addEventListener("click", go);
    needles.forEach((n, line) => { n.at = n.to = F3.STATIONS[line].length; });
  }
}

/* Рис. 4 — кассета состояний */
{
  const root = document.querySelector('[data-cf="4"]');
  if (root) {
    const P = CAM[4];
    let sel = 2;
    const tray = { at: -F4.SLOT(2), to: -F4.SLOT(2), v: 0 };
    const g = root.querySelector('[data-part="tray"]');
    const slides = root.querySelectorAll(".slide");
    const draw = () => g.setAttribute("transform", translateAlong(P, [tray.at, 0, 0]));
    const run = loop((dt) => { const busy = stepSpring(tray, dt, 120, 21); draw(); return busy; });
    const select = (i) => {
      if (i === sel) return;
      sel = i;
      tray.to = -F4.SLOT(i);
      slides.forEach((s, n) => s.toggleAttribute("data-on", n === i));
      markKeys(root, i);
      say(root, READ4(i));
      run();
    };
    bindKeys(root, 4, select, () => sel);
    slides.forEach((s) => {
      s.addEventListener("pointerenter", (e) => { if (e.pointerType === "mouse") select(+s.dataset.i); });
      s.addEventListener("click", () => select(+s.dataset.i));
    });
  }
}
