'use client'

import React, { useEffect, useRef } from 'react'
import * as d3 from 'd3'

interface DataPoint {
  name: string
  revenue: number
}

interface Series {
  id: string
  label: string
  color: string
  values: DataPoint[]
}

interface RevenueWeeklyChartProps {
  series: Series[]
}

export default function RevenueWeeklyChart({ series }: RevenueWeeklyChartProps) {
  const svgRef = useRef<SVGSVGElement>(null)
  const containerRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!svgRef.current || !containerRef.current || series.length === 0) return

    // Clear previous SVG content
    d3.select(svgRef.current).selectAll('*').remove()

    const containerWidth = containerRef.current.clientWidth
    const containerHeight = 320
    const margin = { top: 30, right: 120, bottom: 40, left: 60 }
    const width = containerWidth - margin.left - margin.right
    const height = containerHeight - margin.top - margin.bottom

    const svg = d3.select(svgRef.current)
      .attr('width', containerWidth)
      .attr('height', containerHeight)
      .append('g')
      .attr('transform', `translate(${margin.left},${margin.top})`)

    // All possible week names across all series
    const allWeeks = Array.from(new Set(series.flatMap(s => s.values.map(v => v.name))))
      .sort((a, b) => a.localeCompare(b))

    // X axis
    const x = d3.scalePoint()
      .domain(allWeeks)
      .range([0, width])

    svg.append('g')
      .attr('transform', `translate(0,${height})`)
      .call(d3.axisBottom(x).tickSize(0))
      .attr('color', '#9ca3af')
      .selectAll('text')
      .style('font-size', '12px')
      .attr('dy', '1.5em')

    svg.selectAll('.domain').remove() // Remove all axis lines for ultimate cleanliness

    // Y axis
    const maxY = d3.max(series, s => d3.max(s.values, d => d.revenue) || 0) || 0
    const y = d3.scaleLinear()
      .domain([0, maxY * 1.1]) // Add some headroom
      .nice()
      .range([height, 0])

    svg.append('g')
      .call(d3.axisLeft(y).ticks(5).tickFormat(d3.format('~s')).tickSize(0))
      .attr('color', '#9ca3af')
      .selectAll('text')
      .style('font-size', '12px')
      .attr('dx', '-10px')

    svg.select('.domain').remove() // Remove the axis line itself for a cleaner look if desired, but user only asked for value lines.
    // Actually, user said "remove the horizontal and vertical value lines so that the actual blue values can be seen clearly".
    // Value lines usually refer to grid lines.


    // Line generator
    const line = d3.line<DataPoint>()
      .x(d => x(d.name) || 0)
      .y(d => y(d.revenue))
      .curve(d3.curveMonotoneX)

    // Tooltip
    const tooltip = d3.select('body').append('div')
      .attr('class', 'd3-tooltip')
      .style('position', 'absolute')
      .style('visibility', 'hidden')
      .style('background', 'white')
      .style('border', '1px solid #e5e7eb')
      .style('border-radius', '6px')
      .style('padding', '8px 12px')
      .style('box-shadow', '0 4px 12px rgba(0,0,0,0.08)')
      .style('font-size', '12px')
      .style('pointer-events', 'none')
      .style('z-index', '1000')

    // Add series
    series.forEach((s) => {
      // Path
      const path = svg.append('path')
        .datum(s.values)
        .attr('fill', 'none')
        .attr('stroke', s.color)
        .attr('stroke-width', 3)
        .attr('stroke-linejoin', 'round')
        .attr('stroke-linecap', 'round')
        .attr('d', line)

      const totalLength = path.node()?.getTotalLength() || 0
      path
        .attr('stroke-dasharray', totalLength + ' ' + totalLength)
        .attr('stroke-dashoffset', totalLength)
        .transition()
        .duration(1500)
        .ease(d3.easeExpOut)
        .attr('stroke-dashoffset', 0)

      // Points
      svg.selectAll(`.dot-${s.id}`)
        .data(s.values)
        .enter().append('circle')
        .attr('class', `dot-${s.id}`)
        .attr('cx', d => x(d.name) || 0)
        .attr('cy', d => y(d.revenue))
        .attr('r', 5)
        .attr('fill', s.color)
        .attr('stroke', '#fff')
        .attr('stroke-width', 2)
        .style('opacity', 0)
        .transition()
        .delay(1000)
        .duration(500)
        .style('opacity', 1)

      // Data Labels (The "Blue Values")
      svg.selectAll(`.label-${s.id}`)
        .data(s.values)
        .enter().append('text')
        .attr('class', `label-${s.id}`)
        .attr('x', d => x(d.name) || 0)
        .attr('y', d => y(d.revenue) - 12)
        .attr('text-anchor', 'middle')
        .attr('fill', s.color)
        .style('font-size', '10px')
        .style('font-weight', 'bold')
        .style('opacity', 0)
        .text(d => d.revenue > 0 ? `₹${d3.format(".2s")(d.revenue)}` : '')
        .transition()
        .delay(1300)
        .duration(500)
        .style('opacity', s.id === 'current' ? 1 : 0.6)

      // Event listeners for dots
      svg.selectAll(`.dot-${s.id}`)
        .on('mouseover', (event, d: any) => {
          tooltip.style('visibility', 'visible')
            .html(`
              <div class="flex items-center gap-2 mb-1">
                <div class="w-2 h-2 rounded-full" style="background: ${s.color}"></div>
                <span class="font-bold">${s.label}</span>
              </div>
              <div class="text-gray-600">${d.name}</div>
              <div class="font-bold text-gray-900">₹${d.revenue.toLocaleString('en-IN')}</div>
            `)
          d3.select(event.currentTarget).attr('r', 7)
        })
        .on('mousemove', (event) => {
          tooltip.style('top', (event.pageY - 10) + 'px')
            .style('left', (event.pageX + 15) + 'px')
        })
        .on('mouseout', (event) => {
          tooltip.style('visibility', 'hidden')
          d3.select(event.currentTarget).attr('r', 5)
        })

      // Inline labels at the end of each line
      const lastPoint = s.values[s.values.length - 1]
      if (lastPoint) {
        svg.append('text')
          .attr('x', (x(lastPoint.name) || 0) + 10)
          .attr('y', y(lastPoint.revenue))
          .attr('dy', '0.35em')
          .attr('fill', s.color)
          .style('font-weight', 'bold')
          .style('font-size', '12px')
          .style('opacity', 0)
          .text(s.label)
          .transition()
          .delay(1200)
          .duration(500)
          .style('opacity', 1)
      }
    })

    // Final cleanup of any potential leftover lines
    svg.selectAll('.domain').remove()
    svg.selectAll('.tick line').remove()
    svg.selectAll('.y-grid').remove()

    return () => {
      tooltip.remove()
    }
  }, [series])

  return (
    <div ref={containerRef} className="w-full h-full">
      <svg ref={svgRef} className="overflow-visible"></svg>
    </div>
  )
}
