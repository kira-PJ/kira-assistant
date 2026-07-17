import React from 'react';

interface RadarChartProps {
  dimensions: { name: string; score: number }[];
  size?: number;
}

/**
 * RadarChart - SVG radar/spider chart for call scoring visualization
 * Pure React + SVG, no external chart library needed.
 */
const RadarChart: React.FC<RadarChartProps> = ({ dimensions, size = 200 }) => {
  const center = size / 2;
  const radius = size / 2 - 30;
  const angleStep = (2 * Math.PI) / dimensions.length;

  const getPoint = (index: number, value: number): { x: number; y: number } => {
    const angle = angleStep * index - Math.PI / 2;
    const r = (value / 100) * radius;
    return {
      x: center + r * Math.cos(angle),
      y: center + r * Math.sin(angle),
    };
  };

  // Grid circles
  const gridLevels = [25, 50, 75, 100];
  const gridCircles = gridLevels.map((level) => {
    const r = (level / 100) * radius;
    return (
      <circle
        key={level}
        cx={center}
        cy={center}
        r={r}
        fill="none"
        stroke="rgba(15, 52, 96, 0.5)"
        strokeWidth="1"
      />
    );
  });

  // Axis lines
  const axisLines = dimensions.map((_, i) => {
    const point = getPoint(i, 100);
    return (
      <line
        key={i}
        x1={center}
        y1={center}
        x2={point.x}
        y2={point.y}
        stroke="rgba(15, 52, 96, 0.5)"
        strokeWidth="1"
      />
    );
  });

  // Data polygon
  const dataPoints = dimensions.map((dim, i) => getPoint(i, dim.score));
  const polygonPoints = dataPoints.map(p => `${p.x},${p.y}`).join(' ');

  // Labels
  const labels = dimensions.map((dim, i) => {
    const point = getPoint(i, 115);
    return (
      <text
        key={i}
        x={point.x}
        y={point.y}
        textAnchor="middle"
        dominantBaseline="middle"
        className="fill-ghost-text-dim"
        fontSize="8"
      >
        {dim.name.length > 12 ? dim.name.slice(0, 10) + '…' : dim.name}
      </text>
    );
  });

  // Score dots
  const dots = dataPoints.map((p, i) => (
    <circle key={i} cx={p.x} cy={p.y} r="3" fill="#16db93" />
  ));

  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
      {gridCircles}
      {axisLines}
      <polygon
        points={polygonPoints}
        fill="rgba(22, 219, 147, 0.15)"
        stroke="#16db93"
        strokeWidth="1.5"
      />
      {dots}
      {labels}
    </svg>
  );
};

export default RadarChart;
