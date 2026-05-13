'use client'

import React, { useEffect, useRef, useState } from 'react'
import * as d3 from 'd3'

interface HierarchyNode {
  name: string
  value?: number
  children?: HierarchyNode[]
}

interface HierarchicalBarChartProps {
  data: HierarchyNode
}

export default function HierarchicalBarChart({ data }: HierarchicalBarChartProps) {
  const svgRef = useRef<SVGSVGElement>(null)
  const containerRef = useRef<HTMLDivElement>(null)
  const [currentPath, setCurrentPath] = useState<string[]>(['root'])

  useEffect(() => {
    if (!svgRef.current || !containerRef.current || !data) return

    const containerWidth = containerRef.current.clientWidth
    const containerHeight = 320
    const margin = { top: 30, right: 60, bottom: 20, left: 140 }
    const width = containerWidth - margin.left - margin.right
    const height = containerHeight - margin.top - margin.bottom
    const barStep = 32
    const barPadding = 8

    const root = d3.hierarchy(data)
      .sum(d => d.value || 0)
      .sort((a, b) => (b.value || 0) - (a.value || 0))

    // Find the node corresponding to currentPath
    let currentNode = root
    for (let i = 1; i < currentPath.length; i++) {
      const child = currentNode.children?.find(c => c.data.name === currentPath[i])
      if (child) currentNode = child
    }

    const svg = d3.select(svgRef.current)
      .attr('width', containerWidth)
      .attr('height', containerHeight)
      .attr('viewBox', `0 0 ${containerWidth} ${containerHeight}`)

    svg.selectAll('*').remove()

    // Background for clicking back
    svg.append('rect')
      .attr('width', containerWidth)
      .attr('height', containerHeight)
      .attr('fill', 'none')
      .attr('pointer-events', 'all')
      .on('click', (event) => {
        if (currentPath.length > 1) {
          setCurrentPath(currentPath.slice(0, -1))
        }
      })

    const g = svg.append('g')
      .attr('transform', `translate(${margin.left},${margin.top})`)

    const x = d3.scaleLinear()
      .domain([0, d3.max(currentNode.children || [], d => d.value || 0) || 0])
      .nice()
      .range([0, width])

    // X-axis (Top)
    g.append('g')
      .attr('class', 'x-axis')
      .attr('transform', `translate(0,-10)`)
      .call(d3.axisTop(x).ticks(5).tickFormat(d3.format('~s')).tickSize(0))
      .attr('color', '#9ca3af')
      .selectAll('text')
      .style('font-size', '10px')

    g.select('.domain').remove()
    g.selectAll('.tick line').remove()

    // Chart Title
    const isRoot = currentPath.length === 1
    const currentName = currentPath[currentPath.length - 1]
    
    svg.append('text')
      .attr('x', margin.left)
      .attr('y', 20)
      .attr('fill', '#111827')
      .style('font-size', '13px')
      .style('font-weight', '800')
      .style('text-transform', 'uppercase')
      .style('letter-spacing', '0.025em')
      .text(isRoot ? 'Top Sales Categories' : `Top Selling Products in ${currentName}`)

    // Render bars
    const bars = g.selectAll('.bar-group')
      .data(currentNode.children || [])
      .enter().append('g')
      .attr('class', 'bar-group')
      .attr('transform', (d, i) => `translate(0,${i * barStep})`)
      .style('cursor', d => d.children ? 'pointer' : 'default')
      .on('click', (event, d) => {
        event.stopPropagation()
        if (d.children) {
          setCurrentPath([...currentPath, d.data.name])
        }
      })

    // Clickable background for the entire row (Full width of the chart area)
    bars.append('rect')
      .attr('class', 'click-bg')
      .attr('x', -margin.left)
      .attr('y', 0)
      .attr('width', containerWidth)
      .attr('height', barStep)
      .attr('fill', 'rgba(0,0,0,0)')
      .attr('pointer-events', 'all')

    bars.append('rect')
      .attr('class', 'main-bar')
      .attr('fill', (d, i) => d.children ? '#3b82f6' : '#60a5fa')
      .attr('width', 0)
      .attr('height', barStep - barPadding)
      .attr('rx', 6) // Slightly more rounded for modern look
      .transition()
      .duration(750)
      .delay((d, i) => i * 50)
      .attr('width', d => x(d.value || 0))

    bars.append('text')
      .attr('x', -15)
      .attr('y', (barStep - barPadding) / 2)
      .attr('dy', '0.35em')
      .attr('text-anchor', 'end')
      .attr('fill', '#4b5563')
      .style('font-size', '11px')
      .style('font-weight', '600')
      .text(d => d.data.name.length > 25 ? d.data.name.slice(0, 22) + '...' : d.data.name)
      .style('opacity', 0)
      .transition()
      .duration(500)
      .delay((d, i) => i * 50 + 400)
      .style('opacity', 1)

    bars.append('text')
      .attr('class', 'value-label')
      .attr('x', d => x(d.value || 0) + 8)
      .attr('y', (barStep - barPadding) / 2)
      .attr('dy', '0.35em')
      .attr('fill', '#1d4ed8')
      .style('font-size', '11px')
      .style('font-weight', '700')
      .attr('opacity', 0)
      .text(d => d.value?.toLocaleString())
      .transition()
      .delay((d, i) => i * 50 + 600)
      .duration(300)
      .attr('opacity', 1)

    // Hover effects
    bars.on('mouseenter', function(event, d) {
      d3.select(this).select('.main-bar')
        .transition().duration(200)
        .attr('fill', '#2563eb')
      
      d3.select(this).select('.value-label')
        .transition().duration(200)
        .attr('x', x(d.value || 0) + 12)
    })
    .on('mouseleave', function(event, d) {
      d3.select(this).select('.main-bar')
        .transition().duration(200)
        .attr('fill', d.children ? '#3b82f6' : '#60a5fa')

      d3.select(this).select('.value-label')
        .transition().duration(200)
        .attr('x', x(d.value || 0) + 8)
    })

    return () => {}
  }, [data, currentPath])

  return (
    <div className="relative h-full pt-4" ref={containerRef}>
      <div className="flex items-center gap-3 mb-6 absolute -top-10 left-0 w-full justify-between pr-4 bg-white/80 backdrop-blur-sm py-2 z-20">
        <div className="flex items-center gap-2">
          {currentPath.length > 1 && (
            <button 
              onClick={() => setCurrentPath(currentPath.slice(0, -1))}
              className="group flex items-center gap-1 px-3 py-1 bg-gray-100 text-gray-700 rounded-full text-[10px] font-bold uppercase tracking-wider hover:bg-blue-600 hover:text-white transition-all duration-300"
            >
              <svg xmlns="http://www.w3.org/2000/svg" className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M15 19l-7-7 7-7" />
              </svg>
              Back
            </button>
          )}
          <div className="flex items-center gap-1 overflow-hidden">
            {currentPath.map((path, i) => (
              <React.Fragment key={path}>
                {i > 0 && <span className="text-gray-300">/</span>}
                <span className={`text-[11px] font-bold uppercase tracking-widest whitespace-nowrap ${i === currentPath.length - 1 ? 'text-blue-600' : 'text-gray-400'}`}>
                  {path === 'root' ? 'All Categories' : path}
                </span>
              </React.Fragment>
            ))}
          </div>
        </div>
      </div>
      <svg ref={svgRef} className="overflow-visible"></svg>
      
      {currentPath.length === 1 && (
        <div className="absolute bottom-0 right-4 pointer-events-none">
          <p className="text-[10px] text-gray-400 italic bg-white/80 px-2 py-1 rounded">Click any category to view products</p>
        </div>
      )}
    </div>
  )
}
