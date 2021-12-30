import * as d3 from "d3";

const random = d3.randomNormal(0, 1);
const data = Array.from({ length: 800 }, () => [random(), random()]);
const width = 1000;
const height = 1000;

const svg = d3
  .create("svg")
  .attr("viewBox", [-width / 2, -height / 2, width, height])
  .style("cursor", "crosshair");

svg
  .append("defs")
  .append("style")
  .text(`circle.highlighted { stroke: orangered; fill: orangered; }`);

// x and y are scales that project the data space to the ‘unzoomed’ pixel referential
const x = d3.scaleLinear([0, 1], [0, 100]);
const y = d3.scaleLinear([0, 1], [0, 100]);

const delaunay = d3.Delaunay.from(
  data,
  (d) => x(d[0]),
  (d) => y(d[1])
);

const g = svg.append("g");

const points = g
  .selectAll("circle")
  .data(data)
  .join("circle")
  .attr("cx", (d) => x(d[0]))
  .attr("cy", (d) => y(d[1]));

let transform;

const zoom = d3.zoom().on("zoom", (e) => {
  g.attr("transform", (transform = e.transform));
  g.style("stroke-width", 3 / Math.sqrt(transform.k));
  points.attr("r", 3 / Math.sqrt(transform.k));
});

document.body.appendChild(
  svg
    .call(zoom)
    .call(zoom.transform, d3.zoomIdentity)
    .on("pointermove", (event) => {
      const p = transform.invert(d3.pointer(event));
      const i = delaunay.find(...p);
      points.classed("highlighted", (_, j) => i === j);
      d3.select(points.nodes()[i]).raise();
    })
    .node()
);
