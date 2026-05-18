'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useState, useEffect, useRef } from 'react'
import { Search, ShoppingCart, User, Menu, X, Heart, Sun, Moon } from 'lucide-react'
import { useCart, useTheme, useStoreConfig } from '@/components/providers'
import { Input } from '@/components/atoms/Input/Input'
import { Button } from '@/components/atoms/Button/Button'

interface Category {
  name: string
  slug: string
}

interface ProductSuggestion {
  id: string
  name: string
  slug: string
  price: string
  category?: { name: string; slug: string }
}

export function Topbar() {
  const router = useRouter()
  const [isMenuOpen, setIsMenuOpen] = useState(false)
  const [searchQuery, setSearchQuery] = useState('')
  const [suggestions, setSuggestions] = useState<ProductSuggestion[]>([])
  const [isSuggestionsOpen, setIsSuggestionsOpen] = useState(false)
  const [isFetchingSuggestions, setIsFetchingSuggestions] = useState(false)
  const [activeSuggestionIndex, setActiveSuggestionIndex] = useState(-1)
  const { totalItems } = useCart()
  const { theme, toggleTheme } = useTheme()
  const config = useStoreConfig()
  const [categories, setCategories] = useState<Category[]>([])
  const searchContainerRef = useRef<HTMLDivElement | null>(null)

  useEffect(() => {
    fetch('/api/v1/categories')
      .then(res => res.json())
      .then(data => {
        if (data.success) {
          setCategories(data.data)
        }
      })
      .catch(console.error)
  }, [])

  useEffect(() => {
    const query = searchQuery.trim()
    if (query.length < 2) {
      setSuggestions([])
      setIsFetchingSuggestions(false)
      setActiveSuggestionIndex(-1)
      return
    }

    const timeoutId = setTimeout(async () => {
      try {
        setIsFetchingSuggestions(true)
        const res = await fetch(`/api/v1/products/suggestions?q=${encodeURIComponent(query)}&limit=8`)
        const data = await res.json()
        setSuggestions(data.data || [])
        setActiveSuggestionIndex(-1)
      } catch (error) {
        console.error(error)
        setSuggestions([])
      } finally {
        setIsFetchingSuggestions(false)
      }
    }, 220)

    return () => clearTimeout(timeoutId)
  }, [searchQuery])

  useEffect(() => {
    const handleOutsideClick = (event: MouseEvent) => {
      if (!searchContainerRef.current) return
      if (!searchContainerRef.current.contains(event.target as Node)) {
        setIsSuggestionsOpen(false)
        setActiveSuggestionIndex(-1)
      }
    }

    document.addEventListener('mousedown', handleOutsideClick)
    return () => document.removeEventListener('mousedown', handleOutsideClick)
  }, [])

  const goToSearchResults = (query: string) => {
    const value = query.trim()
    if (!value) {
      router.push('/products')
      return
    }
    router.push(`/products?search=${encodeURIComponent(value)}`)
  }

  const selectSuggestion = (slug: string) => {
    setIsSuggestionsOpen(false)
    setIsMenuOpen(false)
    setActiveSuggestionIndex(-1)
    router.push(`/products/${slug}`)
  }

  const onSearchSubmit = (event: React.FormEvent) => {
    event.preventDefault()
    if (activeSuggestionIndex >= 0 && suggestions[activeSuggestionIndex]) {
      selectSuggestion(suggestions[activeSuggestionIndex].slug)
      return
    }
    setIsSuggestionsOpen(false)
    setIsMenuOpen(false)
    goToSearchResults(searchQuery)
  }

  const onSearchKeyDown = (event: React.KeyboardEvent<HTMLInputElement>) => {
    if (!isSuggestionsOpen || suggestions.length === 0) {
      if (event.key === 'Enter') {
        setIsSuggestionsOpen(false)
      }
      return
    }

    if (event.key === 'ArrowDown') {
      event.preventDefault()
      setActiveSuggestionIndex(prev => (prev + 1) % suggestions.length)
      return
    }

    if (event.key === 'ArrowUp') {
      event.preventDefault()
      setActiveSuggestionIndex(prev => (prev <= 0 ? suggestions.length - 1 : prev - 1))
      return
    }

    if (event.key === 'Escape') {
      setIsSuggestionsOpen(false)
      setActiveSuggestionIndex(-1)
      return
    }
  }

  return (
    <header className="sticky top-0 z-40 border-b border-[var(--border-subtle)] backdrop-blur-xl bg-[var(--surface-glass)]">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-16 md:h-[72px]">
          
          {/* Logo */}
          <Link href="/" className="flex items-center gap-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-primary rounded-md">
            <span className="text-2xl md:text-3xl font-black tracking-tight text-[var(--text-primary)] transition-colors hover:text-[var(--brand-primary)]">
              {config.store.name}
            </span>
          </Link>

          {/* Search - Desktop */}
          <div className="hidden md:flex flex-1 max-w-md mx-8 relative" ref={searchContainerRef}>
            <form className="relative w-full" onSubmit={onSearchSubmit} role="search">
              <Input
                type="text"
                placeholder="Search products..."
                value={searchQuery}
                onFocus={() => setIsSuggestionsOpen(true)}
                onChange={(e) => {
                  setSearchQuery(e.target.value)
                  setIsSuggestionsOpen(true)
                }}
                onKeyDown={onSearchKeyDown}
                leftIcon={<Search className="w-4 h-4" />}
                className="w-full focus-visible:ring-2 focus-visible:ring-brand-primary"
                aria-label="Search products"
                aria-autocomplete="list"
                aria-expanded={isSuggestionsOpen}
              />
              
              {isSuggestionsOpen && (
                <div className="absolute top-[calc(100%+8px)] w-full rounded-xl border border-[var(--border-subtle)] backdrop-blur-xl shadow-xl z-50 max-h-96 overflow-y-auto bg-[var(--surface-glass)]" role="listbox">
                  {isFetchingSuggestions && (
                    <div className="px-4 py-3 text-sm text-[var(--text-secondary)]">Searching...</div>
                  )}
                  {!isFetchingSuggestions && suggestions.length === 0 && searchQuery.trim().length >= 2 && (
                    <div className="px-4 py-3 text-sm text-[var(--text-secondary)]">No matching products</div>
                  )}
                  {!isFetchingSuggestions && suggestions.map((suggestion, index) => (
                    <button
                      key={suggestion.id}
                      type="button"
                      role="option"
                      aria-selected={index === activeSuggestionIndex}
                      onMouseDown={(event) => event.preventDefault()}
                      onClick={() => selectSuggestion(suggestion.slug)}
                      className={`w-full px-4 py-3 text-left transition-colors cursor-pointer hover:bg-[var(--surface-1)] focus-visible:bg-[var(--surface-2)] focus-visible:outline-none ${index === activeSuggestionIndex ? 'bg-[var(--surface-2)]' : ''}`}
                    >
                      <p className="text-sm font-medium text-[var(--text-primary)]">{suggestion.name}</p>
                      <p className="text-xs text-[var(--text-secondary)] mt-0.5">
                        {suggestion.category?.name || 'Product'} · ₹{suggestion.price}
                      </p>
                    </button>
                  ))}
                  {searchQuery.trim().length >= 2 && (
                    <button
                      type="button"
                      onMouseDown={(event) => event.preventDefault()}
                      onClick={() => {
                        setIsSuggestionsOpen(false)
                        goToSearchResults(searchQuery)
                      }}
                      className="w-full border-t border-[var(--border-subtle)] px-4 py-3 text-sm font-medium text-[var(--brand-primary)] text-left hover:bg-[var(--surface-1)] transition-colors focus-visible:outline-none focus-visible:bg-[var(--surface-1)]"
                    >
                      See all results for "{searchQuery.trim()}"
                    </button>
                  )}
                </div>
              )}
            </form>
          </div>

          {/* Actions - Desktop */}
          <div className="flex items-center gap-1 md:gap-3">
            <Button variant="ghost" size="sm" onClick={toggleTheme} className="rounded-full px-2 focus-visible:ring-2 focus-visible:ring-brand-primary" aria-label="Toggle theme">
              {theme === 'dark' ? <Moon className="w-6 h-6" /> : <Sun className="w-6 h-6" />}
            </Button>
            <Link href="/wishlist" className="focus-visible:outline-none rounded-full">
              <Button variant="ghost" size="sm" className="rounded-full px-2 focus-visible:ring-2 focus-visible:ring-brand-primary" aria-label="Wishlist">
                <Heart className="w-6 h-6" />
              </Button>
            </Link>
            <Link href="/cart" className="focus-visible:outline-none rounded-full">
              <Button variant="ghost" size="sm" className="rounded-full px-2 relative focus-visible:ring-2 focus-visible:ring-brand-primary" aria-label={`Cart with ${totalItems} items`}>
                <ShoppingCart className="w-6 h-6" />
                {totalItems > 0 && (
                  <span className="absolute top-0 -right-0.5 w-[18px] h-[18px] bg-red-500 text-white text-[10px] font-bold rounded-full flex items-center justify-center border-2 border-[var(--surface-0)]">{totalItems}</span>
                )}
              </Button>
            </Link>
            <Link href="/account" className="focus-visible:outline-none rounded-full">
              <Button variant="ghost" size="sm" className="rounded-full px-2 focus-visible:ring-2 focus-visible:ring-brand-primary" aria-label="Account">
                <User className="w-6 h-6" />
              </Button>
            </Link>

            {/* Mobile Menu Button */}
            <button
              onClick={() => setIsMenuOpen(!isMenuOpen)}
              className="md:hidden p-2 text-[var(--text-secondary)] hover:bg-[var(--surface-2)] rounded-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-primary"
              aria-expanded={isMenuOpen}
              aria-label="Toggle menu"
            >
              {isMenuOpen ? <X className="w-6 h-6" /> : <Menu className="w-6 h-6" />}
            </button>
          </div>
        </div>

        {/* Mobile Menu */}
        {isMenuOpen && (
          <div className="md:hidden py-4 border-t border-[var(--border-subtle)]">
            <form className="relative mb-6" onSubmit={onSearchSubmit} role="search">
              <Input
                type="text"
                placeholder="Search products..."
                value={searchQuery}
                onFocus={() => setIsSuggestionsOpen(true)}
                onChange={(e) => {
                  setSearchQuery(e.target.value)
                  setIsSuggestionsOpen(true)
                }}
                onKeyDown={onSearchKeyDown}
                leftIcon={<Search className="w-4 h-4" />}
                className="w-full focus-visible:ring-2 focus-visible:ring-brand-primary"
                aria-label="Search products mobile"
              />
              {isSuggestionsOpen && (
                <div className="absolute top-[calc(100%+8px)] w-full rounded-xl border border-[var(--border-subtle)] backdrop-blur-xl shadow-xl z-50 max-h-96 overflow-y-auto bg-[var(--surface-glass)]">
                  {isFetchingSuggestions && (
                    <div className="px-4 py-3 text-sm text-[var(--text-secondary)]">Searching...</div>
                  )}
                  {!isFetchingSuggestions && suggestions.length === 0 && searchQuery.trim().length >= 2 && (
                    <div className="px-4 py-3 text-sm text-[var(--text-secondary)]">No matching products</div>
                  )}
                  {!isFetchingSuggestions && suggestions.map((suggestion, index) => (
                    <button
                      key={suggestion.id}
                      type="button"
                      onMouseDown={(event) => event.preventDefault()}
                      onClick={() => selectSuggestion(suggestion.slug)}
                      className={`w-full px-4 py-3 text-left transition-colors cursor-pointer hover:bg-[var(--surface-1)] focus-visible:bg-[var(--surface-2)] focus-visible:outline-none ${index === activeSuggestionIndex ? 'bg-[var(--surface-2)]' : ''}`}
                    >
                      <p className="text-sm font-medium text-[var(--text-primary)]">{suggestion.name}</p>
                      <p className="text-xs text-[var(--text-secondary)] mt-0.5">
                        {suggestion.category?.name || 'Product'} · ₹{suggestion.price}
                      </p>
                    </button>
                  ))}
                  {searchQuery.trim().length >= 2 && (
                    <button
                      type="button"
                      onMouseDown={(event) => event.preventDefault()}
                      onClick={() => {
                        setIsSuggestionsOpen(false)
                        setIsMenuOpen(false)
                        goToSearchResults(searchQuery)
                      }}
                      className="w-full border-t border-[var(--border-subtle)] px-4 py-3 text-sm font-medium text-[var(--brand-primary)] text-left hover:bg-[var(--surface-1)] transition-colors focus-visible:outline-none focus-visible:bg-[var(--surface-1)]"
                    >
                      See all results for "{searchQuery.trim()}"
                    </button>
                  )}
                </div>
              )}
            </form>
            
            <nav className="space-y-1" aria-label="Mobile navigation">
              <Link href="/" className="block px-4 py-3 text-base font-medium text-[var(--text-secondary)] hover:bg-[var(--surface-2)] hover:text-[var(--text-primary)] rounded-xl transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-primary" onClick={() => setIsMenuOpen(false)}>
                Home
              </Link>
              <Link href="/products" className="block px-4 py-3 text-base font-medium text-[var(--text-secondary)] hover:bg-[var(--surface-2)] hover:text-[var(--text-primary)] rounded-xl transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-primary" onClick={() => setIsMenuOpen(false)}>
                Products
              </Link>
              <Link href="/wishlist" className="block px-4 py-3 text-base font-medium text-[var(--text-secondary)] hover:bg-[var(--surface-2)] hover:text-[var(--text-primary)] rounded-xl transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-primary" onClick={() => setIsMenuOpen(false)}>
                Wishlist
              </Link>
              <Link href="/cart" className="block px-4 py-3 text-base font-medium text-[var(--text-secondary)] hover:bg-[var(--surface-2)] hover:text-[var(--text-primary)] rounded-xl transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-primary" onClick={() => setIsMenuOpen(false)}>
                Cart ({totalItems})
              </Link>
              <Link href="/account" className="block px-4 py-3 text-base font-medium text-[var(--text-secondary)] hover:bg-[var(--surface-2)] hover:text-[var(--text-primary)] rounded-xl transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-primary" onClick={() => setIsMenuOpen(false)}>
                Account
              </Link>
              <button
                onClick={() => { toggleTheme(); setIsMenuOpen(false) }}
                className="w-full text-left block px-4 py-3 text-base font-medium text-[var(--text-secondary)] hover:bg-[var(--surface-2)] hover:text-[var(--text-primary)] rounded-xl transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-primary"
              >
                {theme === 'dark' ? 'Switch to Light Mode' : 'Switch to Dark Mode'}
              </button>
            </nav>
          </div>
        )}
      </div>

      {/* Category Nav - Desktop */}
      <nav className="hidden md:block border-t border-[var(--border-subtle)] backdrop-blur-md bg-[var(--surface-glass)]" aria-label="Category navigation">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center gap-1 overflow-x-auto py-1 scrollbar-hide">
            <Link href="/products" className="text-xs font-medium text-[var(--text-secondary)] hover:text-[var(--brand-primary)] hover:bg-[var(--surface-1)] px-4 py-2 rounded-full whitespace-nowrap transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-primary">
              All Products
            </Link>
            {categories.map(category => (
              <Link
                key={category.slug}
                href={`/products?category=${category.slug}`}
                className="text-xs font-medium text-[var(--text-secondary)] hover:text-[var(--brand-primary)] hover:bg-[var(--surface-1)] px-4 py-2 rounded-full whitespace-nowrap transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-primary"
              >
                {category.name}
              </Link>
            ))}
          </div>
        </div>
      </nav>
    </header>
  )
}
