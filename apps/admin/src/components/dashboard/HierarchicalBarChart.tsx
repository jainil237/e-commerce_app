'use client'

import React, { useEffect, useRef, useState, useMemo } from 'react'
import * as d3 from 'd3'

interface HierarchyNode {
  name: string
  value?: number
  children?: HierarchyNode[]
}

interface HierarchicalBarChartProps {
  data: HierarchyNode
}

/**
 * Generates nice, readable tick values for the X-axis.
 * Adapts to the available width to prevent overlapping.
 */
function generateTicks(maxValue: number, plotWidth: number) {
  if (maxValue <= 0) return [0]

  const x = d3.scaleLinear().domain([0, maxValue]).nice()
  const niceMax = x.domain()[1]
  
  // Calculate target number of ticks (approx 1 every 80px)
  const targetCount = Math.max(2, Math.floor(plotWidth / 80))
  
  // Use D3's tick generation for natural intervals (1, 2, 5, 10, etc.)
  let ticks = x.ticks(targetCount)
  
  // Ensure the max value is included if it makes sense, or the nice max
  if (ticks[ticks.length - 1] < niceMax) {
    ticks.push(niceMax)
  }

  return ticks
}

export default function HierarchicalBarChart({ data }: HierarchicalBarChartProps) {
  const svgRef = useRef<SVGSVGElement>(null)
  const containerRef = useRef<HTMLDivElement>(null)
  const [currentPath, setCurrentPath] = useState<string[]>(['root'])
  const [dimensions, setDimensions] = useState({ width: 0, height: 0 })

  // Resize listener for true responsiveness
  useEffect(() => {
    if (!containerRef.current) return
    
    const observer = new ResizeObserver((entries) => {
      if (entries[0]) {
        setDimensions({
          width: entries[0].contentRect.width,
          height: entries[0].contentRect.height || 400 // fallback
        })
      }
    })
    
    observer.observe(containerRef.current)
    return () => observer.disconnect()
  }, [])

  // Process hierarchy and find current level rows
  const rows = useMemo(() => {
    if (!data) return []
    const root = d3.hierarchy(data)
      .sum(d => d.value || 0)
      .sort((a, b) => (b.value || 0) - (a.value || 0))

    let currentNode = root
    for (const pathPart of currentPath) {
      if (pathPart === 'root') continue
      const found = currentNode.children?.find(c => c.data.name === pathPart)
      if (found) currentNode = found
    }
    return currentNode.children || []
  }, [data, currentPath])

  useEffect(() => {
    if (!svgRef.current || dimensions.width === 0 || rows.length === 0) return

    const containerWidth = dimensions.width
    const isMobile = containerWidth < 640

    // Layout configuration
    const labelWidth = isMobile ? 80 : 140
    const valueWidth = 50
    const margin = { top: 30, right: 20, bottom: 20, left: 20 }
    
    const barStep = 44 // Balanced vertical rhythm
    const barHeight = 28
    const chartHeight = (rows.length * barStep) + margin.top + margin.bottom
    const plotWidth = Math.max(0, containerWidth - margin.left - margin.right - labelWidth - valueWidth - 20)
    
    const maxValue = d3.max(rows, d => d.value) || 1
    const tickValues = generateTicks(maxValue, plotWidth)
    const domainMax = tickValues[tickValues.length - 1]

    const x = d3.scaleLinear()
      .domain([0, domainMax])
      .range([0, plotWidth])

    const svg = d3.select(svgRef.current)
      .attr('width', containerWidth)
      .attr('height', chartHeight)
      .attr('viewBox', `0 0 ${containerWidth} ${chartHeight}`)
      .style('overflow', 'visible')

    svg.selectAll('*').remove()

    // Main group
    const g = svg.append('g')
      .attr('transform', `translate(${margin.left},${margin.top})`)

    // Draw X-Axis (Grid lines and labels)
    const axisG = g.append('g')
      .attr('class', 'x-axis')
      .attr('transform', `translate(${labelWidth},0)`)

    // Grid lines (subtle)
    axisG.selectAll('line.grid')
      .data(tickValues)
      .enter().append('line')
      .attr('class', 'grid')
      .attr('x1', d => x(d))
      .attr('x2', d => x(d))
      .attr('y1', 0)
      .attr('y2', rows.length * barStep)
      .attr('stroke', 'var(--border-base)')
      .attr('stroke-dasharray', '2,2')
      .attr('opacity', 0.5)

    // Axis Ticks
    const axisLabels = axisG.selectAll('text.tick-label')
      .data(tickValues)
      .enter().append('text')
      .attr('class', 'tick-label')
      .attr('x', d => x(d))
      .attr('y', -10)
      .attr('text-anchor', 'middle')
      .attr('fill', 'var(--text-tertiary)')
      .style('font-size', '10px')
      .style('font-weight', '600')
      .text(d => d.toLocaleString())

    // Row rendering
    const rowG = g.selectAll('g.row')
      .data(rows, (d: any) => d.data.name)
      .enter().append('g')
      .attr('class', 'row')
      .attr('transform', (d, i) => `translate(0,${i * barStep})`)
      .style('cursor', d => d.children && d.children.length > 0 ? 'pointer' : 'default')
      .on('click', (event, d) => {
        event.stopPropagation()
        if (d.children && d.children.length > 0) {
          setCurrentPath([...currentPath, d.data.name])
        }
      })

    // Hover background highlight
    rowG.append('rect')
      .attr('class', 'hover-bg')
      .attr('x', -margin.left)
      .attr('y', -4)
      .attr('width', containerWidth)
      .attr('height', barStep)
      .attr('fill', 'var(--brand-primary)')
      .attr('opacity', 0)
      .attr('rx', 4)
      .style('transition', 'opacity 0.2s')

    rowG.on('mouseenter', function() {
      d3.select(this).select('.hover-bg').attr('opacity', 0.05)
      d3.select(this).select('.bar-rect').attr('fill', 'var(--brand-primary)')
    })
    .on('mouseleave', function() {
      d3.select(this).select('.hover-bg').attr('opacity', 0)
      d3.select(this).select('.bar-rect').attr('fill', d => (d as any).children ? 'var(--brand-primary)' : '#60a5fa')
    })

    // 1. Category Label (Column 1)
    rowG.append('text')
      .attr('class', 'category-label')
      .attr('x', 0)
      .attr('y', barHeight / 2)
      .attr('dy', '0.35em')
      .attr('fill', 'var(--text-secondary)')
      .style('font-size', isMobile ? '10px' : '11px')
      .style('font-weight', '600')
      .text(d => {
        const name = d.data.name
        const limit = isMobile ? 12 : 20
        return name.length > limit ? name.slice(0, limit - 2) + '...' : name
      })

    // 2. Bar (Column 2)
    const barGroup = rowG.append('g')
      .attr('transform', `translate(${labelWidth},0)`)

    barGroup.append('rect')
      .attr('class', 'bar-rect')
      .attr('x', 0)
      .attr('y', 0)
      .attr('width', 0) // Start at 0 for animation
      .attr('height', barHeight)
      .attr('rx', 4)
      .attr('fill', d => d.children && d.children.length > 0 ? 'var(--brand-primary)' : '#60a5fa')
      .transition()
      .duration(600)
      .attr('width', d => Math.max(4, x(d.value || 0)))

    // 3. Value Label (Column 3)
    rowG.append('text')
      .attr('class', 'value-text')
      .attr('x', labelWidth + plotWidth + 10)
      .attr('y', barHeight / 2)
      .attr('dy', '0.35em')
      .attr('text-anchor', 'start')
      .attr('fill', 'var(--brand-primary)')
      .style('font-size', '11px')
      .style('font-weight', '700')
      .text(d => (d.value || 0).toLocaleString())

  }, [dimensions.width, rows, currentPath])

  return (
    <div className="relative pt-4 w-full" ref={containerRef}>
      <div className="flex items-center gap-3 mb-6 absolute -top-12 left-0 w-full justify-between pr-4 bg-[var(--surface-glass)] backdrop-blur-sm py-2 z-20">
        <div className="flex items-center gap-2 overflow-hidden">
          {currentPath.length > 1 && (
            <button 
              onClick={() => setCurrentPath(currentPath.slice(0, -1))}
              className="flex-shrink-0 group flex items-center gap-1 px-3 py-1 bg-[var(--surface-2)] text-[var(--text-primary)] rounded-full text-[10px] font-bold uppercase tracking-wider hover:bg-blue-600 hover:text-white transition-all duration-300"
            >
              <svg xmlns="http://www.w3.org/2000/svg" className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M15 19l-7-7 7-7" />
              </svg>
              Back
            </button>
          )}
          <div className="flex items-center gap-1 flex-wrap overflow-hidden">
            {currentPath.map((path, i) => (
              <React.Fragment key={path}>
                {i > 0 && <span className="text-[var(--border-base)]">/</span>}
                <span className={`text-[10px] sm:text-[11px] font-bold uppercase tracking-widest truncate max-w-[100px] ${i === currentPath.length - 1 ? 'text-blue-600' : 'text-[var(--text-tertiary)]'}`}>
                  {path === 'root' ? 'All' : path}
                </span>
              </React.Fragment>
            ))}
          </div>
        </div>
      </div>

      <div className="mb-4 pr-10">
        <h3 className="text-[12px] sm:text-[13px] font-extrabold text-[var(--text-primary)] uppercase tracking-wide leading-tight">
          {currentPath.length === 1 ? 'Sales by Category' : `Top Products in ${currentPath[currentPath.length - 1]}`}
        </h3>
      </div>
      
      <div className="overflow-x-hidden min-h-[350px]">
        <svg ref={svgRef} className="block w-full"></svg>
      </div>
      
      {currentPath.length === 1 && (
        <div className="mt-4 flex justify-end">
          <p className="text-[10px] text-[var(--text-tertiary)] italic bg-[var(--surface-glass)] px-2 py-1 rounded">
            Click any category to view products
          </p>
        </div>
      )}
    </div>
  )
}
