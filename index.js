import { seriesSvgAnnotation } from "./annotation-series.js";
import {
  distance,
  trunc,
  hashCode,
  webglColor,
  iterateElements,
} from "./util.js";

let data = [];
let quadtree;

const createAnnotationData = (datapoint) => ({
  note: {
    label: String.fromCodePoint(datapoint.codepoint),
    bgPadding: 5,
    title: datapoint.codepoint,
  },
  x: datapoint.x,
  y: datapoint.y,
  dx: 20,
  dy: 20,
});

// create a web worker that streams the chart data
const streamingLoaderWorker = new Worker("streaming-tsv-parser.js");
streamingLoaderWorker.onmessage = ({
  data: { items, totalBytes, finished },
}) => {
  const rows = items
    .map((d) => ({
      ...d,
      x: Number(d.x),
      y: Number(d.y),
      codepoint: Number(d.codepoint),
    }))
    .filter((d) => d.codepoint);
  data = data.concat(rows);
  console.log(data);

  if (finished) {
    document.getElementById("loading").style.display = "none";

    const colorFillGenerator = ([a, b]) => {
      return (d) => {
        if (d.codepoint >= a && d.codepoint <= b) {
          return webglColor("red");
        }
        return webglColor("lightgray");
      };
    };

    // compute the fill color for each datapoint

    const codepointFill = (d) => webglColor(codepointColorScale(d.codepoint));

    const fillColor = fc.webglFillColor().value(codepointFill).data(data);
    pointSeries.decorate((program) => fillColor(program));

    // wire up the fill color selector
    iterateElements(".controls div", (el) => {
      el.addEventListener("click", () => {
        iterateElements(".controls div", (el2) =>
          el2.classList.remove("active")
        );
        let rangeName = el.className;
        el.classList.add("active");
        if (rangeName === "All") {
          codepointFill;
          fillColor.value(codepointFill);
        } else {
          fillColor.value(colorFillGenerator(unicodeRanges[rangeName]));
        }
        redraw();
      });
    });

    // create a spatial index for rapidly finding the closest datapoint
    quadtree = d3
      .quadtree()
      .x((d) => d.x)
      .y((d) => d.y)
      .addAll(data);
  }

  redraw();
};
streamingLoaderWorker.postMessage("unic.tsv");

const languageColorScale = d3.scaleOrdinal(d3.schemeCategory10);
const codepointColorScale = d3
  .scaleSequential()
  .domain([0, 65536])
  .interpolator(d3.interpolateRdYlGn);
const xScale = d3.scaleLinear().domain([-1, 1]);
const yScale = d3.scaleLinear().domain([-1, 1]);
const xScaleOriginal = xScale.copy();
const yScaleOriginal = yScale.copy();

const pointSeries = fc
  .seriesWebglPoint()
  .equals((a, b) => a === b)
  .size(5)
  .crossValue((d) => d.x)
  .mainValue((d) => d.y);

const zoom = d3
  .zoom()
  .scaleExtent([0.8, 10])
  .on("zoom", () => {
    // update the scales based on current zoom
    xScale.domain(d3.event.transform.rescaleX(xScaleOriginal).domain());
    yScale.domain(d3.event.transform.rescaleY(yScaleOriginal).domain());
    redraw();
  });

const annotations = [];

const pointer = fc.pointer().on("point", ([coord]) => {
  annotations.pop();

  if (!coord || !quadtree) {
    return;
  }

  // find the closes datapoint to the pointer
  const x = xScale.invert(coord.x);
  const y = yScale.invert(coord.y);
  const radius = Math.abs(xScale.invert(coord.x) - xScale.invert(coord.x - 20));
  const closestDatum = quadtree.find(x, y, radius);

  // if the closest point is within 20 pixels, show the annotation
  if (closestDatum) {
    annotations[0] = createAnnotationData(closestDatum);
  }

  redraw();
});

const annotationSeries = seriesSvgAnnotation()
  .notePadding(15)
  .type(d3.annotationCallout);

const chart = fc
  .chartCartesian(xScale, yScale)
  .webglPlotArea(
    // only render the point series on the WebGL layer
    fc
      .seriesWebglMulti()
      .series([pointSeries])
      .mapping((d) => d.data)
  )
  .svgPlotArea(
    // only render the annotations series on the SVG layer
    fc
      .seriesSvgMulti()
      .series([annotationSeries])
      .mapping((d) => d.annotations)
  )
  .decorate((sel) =>
    sel
      .enter()
      .select("d3fc-svg.plot-area")
      .on("measure.range", () => {
        xScaleOriginal.range([0, d3.event.detail.width]);
        yScaleOriginal.range([d3.event.detail.height, 0]);
      })
      .call(zoom)
      .call(pointer)
  );

// render the chart with the required data
// Enqueues a redraw to occur on the next animation frame
const redraw = () => {
  d3.select("#chart").datum({ annotations, data }).call(chart);
};
