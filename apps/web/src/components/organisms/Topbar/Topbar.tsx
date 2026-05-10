'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useState, useEffect, useRef } from 'react'
import { Search, ShoppingCart, User, Menu, X, Heart, Sun, Moon } from 'lucide-react'
import { useCart, useTheme, useStoreConfig } from '@/components/providers'
import { Input } from '@/components/atoms/Input/Input'
import { Button } from '@/components/atoms/Button/Button'
import styles from './Topbar.module.css'

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
    <header className={styles.header}>
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className={styles.navRow}>
          
          {/* Logo */}
          <Link href="/" className="flex items-center gap-2">
            <span className={styles.logoText}>
              {config.store.name}
            </span>
          </Link>

          {/* Search - Desktop */}
          <div className={styles.searchContainer} ref={searchContainerRef}>
            <form className="relative w-full" onSubmit={onSearchSubmit}>
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
                className="w-full"
              />
              
              {isSuggestionsOpen && (
                <div className={styles.suggestionsDropdown}>
                  {isFetchingSuggestions && (
                    <div className={styles.emptyState}>Searching...</div>
                  )}
                  {!isFetchingSuggestions && suggestions.length === 0 && searchQuery.trim().length >= 2 && (
                    <div className={styles.emptyState}>No matching products</div>
                  )}
                  {!isFetchingSuggestions && suggestions.map((suggestion, index) => (
                    <button
                      key={suggestion.id}
                      type="button"
                      onMouseDown={(event) => event.preventDefault()}
                      onClick={() => selectSuggestion(suggestion.slug)}
                      className={`${styles.suggestionItem} ${index === activeSuggestionIndex ? styles.suggestionItemActive : ''}`}
                    >
                      <p className={styles.suggestionName}>{suggestion.name}</p>
                      <p className={styles.suggestionMeta}>
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
                      className={styles.seeAllBtn}
                    >
                      See all results for "{searchQuery.trim()}"
                    </button>
                  )}
                </div>
              )}
            </form>
          </div>

          {/* Actions - Desktop */}
          <div className={styles.actions}>
            <Button variant="ghost" size="sm" onClick={toggleTheme} className="rounded-full px-2">
              {theme === 'dark' ? <Moon className="w-6 h-6" /> : <Sun className="w-6 h-6" />}
            </Button>
            <Link href="/wishlist">
              <Button variant="ghost" size="sm" className="rounded-full px-2">
                <Heart className="w-6 h-6" />
              </Button>
            </Link>
            <Link href="/cart">
              <Button variant="ghost" size="sm" className="rounded-full px-2 relative">
                <ShoppingCart className="w-6 h-6" />
                {totalItems > 0 && (
                  <span className={styles.cartBadge}>{totalItems}</span>
                )}
              </Button>
            </Link>
            <Link href="/account">
              <Button variant="ghost" size="sm" className="rounded-full px-2">
                <User className="w-6 h-6" />
              </Button>
            </Link>
          </div>

          {/* Mobile Menu Button */}
          <button
            onClick={() => setIsMenuOpen(!isMenuOpen)}
            className={styles.mobileMenuBtn}
          >
            {isMenuOpen ? <X className="w-6 h-6" /> : <Menu className="w-6 h-6" />}
          </button>
        </div>

        {/* Mobile Menu */}
        {isMenuOpen && (
          <div className={styles.mobileMenu}>
            <form className="relative mb-6" onSubmit={onSearchSubmit}>
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
              />
              {isSuggestionsOpen && (
                <div className={styles.suggestionsDropdown}>
                  {isFetchingSuggestions && (
                    <div className={styles.emptyState}>Searching...</div>
                  )}
                  {!isFetchingSuggestions && suggestions.length === 0 && searchQuery.trim().length >= 2 && (
                    <div className={styles.emptyState}>No matching products</div>
                  )}
                  {!isFetchingSuggestions && suggestions.map((suggestion, index) => (
                    <button
                      key={suggestion.id}
                      type="button"
                      onMouseDown={(event) => event.preventDefault()}
                      onClick={() => selectSuggestion(suggestion.slug)}
                      className={`${styles.suggestionItem} ${index === activeSuggestionIndex ? styles.suggestionItemActive : ''}`}
                    >
                      <p className={styles.suggestionName}>{suggestion.name}</p>
                      <p className={styles.suggestionMeta}>
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
                      className={styles.seeAllBtn}
                    >
                      See all results for "{searchQuery.trim()}"
                    </button>
                  )}
                </div>
              )}
            </form>
            
            <nav className="space-y-1">
              <Link href="/" className={styles.mobileNavLink} onClick={() => setIsMenuOpen(false)}>
                Home
              </Link>
              <Link href="/products" className={styles.mobileNavLink} onClick={() => setIsMenuOpen(false)}>
                Products
              </Link>
              <Link href="/wishlist" className={styles.mobileNavLink} onClick={() => setIsMenuOpen(false)}>
                Wishlist
              </Link>
              <Link href="/cart" className={styles.mobileNavLink} onClick={() => setIsMenuOpen(false)}>
                Cart ({totalItems})
              </Link>
              <Link href="/account" className={styles.mobileNavLink} onClick={() => setIsMenuOpen(false)}>
                Account
              </Link>
              <button
                onClick={() => { toggleTheme(); setIsMenuOpen(false) }}
                className={styles.mobileNavLink}
              >
                {theme === 'dark' ? 'Switch to Light Mode' : 'Switch to Dark Mode'}
              </button>
            </nav>
          </div>
        )}
      </div>

      {/* Category Nav - Desktop */}
      <nav className={styles.categoryBar}>
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className={styles.categoryList}>
            <Link href="/products" className={styles.categoryLink}>
              All Products
            </Link>
            {categories.map(category => (
              <Link
                key={category.slug}
                href={`/products?category=${category.slug}`}
                className={styles.categoryLink}
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
